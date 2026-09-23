const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../../db');
const audit = require('../../lib/audit');
const notify = require('../../lib/notify');
const permissions = require('../../lib/permissions');
const security = require('../../lib/security');
const pw = require('../../lib/password');
const mailer = require('../../lib/mailer');
const sms = require('../../lib/sms');
const accessCardPdf = require('../../lib/access-card-pdf');
const { can } = require('../../middleware/auth');
const tenantPolicy = require('../../lib/tenant-policy');

const router = express.Router();
/*
 * Reading a staff file and changing one are different rights.
 *
 * The router used to require `users.manage` for every route, so a supervisor
 * who needed to look somebody up had to be trusted to edit accounts. The read
 * routes now ask for `users.view`; everything that writes still asks for
 * `users.manage` on its own line.
 */
router.use((req, res, next) => {
  if (!req.session.user) return res.redirect(req.adminPath + '/login');
  if (req.userCan('users.view') || req.userCan('users.manage')) return next();
  return res.status(403).render('admin/denied');
});

const ROLE_AR = { admin: 'أدمن', supervisor: 'مشرف', lawyer: 'محامي', accountant: 'محاسب' };

const me = (req) => req.session.user.display_name || req.session.user.username;


router.get('/', (req, res) => {
  const users = db
    .prepare(
      `SELECT users.id, username, display_name, legal_name, job_title, role, email, phone, users.active, profile_completed,
              must_change_password, users.created_at, created_by, deactivated_at, ob.name AS branch_name, is_super_admin
       ,
        (SELECT COUNT(*) FROM user_permissions up WHERE up.user_id = users.id) AS exception_count
       FROM users LEFT JOIN office_branches ob ON ob.id = users.office_branch_id
       ORDER BY role, users.id`
    )
    .all();

  res.render('admin/users', {
    users,
    catalogue: permissions.CATALOGUE,
    roleDefaults: permissions.ROLE_DEFAULTS,
    allPermissions: permissions.ALL,
    idRequired: require('../../lib/profile').idCardRequired(),
    msg: req.query.msg,
    err: req.query.err,
    errText: req.query.errText ? decodeURIComponent(req.query.errText) : null,
    minPassword: pw.MIN_LENGTH,
    rules: pw.describe('ar'),
  });
});

const staffReportRows=()=>db.prepare(`SELECT display_name,legal_name,username,role,email,phone,national_id,birth_date,active,created_at FROM users ORDER BY active DESC,display_name`).all();
router.get('/export.csv',can('users.export'),(req,res)=>{const rows=staffReportRows();require('../../lib/reporting').csv(res,'sanad-employees',['الاسم','الاسم الرسمي','المستخدم','الدور','البريد','رقم الموبايل','الرقم القومي','الميلاد','الحالة','تاريخ الإضافة'],rows.map(r=>[r.display_name,r.legal_name,r.username,ROLE_AR[r.role]||r.role,r.email,r.phone,r.national_id,r.birth_date,r.active?'نشط':'موقوف',r.created_at]))});
router.get('/print',can('users.export'),(req,res)=>{const rows=staffReportRows();require('../../lib/reporting').print(res,'تقرير الموظفين',['الاسم','المستخدم','الدور','رقم الموبايل','البريد','الحالة'],rows.map(r=>[r.display_name,r.username,ROLE_AR[r.role]||r.role,r.phone,r.email,r.active?'نشط':'موقوف']))});

/**
 * Creating a staff account.
 *
 * Only a username and a password: everything else — legal name, short name,
 * contact details, ID card — is filled in by the person themselves on first
 * sign-in. An admin typing somebody else's national number from memory is how
 * records end up wrong, and the account is gated until the person completes it
 * anyway.
 */
router.post('/new', can('users.manage'), (req, res) => {
  const username = (req.body.username || '').trim().toLowerCase();
  const password = req.body.password || '';
  const requestedRole = ['admin', 'supervisor', 'lawyer', 'accountant'].includes(req.body.role)
    ? req.body.role
    : 'lawyer';
  // Creating a brand-new admin-tier peer is a Super Admin's call, same as
  // promoting one — otherwise a regular admin could route around that limit
  // by minting a fresh unrestricted account instead of editing an existing one.
  const role = (requestedRole === 'admin' && !permissions.isSuperAdmin(req.user)) ? 'lawyer' : requestedRole;

  if (!username) return res.redirect(req.adminPath + '/users?err=missing');
  if (!/^[a-z0-9._-]+$/.test(username)) return res.redirect(req.adminPath + '/users?err=username');
  if (password !== (req.body.password_confirm || ''))
    return res.redirect(req.adminPath + '/users?err=mismatch');

  const weak = pw.firstMessage(password, { lang: 'ar', username });
  if (weak) {
    return res.redirect(`${req.adminPath}/users?err=weak&errText=${encodeURIComponent(weak)}`);
  }

  const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
  if (exists) return res.redirect(req.adminPath + '/users?err=taken');
  const quota = tenantPolicy.allowance('users', 1);
  if (!quota.allowed) return res.status(402).render('errors/subscription', {
    license: tenantPolicy.license(), status: 'limit', expired: false, layout: false,
  });

  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, role, display_name, active,
                          must_change_password, profile_completed, created_by)
       VALUES (?,?,?,?,1,1,0,?)`
    )
    .run(username, bcrypt.hashSync(password, 10), role, username, me(req));

  /*
   * Permissions chosen while creating the account.
   *
   * Setting them here rather than on a second screen means a new person is
   * correct from their first sign-in — the alternative is an account that is
   * briefly wrong and a step somebody forgets.
   *
   * Only the differences from the role are stored, so changing a role's
   * defaults later still reaches everyone who was not explicitly overridden.
   */
  const newId = Number(info.lastInsertRowid);

  // Creating a fresh admin-tier account with custom permissions is a Super
  // Admin's call, same as configuring an existing one.
  const canSetPerms = role !== 'admin' || permissions.isSuperAdmin(req.user);

  if (canSetPerms && '_perms' in req.body) {
    const defaults = new Set(permissions.ROLE_DEFAULTS[role] || []);
    const wanted = new Set(
      (Array.isArray(req.body.permission) ? req.body.permission : [req.body.permission])
        .filter(Boolean)
        .filter((k) => permissions.ALL.includes(k))
    );
    // Delegation ceiling: granting an ability beyond the role's own default
    // requires the acting user to already hold that ability — a Super Admin
    // has no ceiling, everyone else can only delegate what they themselves
    // have. Taking a default ability away is never capped this way.
    const ceiling = permissions.isSuperAdmin(req.user) ? null : req.user.abilities;

    const ins = db.prepare(
      `INSERT INTO user_permissions (user_id, permission, granted, set_by)
       VALUES (?,?,?,?)`
    );

    permissions.ALL.forEach((key) => {
      const byRole = defaults.has(key);
      let now = wanted.has(key);
      if (now && !byRole && ceiling && !ceiling.has(key)) now = false;
      if (byRole !== now) ins.run(newId, key, now ? 1 : 0, me(req));
    });
  }

  audit.log(req, 'user.create', {
    type: 'user',
    id: Number(info.lastInsertRowid),
    label: username,
    details: `أنشأ حساب ${ROLE_AR[role]}: ${username} — هيكمّل بياناته بنفسه أول دخول`,
  });

  res.redirect(req.adminPath + '/users?msg=added');
});

router.post('/:id/toggle', can('users.manage'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.redirect(req.adminPath + '/users');

  if (id === req.session.user.id) return res.redirect(req.adminPath + '/users?err=self');

  // Only a Super Admin may switch off another Super Admin — a regular admin
  // cannot touch that account at all.
  if (permissions.isSuperAdmin(user) && !permissions.isSuperAdmin(req.user)) {
    return res.status(403).render('admin/denied');
  }

  // The last active admin cannot be switched off — that would lock everyone out
  // of account management with no way back in.
  if (user.role === 'admin' && user.active) {
    const admins = db
      .prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin' AND active = 1")
      .get().c;
    if (admins <= 1) return res.redirect(req.adminPath + '/users?err=last_admin');
  }

  // Separately, the last active Super Admin cannot be switched off even while
  // other regular admins remain — otherwise nobody could configure an admin's
  // permissions or promote a new Super Admin ever again.
  if (permissions.isSuperAdmin(user) && user.active) {
    const superAdmins = db
      .prepare('SELECT COUNT(*) c FROM users WHERE is_super_admin = 1 AND active = 1')
      .get().c;
    if (superAdmins <= 1) return res.redirect(req.adminPath + '/users?err=last_super_admin');
  }

  /*
   * Work in hand, before the account goes quiet.
   *
   * Deactivating removed the person's access and left their requests assigned
   * to them — so the files looked handled while nobody could open them. The
   * office found out when a client rang.
   *
   * So: if they have open work, this asks where it should go first. Handing it
   * over is the default, but "leave it as it is" stays available, because
   * sometimes the person is back on Monday.
   */
  const openWork = user.active
    ? db
        .prepare(
          `SELECT r.id, r.ref, r.name FROM requests r
           JOIN request_assignees a ON a.request_id = r.id
           WHERE a.user_id = ? AND r.archived_at IS NULL
             AND r.status NOT IN ('completed', 'cancelled')`
        )
        .all(id)
    : [];

  if (openWork.length && !req.body.handled) {
    return res.redirect(`${req.adminPath}/users/${id}/handover`);
  }

  // Where the work goes, if anywhere.
  if (openWork.length) {
    const moveTo = parseInt(req.body.reassign_to, 10) || null;

    if (moveTo) {
      const target = db
        .prepare("SELECT * FROM users WHERE id = ? AND active = 1 AND id != ?")
        .get(moveTo, id);

      if (target) {
        const add = db.prepare(
          'INSERT OR IGNORE INTO request_assignees (request_id, user_id, assigned_by) VALUES (?,?,?)'
        );
        const drop = db.prepare(
          'DELETE FROM request_assignees WHERE request_id = ? AND user_id = ?'
        );

        db.transaction(() => {
          openWork.forEach((r) => {
            add.run(r.id, target.id, me(req));
            drop.run(r.id, id);
          });
        })();

        notify.notifyUsers([target.id], null, {
          type: 'assigned',
          text: `📂 اتنقل لك ${openWork.length} طلب من ${user.display_name || user.username}`,
          priority: 'high',
        });

        audit.log(req, 'user.handover', {
          type: 'user',
          id,
          label: user.display_name || user.username,
          details:
            `نقل ${openWork.length} طلب من ${user.display_name} إلى ${target.display_name} ` +
            `عند إيقاف الحساب`,
        });
      }
    } else {
      // Left in place on purpose — recorded, so it is a decision and not a gap.
      audit.log(req, 'user.deactivate_keep_work', {
        type: 'user',
        id,
        label: user.display_name || user.username,
        details: `أوقف ${user.display_name} وساب ${openWork.length} طلب معيّن عليه`,
      });
    }
  }

  const next = user.active ? 0 : 1;
  db.prepare('UPDATE users SET active = ?, deactivated_at = ? WHERE id = ?').run(
    next,
    next ? null : new Date().toISOString().slice(0, 19).replace('T', ' '),
    id
  );

  if (!next) db.prepare("DELETE FROM sessions WHERE data LIKE ?").run(`%"id":${id},%`);

  audit.log(req, next ? 'user.activate' : 'user.deactivate', {
    type: 'user',
    id,
    label: user.display_name || user.username,
    details: `${next ? 'فعّل' : 'أوقف'} حساب: ${user.display_name || user.username}`,
  });
  res.redirect(req.adminPath + '/users?msg=' + (next ? 'activated' : 'deactivated'));
});

/**
 * The handover screen, shown before an account with open work is switched off.
 */
router.get('/:id/handover', can('users.manage'), (req, res) => {
  const person = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!person) return res.status(404).render('errors/404');

  const openWork = db
    .prepare(
      `SELECT r.id, r.ref, r.name, r.status, r.deadline, r.is_critical
       FROM requests r
       JOIN request_assignees a ON a.request_id = r.id
       WHERE a.user_id = ? AND r.archived_at IS NULL
         AND r.status NOT IN ('completed', 'cancelled')
       ORDER BY r.is_critical DESC, r.deadline`
    )
    .all(person.id);

  if (!openWork.length) return res.redirect(`${req.adminPath}/users`);

  res.render('admin/handover', {
    person,
    openWork,
    // Colleagues who could take it: active, not this person, and not themselves
    // locked out of new work.
    candidates: db
      .prepare(
        `SELECT id, display_name, role, assign_locked, assign_lock_reason,
           (SELECT COUNT(*) FROM request_assignees a2
             JOIN requests r2 ON r2.id = a2.request_id
            WHERE a2.user_id = users.id AND r2.archived_at IS NULL
              AND r2.status NOT IN ('completed','cancelled')) AS load
         FROM users
         WHERE active = 1 AND id != ? AND role IN ('lawyer','supervisor','admin')
         ORDER BY assign_locked, load`
      )
      .all(person.id),
  });
});

/**
 * The identity-card scans.
 *
 * The most sensitive thing the office holds about its own staff, so: only
 * someone who manages staff, only when the office requires the documents at
 * all, and never cached by the browser.
 */
router.get('/:id/id/:side', can('users.manage'), (req, res) => {
  const side = req.params.side === 'back' ? 'id_back' : 'id_front';
  const row = db.prepare(`SELECT ${side} AS file FROM users WHERE id = ?`).get(req.params.id);
  if (!row || !row.file) return res.status(404).end();

  if (!require('../../lib/profile').idCardRequired()) return res.status(404).end();

  const fs = require('fs');
  const path = require('path');
  const { UPLOAD_DIR } = require('../../db');

  const full = path.join(UPLOAD_DIR, path.basename(row.file));
  if (!full.startsWith(UPLOAD_DIR) || !fs.existsSync(full)) return res.status(404).end();

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, no-store');
  fs.createReadStream(full).pipe(res);
});

/**
 * A staff member's file.
 *
 * Everything the office holds on one person in one place: their identity
 * documents, what they are working on, what the office owes them, and their
 * recent sign-ins. Scattered across four screens it was technically all
 * available and practically impossible to review.
 *
 * The ID card images are shown only where the office has chosen to require
 * them, and only to someone who manages staff.
 */
router.get('/:id', (req, res) => {
  const person = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!person) return res.status(404).render('errors/404');

  const assigned = db
    .prepare(
      `SELECT r.id, r.ref, r.name, r.status, r.deadline, r.is_critical,
              r.total_amount, r.paid_amount
       FROM requests r
       JOIN request_assignees a ON a.request_id = r.id
       WHERE a.user_id = ? AND r.archived_at IS NULL
       ORDER BY r.is_critical DESC, r.id DESC LIMIT 40`
    )
    .all(person.id);

  const expensesLib = require('../../lib/expenses');
  const custodyStatement = require('../../lib/custody').employeeStatement(person.id);

  res.render('admin/user_file', {
    person,
    assigned,
    openCount: assigned.filter((r) => !['completed', 'cancelled'].includes(r.status)).length,
    owed: expensesLib.owedTo(person.id),
    custodyStatement,
    devices: security.devicesFor(person.id),
    logins: security.recentFor(person.id, 10),
    permissionRows: permissions.describe(db, person),
    isAdminAccount: permissions.isAdmin(person),
    isSuperAdminAccount: permissions.isSuperAdmin(person),
    canEditPermissions: permissions.isSuperAdmin(req.user) || !permissions.isAdmin(person),
    viewerIsSuperAdmin: permissions.isSuperAdmin(req.user),
    idRequired: require('../../lib/profile').idCardRequired(),
    msg: req.query.msg,
  });
});

/**
 * Employee access card helpers.
 *
 * The password shown on the card is deliberately temporary.  Follow-up
 * actions verify it against the current password hash, so a stale card cannot
 * be emailed/SMSed/downloaded after the employee has changed their password or
 * after a new card has been issued.
 */
function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function companyName() {
  const { getSetting } = require('../../db');
  return getSetting('site_name_ar', '') || 'منصة سند';
}

function accessCardFor(req, person, temporary, eventId) {
  const branch = person.office_branch_id
    ? db.prepare('SELECT name FROM office_branches WHERE id=?').get(person.office_branch_id)
    : null;
  return {
    userId: person.id,
    company: companyName(),
    branch: branch?.name || 'الفرع الرئيسي',
    name: person.display_name || person.legal_name || person.username,
    username: person.username,
    password: temporary,
    url: `${req.protocol}://${req.get('host')}/login`,
    email: person.email || '',
    phone: person.phone || '',
    type: person.role === 'admin' ? 'company' : 'employee',
    issuedAt: new Date(),
    eventId,
  };
}

function validCurrentCard(person, temporary) {
  return !!(
    person && person.active && person.must_change_password && temporary &&
    bcrypt.compareSync(String(temporary), person.password_hash)
  );
}

function renderAccessCard(req, res, person, temporary, opts = {}) {
  const eventId = opts.eventId || `EMP-${person.id}-${Date.now()}`;
  const card = accessCardFor(req, person, temporary, eventId);
  res.setHeader('Cache-Control', 'no-store');
  return res.render('admin/access_card_print', {
    card,
    eventId,
    notice: opts.notice || '',
    error: opts.error || '',
    mailLive: mailer.isLive(),
    smsConfigured: sms.isConfigured(),
    layout: false,
  });
}

/** Issue a fresh temporary password and open the employee card. */
router.post('/:id/access-card', can('users.manage'), (req, res) => {
  const person = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(req.params.id);
  if (!person) return res.status(404).render('errors/404');

  const temporary = pw.suggestTemporary();
  db.prepare('UPDATE users SET password_hash=?,must_change_password=1 WHERE id=?')
    .run(bcrypt.hashSync(temporary, 11), person.id);
  try { db.prepare('DELETE FROM sessions WHERE data LIKE ?').run(`%"id":${person.id},%`); } catch (_) {}

  const eventId = `EMP-${person.id}-${Date.now()}`;
  audit.log(req, 'user.access_card', {
    type: 'user', id: person.id, label: person.display_name || person.username,
    details: `إصدار بطاقة دخول مؤقتة للموظف ${person.display_name || person.username}`,
  });
  return renderAccessCard(req, res, person, temporary, {
    eventId,
    notice: 'تم إصدار كلمة مرور مؤقتة جديدة. البطاقة جاهزة للطباعة أو الإرسال.',
  });
});

router.get('/:id/access-card/qr', can('users.manage'), async (req, res) => {
  const person = db.prepare('SELECT id,active FROM users WHERE id=?').get(req.params.id);
  if (!person || !person.active) return res.sendStatus(404);
  const url = `${req.protocol}://${req.get('host')}/login`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const endpoint = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=8&data=${encodeURIComponent(url)}`;
    const response = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return res.sendStatus(502);
    const type = response.headers.get('content-type') || 'image/png';
    const image = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', type.startsWith('image/') ? type : 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(image);
  } catch (_) {
    // A missing external QR service must never break the card itself.
    return res.sendStatus(503);
  }
});

router.post('/:id/access-card/email', can('users.manage'), (req, res) => {
  const person = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(req.params.id);
  const temporary = String(req.body.temporary_password || '');
  if (!person) return res.status(404).render('errors/404');
  if (!validCurrentCard(person, temporary)) {
    return renderAccessCard(req, res, person, temporary, { error: 'هذه البطاقة لم تعد صالحة للإرسال. أعد إصدار كلمة مرور مؤقتة جديدة.' });
  }
  if (!person.email) {
    return renderAccessCard(req, res, person, temporary, { error: 'لا يوجد بريد إلكتروني مسجل لهذا الموظف.' });
  }

  const card = accessCardFor(req, person, temporary, req.body.event_id || `EMP-${person.id}`);
  const html = `<div dir="rtl" style="font-family:Arial;max-width:640px;margin:auto;border:1px solid #d7dedb;border-radius:16px;padding:26px">
    <h2 style="color:#0b2b34">بطاقة الدخول إلى منصة سند</h2>
    <p><b>الموظف:</b> ${escapeHtml(card.name)}</p>
    <p><b>الشركة/المكتب:</b> ${escapeHtml(card.company)}</p>
    <p><b>الفرع:</b> ${escapeHtml(card.branch)}</p>
    <p><b>اسم المستخدم:</b> <span dir="ltr">${escapeHtml(card.username)}</span></p>
    <p><b>كلمة المرور المؤقتة:</b> <span dir="ltr">${escapeHtml(card.password)}</span></p>
    <p><a href="${escapeHtml(card.url)}" style="display:inline-block;background:#d1a747;color:#082b34;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold">فتح صفحة الدخول</a></p>
    <p style="color:#8a6416"><b>تنبيه:</b> يجب تغيير كلمة المرور عند أول دخول وعدم مشاركة الرسالة بعد استخدامها.</p>
  </div>`;
  mailer.send({ to: person.email, subject: `بطاقة دخول سند — ${card.company}`, html, template: 'employee-access-card' });
  audit.log(req, 'user.access_card_email', {
    type: 'user', id: person.id, label: card.name,
    details: `إرسال بطاقة دخول الموظف ${card.name} إلى البريد ${person.email}`,
  });
  return renderAccessCard(req, res, person, temporary, {
    eventId: req.body.event_id,
    notice: mailer.isLive()
      ? `تم وضع بطاقة الدخول في قائمة الإرسال إلى ${person.email}.`
      : `تم إنشاء رسالة البطاقة في صندوق البريد التجريبي mail-outbox لـ ${person.email}. فعّل مزود البريد للإرسال الفعلي.`,
  });
});

router.post('/:id/access-card/sms', can('users.manage'), async (req, res) => {
  const person = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(req.params.id);
  const temporary = String(req.body.temporary_password || '');
  if (!person) return res.status(404).render('errors/404');
  if (!validCurrentCard(person, temporary)) {
    return renderAccessCard(req, res, person, temporary, { error: 'هذه البطاقة لم تعد صالحة للإرسال. أعد إصدار كلمة مرور مؤقتة جديدة.' });
  }
  if (!person.phone) {
    return renderAccessCard(req, res, person, temporary, { error: 'لا يوجد رقم جوال مسجل لهذا الموظف.' });
  }

  const card = accessCardFor(req, person, temporary, req.body.event_id || `EMP-${person.id}`);
  const message = `سند | ${card.company}\nالموظف: ${card.name}\nالمستخدم: ${card.username}\nكلمة المرور المؤقتة: ${card.password}\nالدخول: ${card.url}\nيرجى تغيير كلمة المرور عند أول دخول.`;
  const result = await sms.sendNow({ to: person.phone, message });
  if (!result.ok) {
    return renderAccessCard(req, res, person, temporary, { eventId: req.body.event_id, error: result.error });
  }
  audit.log(req, 'user.access_card_sms', {
    type: 'user', id: person.id, label: card.name,
    details: `إرسال بطاقة دخول الموظف ${card.name} برسالة SMS إلى ${person.phone}`,
  });
  return renderAccessCard(req, res, person, temporary, {
    eventId: req.body.event_id,
    notice: `تم إرسال بيانات الدخول برسالة SMS إلى ${person.phone}.`,
  });
});

router.post('/:id/access-card/pdf', can('users.manage'), async (req, res) => {
  const person = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(req.params.id);
  const temporary = String(req.body.temporary_password || '');
  if (!person) return res.status(404).render('errors/404');
  if (!validCurrentCard(person, temporary)) {
    return renderAccessCard(req, res, person, temporary, { error: 'هذه البطاقة لم تعد صالحة للتحميل. أعد إصدار كلمة مرور مؤقتة جديدة.' });
  }
  try {
    const eventId = req.body.event_id || `EMP-${person.id}`;
    const card = accessCardFor(req, person, temporary, eventId);
    card.eventId = eventId;
    card.issuedLabel = new Date().toLocaleString('ar-EG');
    const pdf = await accessCardPdf.create(card);
    const safe = String(person.username || 'employee').replace(/[^a-z0-9._-]/gi, '_');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="sanad-access-card-${safe}.pdf"`);
    audit.log(req, 'user.access_card_pdf', {
      type: 'user', id: person.id, label: card.name,
      details: `تحميل بطاقة دخول الموظف ${card.name} بصيغة PDF`,
    });
    return res.send(pdf);
  } catch (err) {
    return renderAccessCard(req, res, person, temporary, {
      eventId: req.body.event_id,
      error: `تعذر إنشاء PDF الآن: ${err.message}`,
    });
  }
});

router.post('/:id/update', can('users.manage'), (req, res) => {
  const person = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!person) return res.status(404).render('errors/404');

  const actorIsSuperAdmin = permissions.isSuperAdmin(req.user);

  // A regular admin cannot touch a Super Admin's record at all — only
  // another Super Admin may edit, and Super Admin decides who may edit it.
  if (permissions.isSuperAdmin(person) && !actorIsSuperAdmin) {
    return res.status(403).render('admin/denied');
  }

  const displayName=String(req.body.display_name||'').trim().slice(0,120);
  const legalName=String(req.body.legal_name||'').trim().slice(0,180);
  const email=String(req.body.email||'').trim().toLowerCase().slice(0,254);
  const phone=String(req.body.phone||'').trim().slice(0,50);
  const nationalId=String(req.body.national_id||'').replace(/\D/g,'').slice(0,30);
  const birthDate=/^\d{4}-\d{2}-\d{2}$/.test(req.body.birth_date||'')?req.body.birth_date:null;

  const isSelf = person.id === req.session.user.id;
  const requestedRole = ['admin','supervisor','lawyer','accountant'].includes(req.body.role) ? req.body.role : person.role;

  /*
   * Role changes are never self-service — nobody promotes or demotes their
   * own account through this form, whatever tier they are. And moving an
   * account into or out of the admin role is a Super Admin's call only;
   * reshuffling among supervisor/lawyer/accountant is unchanged from before.
   */
  let role = person.role;
  if (!isSelf) {
    const touchesAdminTier = requestedRole === 'admin' || person.role === 'admin';
    if (requestedRole === person.role || !touchesAdminTier || actorIsSuperAdmin) {
      role = requestedRole;
    }
  }

  // Super Admin status is only ever set by an existing Super Admin, only on
  // someone else, and only meaningful on an admin-role account.
  let isSuperAdminFlag = person.is_super_admin ? 1 : 0;
  if (!isSelf && actorIsSuperAdmin) {
    isSuperAdminFlag = (role === 'admin' && req.body.is_super_admin === '1') ? 1 : 0;
  } else if (role !== 'admin') {
    isSuperAdminFlag = 0;
  }

  // The last Super Admin can never be demoted or have the role/flag that
  // makes them one taken away — that would leave nobody able to manage
  // admin-tier accounts.
  if (person.is_super_admin && !isSuperAdminFlag) {
    const otherSuperAdmins = db
      .prepare('SELECT COUNT(*) c FROM users WHERE is_super_admin = 1 AND active = 1 AND id <> ?')
      .get(person.id).c;
    if (otherSuperAdmins === 0) return res.redirect(`${req.adminPath}/users/${person.id}?msg=last_super_admin`);
  }

  if(!displayName) return res.redirect(`${req.adminPath}/users/${person.id}?msg=invalid`);
  db.prepare(`UPDATE users SET display_name=?,legal_name=?,email=?,phone=?,national_id=?,birth_date=?,role=?,is_super_admin=? WHERE id=?`)
    .run(displayName,legalName||null,email||null,phone||null,nationalId||null,birthDate,role,isSuperAdminFlag,person.id);
  audit.log(req,'user.update',{type:'user',id:person.id,label:displayName,details:`تعديل بيانات الموظف ${displayName}`});
  res.redirect(`${req.adminPath}/users/${person.id}?msg=saved`);
});

/**
 * One person's permissions.
 *
 * Shown as three states rather than a checkbox: what the role gives, what was
 * added, what was taken away. A plain checkbox loses the distinction between
 * "off because the role never gave it" and "off because somebody removed it" —
 * and the second is the one that needs explaining months later.
 */
router.get('/:id/permissions', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).render('errors/404');

  res.render('admin/permissions', {
    person: user,
    rows: permissions.describe(db, user),
    catalogue: permissions.CATALOGUE,
    isSuperAdminAccount: permissions.isSuperAdmin(user),
    // A regular admin's list is real and can be trimmed, but only a Super
    // Admin does the trimming — everyone else sees it read-only.
    canEdit: permissions.isSuperAdmin(req.user) || !permissions.isAdmin(user),
    msg: req.query.msg,
  });
});

router.post('/:id/permissions', can('users.manage'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).render('errors/404');

  const back = `${req.adminPath}/users/${user.id}/permissions`;

  // A Super Admin has no permission list to edit — the tier is the absence
  // of a limit, and pretending otherwise would let someone lock the office
  // out of fixing a misconfiguration.
  if (permissions.isSuperAdmin(user)) return res.redirect(`${back}?msg=admin_unlimited`);

  // A regular admin's permissions are real and can be trimmed, but only a
  // Super Admin may do the trimming — not another regular admin, and never
  // on their own account.
  if (permissions.isAdmin(user) && !permissions.isSuperAdmin(req.user)) {
    return res.status(403).render('admin/denied');
  }
  if (user.id === req.session.user.id && permissions.isAdmin(user)) {
    return res.redirect(`${back}?msg=self`);
  }

  const defaults = new Set(permissions.ROLE_DEFAULTS[user.role] || []);
  const wanted = new Set(
    (Array.isArray(req.body.permission) ? req.body.permission : [req.body.permission])
      .filter(Boolean)
      .filter((k) => permissions.ALL.includes(k))
  );
  // Delegation ceiling: granting an ability beyond the target's role default
  // requires the acting user to already hold that ability themselves — a
  // Super Admin has no ceiling, everyone else can only delegate what they
  // have. Taking a default ability away is never capped this way.
  const ceiling = permissions.isSuperAdmin(req.user) ? null : req.user.abilities;

  const changes = [];

  db.transaction(() => {
    db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(user.id);

    const ins = db.prepare(
      `INSERT INTO user_permissions (user_id, permission, granted, set_by)
       VALUES (?,?,?,?)`
    );

    // Only the differences from the role are stored, so changing a role's
    // defaults later still reaches everyone who was not explicitly overridden.
    permissions.ALL.forEach((key) => {
      const byRole = defaults.has(key);
      let now = wanted.has(key);
      if (now && !byRole && ceiling && !ceiling.has(key)) now = false;
      if (byRole === now) return;

      ins.run(user.id, key, now ? 1 : 0, me(req));
      changes.push(`${now ? '+' : '−'} ${permissions.labelOf(key)}`);
    });
  })();

  audit.log(req, 'user.permissions', {
    type: 'user',
    id: user.id,
    label: user.display_name || user.username,
    details: changes.length
      ? `عدّل صلاحيات ${user.display_name || user.username}: ${changes.join('، ')}`
      : `رجّع صلاحيات ${user.display_name || user.username} للافتراضي`,
  });

  res.redirect(`${back}?msg=saved`);
});

module.exports = router;
