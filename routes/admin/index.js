const express = require('express');
const { db } = require('../../db');
const { STATUS } = require('../../lib/i18n');
const auditLib = require('../../lib/audit');
const notify = require('../../lib/notify');
const { visibleRequestFilter } = require('../../lib/access');
const { requireAuth, requireAdmin, requireStaff, can } = require('../../middleware/auth');
const { requireModule } = require('../../lib/entitlements');

const router = express.Router();

// Routes build their redirects from this rather than a hard-coded "/admin",
// so moving the panel needs no code changes anywhere else.
router.use((req, res, next) => {
  req.adminPath = res.locals.adminPath;
  next();
});

// Login pages must stay reachable without a session.
router.use('/', require('./auth'));

// Everything past this point requires a signed-in, active account.
router.use(requireAuth);

// The unread badge appears in the sidebar on every admin page.
router.use((req, res, next) => {
  res.locals.unseenCount = notify.unseenCount(req.session.user.id);
  res.locals.isPlatformOwner = false;
  res.locals.platformOwnerAccess = false;
  res.locals.pendingSubscriptions = 0;
  res.locals.undoWindowDays = require('../../lib/trash').UNDO_WINDOW_DAYS;
  const today=new Date().toISOString().slice(0,10),soon=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  res.locals.renewalCount=db.prepare(`SELECT COUNT(*) c FROM requests WHERE archived_at IS NULL AND COALESCE(renewal_on,expires_on) BETWEEN ? AND ?`).get(today,soon).c;
  next();
});

// ---------------------------------------------------------------- dashboard
router.get('/', (req, res) => {
  // Accounting is intentionally a financial-only role.  Sending it straight
  // to the revenue workspace avoids rendering an operational dashboard whose
  // links it is not allowed to follow.
  if (req.session.user.role === 'accountant') {
    return res.redirect(req.adminPath + '/revenue');
  }
  const user = req.session.user;
  const vis = visibleRequestFilter(user);
  const showMoney = req.userCan('money.view');

  const now = new Date();
  const period = ['today','week','month','custom'].includes(req.query.period) ? req.query.period : 'month';
  const iso = (d) => d.toISOString().slice(0,10);
  let from = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), to = iso(now);
  if (period === 'today') from = to;
  if (period === 'week') { const d = new Date(now); d.setUTCDate(d.getUTCDate()-6); from=iso(d); }
  if (period === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from||'') && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to||'')) { from=req.query.from; to=req.query.to; }
  const branchId = Number(req.query.branch_id)||0, staffId=Number(req.query.staff_id)||0;
  const filterSql = `${branchId?' AND r.branch_id=?':''}${staffId?' AND EXISTS(SELECT 1 FROM request_assignees fa WHERE fa.request_id=r.id AND fa.user_id=?)':''}`;
  const filterParams = [...(branchId?[branchId]:[]),...(staffId?[staffId]:[])];

  const scoped = (extra = '', params = []) =>
    db
      .prepare(`SELECT COUNT(*) c FROM requests r WHERE r.archived_at IS NULL ${extra} ${filterSql} ${vis.sql}`)
      .get(...params, ...filterParams, ...vis.params).c;

  const total = scoped();

  const byStatus = {};
  Object.keys(STATUS).forEach((k) => {
    byStatus[k] = scoped('AND r.status = ?', [k]);
  });

  /*
   * Same visibility and branch/staff scope as the request counts above, and
   * the same "owed" formula the clients and revenue pages use
   * (total − discount − written off − paid, floored at 0 per request). This
   * used to be a flat SUM(total_amount) − SUM(paid_amount) with no scoping at
   * all, which both leaked totals across staff who cannot see every request
   * and overstated what is actually still owed once a discount or a written-
   * off debt was recorded.
   */
  const sums = showMoney
    ? db
        .prepare(
          `SELECT COALESCE(SUM(r.total_amount),0) t, COALESCE(SUM(r.paid_amount),0) p,
                  COALESCE(SUM(MAX(0, r.total_amount - COALESCE(r.discount,0) - COALESCE(r.written_off,0) - r.paid_amount)),0) owed
           FROM requests r WHERE r.archived_at IS NULL ${filterSql} ${vis.sql}`
        )
        .get(...filterParams, ...vis.params)
    : { t: 0, p: 0, owed: 0 };
  const financial = showMoney ? {
    treasury: Number(db.prepare(`SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE -amount END),0) v FROM treasury_transactions WHERE voided_at IS NULL AND approval_status='approved'`).get().v),
    custody: Number(db.prepare(`SELECT COALESCE(SUM(c.amount-COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.custody_id=c.id AND e.voided_at IS NULL),0)-COALESCE((SELECT SUM(cr.amount) FROM custody_returns cr WHERE cr.custody_id=c.id AND cr.voided_at IS NULL),0)),0) v FROM staff_custodies c WHERE c.voided_at IS NULL`).get().v),
    revenue: Number(db.prepare(`SELECT COALESCE(SUM(amount),0) v FROM payments WHERE voided_at IS NULL AND paid_on BETWEEN ? AND ?`).get(from,to).v),
    expenses: Number(db.prepare(`SELECT COALESCE(SUM(amount),0) v FROM expenses WHERE voided_at IS NULL AND spent_on BETWEEN ? AND ?`).get(from,to).v),
  } : { treasury:0,custody:0,revenue:0,expenses:0 };

  const today = new Date().toISOString().slice(0, 10);

  /**
   * Deadlines, in two parts.
   *
   * Overdue work is shown whatever window is selected: a date that slipped four
   * months ago has not become less urgent because somebody is looking at this
   * week. Filtering it out is precisely how it gets forgotten.
   *
   * The window applies only to what is still ahead — that is the part where
   * "how far should I be looking" is a real question.
   */
  const HORIZONS = { week: 7, month: 30, quarter: 90, half: 180 };
  const horizon = HORIZONS[req.query.due] ? req.query.due : 'month';
  const horizonDays = HORIZONS[horizon];

  const until = new Date();
  until.setDate(until.getDate() + horizonDays);
  const untilDate = until.toISOString().slice(0, 10);

  const overdueList = db
    .prepare(
      `SELECT r.* FROM requests r
       WHERE r.archived_at IS NULL AND r.deadline IS NOT NULL
         AND r.status NOT IN ('completed','cancelled')
         AND r.deadline < ? ${vis.sql}
       ORDER BY r.deadline LIMIT 20`
    )
    .all(today, ...vis.params);

  const upcomingList = db
    .prepare(
      `SELECT r.* FROM requests r
       WHERE r.archived_at IS NULL AND r.deadline IS NOT NULL
         AND r.status NOT IN ('completed','cancelled')
         AND r.deadline >= ? AND r.deadline <= ? ${vis.sql}
       ORDER BY r.deadline LIMIT 50`
    )
    .all(today, untilDate, ...vis.params);

  // Kept for anything still reading the combined list.
  const dueList = [...overdueList, ...upcomingList];

  const recent = db
    .prepare(
      `SELECT r.* FROM requests r WHERE r.archived_at IS NULL ${vis.sql} ORDER BY r.id DESC LIMIT 8`
    )
    .all(...vis.params);

  res.render('admin/dashboard', {
    total,
    byStatus,
    collected: sums.p,
    remaining: sums.owed,
    totalAmount: sums.t,
    showMoney,
    financial,
    period, from, to, branchId, staffId,
    branches: db.prepare('SELECT b.id,b.name,c.name company_name FROM company_branches b JOIN companies c ON c.id=b.company_id WHERE b.active=1 ORDER BY c.name,b.name').all(),
    staffFilter: db.prepare("SELECT id,display_name FROM users WHERE active=1 ORDER BY display_name").all(),
    recent,
    dueList,
    overdueList,
    upcomingList,
    horizon,
    horizonDays,
    today,
    notifications: notify.listFor(user.id, { onlyUnseen: true, limit: 8 }),
    activity: req.userCan('activity.view') ? auditLib.recent({ limit: 10 }) : [],
    attention: {
      renewals: res.locals.renewalCount,
      overdue: overdueList.length,
      todayTasks: db.prepare(`SELECT COUNT(*) c FROM agenda_events WHERE status!='completed' AND substr(starts_at,1,10)=?`).get(today).c,
    },

    /*
     * Requests nobody has picked up.
     *
     * Shown to whoever can assign, because seeing a forgotten file is only
     * useful to somebody who can do something about it.
     */
    unclaimed: req.userCan('requests.assign')
      ? require('../../lib/deadlines').unclaimed({ limit: 12 })
      : [],
  });
});

// ---------------------------------------------------------------- activity log
router.get('/activity', requireModule('security'), can('activity.view'), (req, res) => {
  const action = (req.query.action || '').trim();
  const entries = auditLib.recent({ action, limit: 300 });
  const users = db
    .prepare('SELECT DISTINCT user_label FROM audit_log WHERE user_label IS NOT NULL')
    .all();
  res.render('admin/activity', { entries, action, users });
});

router.use('/notifications', require('./notifications'));
router.use('/requests', requireModule('requests'), requireStaff, require('./requests'));
router.use('/agenda', requireModule('agenda'), require('./agenda'));
router.use('/appointments', requireModule('bookings'), require('./bookings'));
router.use('/renewals', requireModule('renewals'), require('./renewals'));
router.use('/performance', requireModule('performance'), require('./performance'));
router.use('/payroll', requireModule('payroll'), require('./payroll'));
router.use('/support', requireModule('support'), require('./support'));
router.use('/cases', requireModule('cases'), require('./cases'));
router.use('/clients', requireModule('clients'), require('./client'));
router.use('/revenue', requireModule('revenue'), require('./revenue'));
router.use('/treasury', requireModule('treasury'), require('./treasury'));
router.use('/expenses', requireModule('expenses'), require('./expenses'));
router.use('/errands', requireModule('errands'), require('./errands'));
router.use('/contacts', require('./contacts'));
router.use('/trash', require('./trash'));
router.use('/consultations-admin', requireModule('consultations'), require('./consultations'));
router.use('/security', requireModule('security'), require('./security'));
router.use('/content', requireModule('content'), require('./content'));
router.use('/homepage', requireModule('content'), require('./homepage'));
router.use('/social', requireModule('content'), require('./social'));
router.use('/settings', requireModule('settings'), require('./settings'));
router.use('/report-profiles', requireModule('reports'), require('./report_profiles'));
router.use('/users', requireModule('employees'), require('./users'));
router.use('/imports', requireModule('imports'), require('./imports'));
router.use('/account', require('./account'));

module.exports = router;
