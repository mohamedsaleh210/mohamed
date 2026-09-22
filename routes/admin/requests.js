const express = require('express');
const fs = require('fs');
const { db } = require('../../db');
const { STATUS } = require('../../lib/i18n');
const audit = require('../../lib/audit');
const notify = require('../../lib/notify');
const mailer = require('../../lib/mailer');
const emails = require('../../lib/emails');
const commentsLib = require('../../lib/comments');
const trash = require('../../lib/trash');
const refLib = require('../../lib/ref');
const devlinks = require('../../lib/devlinks');
const crypto = require('crypto');
const multer = require('multer');
const pathLib = require('path');
const images = require('../../lib/images');
const csrf = require('../../lib/csrf');
const payments = require('../../lib/payments');
const expensesLib = require('../../lib/expenses');
const custodyLib = require('../../lib/custody');
const { UPLOAD_DIR } = require('../../db');
const { can } = require('../../middleware/auth');
const tenantPolicy = require('../../lib/tenant-policy');
const {
  visibleRequestFilter,
  canSeeRequest,
  canSeePayments,
  canEditFees,
  canAssign,
  canUnassign,
  canArchive,
} = require('../../lib/access');

const router = express.Router();

const me = (req) => req.session.user.display_name || req.session.user.username;

// No fee an office charges is larger than this. Anything beyond it is a typo
// or an attack, and rejecting it here keeps every total downstream finite.
const MAX_AMOUNT = 100000000;

/**
 * Parses a money field, returning null for anything that is not a real, finite,
 * sane amount.
 *
 * parseFloat is not enough: parseFloat('Infinity') is Infinity and
 * parseFloat('1e400') is Infinity too. Either one poisons the request total and
 * every sum that reads it afterwards.
 */
function parseAmount(raw) {
  const text = String(raw == null ? '' : raw).trim();
  // Number('') is 0, which would silently turn an empty field into a free item.
  if (!text) return null;

  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  if (Math.abs(value) > MAX_AMOUNT) return null;
  // Money is two decimal places; more is noise that breaks later comparisons.
  return Math.round(value * 100) / 100;
}

/**
 * Accepts only a real calendar day. A date input gives us one, but anything
 * that can post a form can send "2027-02-29" or "بكرة", and a stored value that
 * is not a date breaks every screen that tries to read it.
 */
function parseDate(raw) {
  const value = String(raw == null ? '' : raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [y, m, d] = value.split('-').map(Number);
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;

  // Round-tripping catches days that do not exist in that month.
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() === m - 1 &&
    parsed.getUTCDate() === d
    ? value
    : null;
}

/** Blocks a lawyer from touching a request they are not assigned to. */
function loadRequest(req, res, next) {
  const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!row) return res.redirect(req.adminPath + '/requests');
  if (!canSeeRequest(req.user, row.id)) return res.status(403).render('admin/denied');
  req.reqRow = row;
  next();
}

/**
 * Status counts in one pass. Seven separate COUNT queries each walked the same
 * rows; grouping asks the database to walk them once.
 */
function statusCounts(vis) {
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) AS c FROM requests r
       WHERE r.archived_at IS NULL ${vis.sql}
       GROUP BY status`
    )
    .all(...vis.params);

  const out = {};
  rows.forEach((r) => (out[r.status] = r.c));
  return out;
}

// ---------------------------------------------------------------- list
const PAGE_SIZE = 50;

router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  const statuses = (Array.isArray(req.query.status) ? req.query.status : [req.query.status])
    .map(x => String(x || '').trim()).filter(x => STATUS[x]);
  const status = statuses[0] || '';
  const employeeId = parseInt(req.query.employee, 10) || null;
  const party = ['individual','company'].includes(req.query.party) ? req.query.party : '';
  const companyId = parseInt(req.query.company, 10) || null;
  const requestedBranchId = parseInt(req.query.branch, 10) || null;
  const branchId = companyId && requestedBranchId && db.prepare(
    'SELECT 1 FROM company_branches WHERE id=? AND company_id=?'
  ).get(requestedBranchId, companyId) ? requestedBranchId : null;
  const archived = req.query.archived === '1';
  const days = parseInt(req.query.days, 10) || 0;
  const open = req.query.open === '1';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  const vis = visibleRequestFilter(req.user);

  // Filters are built once and reused for both the count and the page, so the
  // two can never disagree about what is being listed.
  let where = ` WHERE 1=1 ${archived ? 'AND r.archived_at IS NOT NULL' : 'AND r.archived_at IS NULL'}`;
  const params = [];

  if (q) {
    // FTS handles words; a bare run of digits is almost always somebody
    // pasting a phone number, which the stored key matches directly.
    const digits = q.replace(/\D/g, '');

    if (digits.length >= 7) {
      where += ` AND (r.phone_key = ?
        OR r.company_id IN (SELECT id FROM companies WHERE phone LIKE ? OR registration_no LIKE ? OR tax_no LIKE ?)
        OR r.branch_id IN (SELECT id FROM company_branches WHERE phone LIKE ? OR code LIKE ?)
        OR r.company_id IN (SELECT company_id FROM company_contacts WHERE phone LIKE ? AND active=1))`;
      params.push(digits.slice(-9), `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    } else {
      where += ` AND (r.id IN (SELECT rowid FROM requests_fts WHERE requests_fts MATCH ?)
        OR r.company_id IN (SELECT id FROM companies WHERE name LIKE ? OR legal_name LIKE ? OR contact_name LIKE ? OR email LIKE ? OR registration_no LIKE ? OR tax_no LIKE ?)
        OR r.branch_id IN (SELECT id FROM company_branches WHERE name LIKE ? OR manager LIKE ? OR email LIKE ? OR code LIKE ?)
        OR r.company_id IN (SELECT company_id FROM company_contacts WHERE active=1 AND (full_name LIKE ? OR email LIKE ? OR job_title LIKE ?)))`;
      // Prefix search on each word, with quoting so punctuation in the query
      // cannot become FTS syntax.
      params.push(q.split(/\s+/).filter(Boolean).map((w) => '"' + w.replace(/"/g, '') + '"*').join(' '),
        ...Array(13).fill(`%${q}%`));
    }
  }
  if (party === 'company') where += ' AND r.company_id IS NOT NULL';
  if (party === 'individual') where += ' AND r.company_id IS NULL';
  if (companyId) { where += ' AND r.company_id=?'; params.push(companyId); }
  if (branchId) { where += ' AND r.branch_id=?'; params.push(branchId); }
  if (statuses.length) {
    where += ` AND r.status IN (${statuses.map(() => '?').join(',')})`;
    params.push(...statuses);
  }
  if (employeeId) {
    where += ' AND EXISTS (SELECT 1 FROM request_assignees fa WHERE fa.request_id=r.id AND fa.user_id=?)';
    params.push(employeeId);
  }

  // "What came in this week" is the question actually asked each morning, so
  // it is a preset rather than a date picker nobody fills in.
  if (days > 0) {
    where += " AND r.created_at >= datetime('now', ?)";
    params.push(`-${days} days`);
  }

  // Open means still needing work — everything except finished and cancelled.
  if (open) {
    where += " AND r.status NOT IN ('completed','cancelled')";
  }

  if (req.query.critical === '1') {
    where += ' AND r.is_critical = 1';
  }

  where += vis.sql;
  params.push(...vis.params);

  const total = db.prepare(`SELECT COUNT(*) c FROM requests r ${where}`).get(...params).c;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pages);

  // The per-row counters are correlated subqueries, so fetching every row
  // meant running them thousands of times. Paging keeps the work bounded no
  // matter how large the table grows.
  const rows = db
    .prepare(
      `SELECT r.*, co.name AS company_name, cb.name AS branch_name,
        (SELECT COUNT(*) FROM comments c WHERE c.request_id = r.id AND c.deleted_at IS NULL) AS comment_count,
        (SELECT COUNT(*) FROM documents d WHERE d.request_id = r.id) AS doc_count,
        (SELECT COUNT(*) FROM todos t WHERE t.request_id = r.id) AS todo_total,
        (SELECT COUNT(*) FROM todos t WHERE t.request_id = r.id AND t.done = 1) AS todo_done,
        (SELECT GROUP_CONCAT(u.display_name, '، ') FROM request_assignees a
           JOIN users u ON u.id = a.user_id WHERE a.request_id = r.id) AS lawyers
       FROM requests r LEFT JOIN companies co ON co.id=r.company_id
       LEFT JOIN company_branches cb ON cb.id=r.branch_id ${where}
       ORDER BY r.is_critical DESC, r.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, PAGE_SIZE, (current - 1) * PAGE_SIZE);

  const today = new Date().toISOString().slice(0, 10);
  const requests = rows.map((r) => ({
    ...r,
    overdue: r.deadline && r.deadline < today && !['completed', 'cancelled'].includes(r.status),
    dueSoon: r.deadline && r.deadline === today && !['completed', 'cancelled'].includes(r.status),
  }));

  res.render('admin/requests', {
    requests,
    q,
    status,
    statuses,
    employeeId,
    party,
    companyId,
    branchId,
    companies: db.prepare('SELECT id,name FROM companies WHERE active=1 ORDER BY name').all(),
    branches: db.prepare('SELECT id,company_id,name FROM company_branches WHERE active=1 ORDER BY name').all(),
    staff: db.prepare('SELECT id,display_name FROM users WHERE active=1 ORDER BY display_name').all(),
    archived,
    page: current,
    pages,
    total,
    pageSize: PAGE_SIZE,
    days,
    open,
    critical: req.query.critical === '1',
    criticalCount: db
      .prepare(
        `SELECT COUNT(*) c FROM requests r
         WHERE r.is_critical = 1 AND r.archived_at IS NULL
           AND r.status NOT IN ('completed','cancelled') ${vis.sql}`
      )
      .get(...vis.params).c,
  });
});

function exportRows(req){
  const q=String(req.query.q||'').trim();
  const statuses=(Array.isArray(req.query.status)?req.query.status:[req.query.status]).filter(x=>STATUS[x]);
  const employeeId=Number(req.query.employee)||null,party=['individual','company'].includes(req.query.party)?req.query.party:'',companyId=Number(req.query.company)||null,requestedBranchId=Number(req.query.branch)||null,vis=visibleRequestFilter(req.user),params=[];
  const branchId=companyId&&requestedBranchId&&db.prepare('SELECT 1 FROM company_branches WHERE id=? AND company_id=?').get(requestedBranchId,companyId)?requestedBranchId:null;
  let where=`WHERE r.archived_at ${req.query.archived==='1'?'IS NOT':'IS'} NULL`;
  if(q){where+=` AND (r.ref LIKE ? OR r.name LIKE ? OR r.phone LIKE ? OR co.name LIKE ? OR co.legal_name LIKE ?
    OR co.registration_no LIKE ? OR co.tax_no LIKE ? OR co.contact_name LIKE ? OR cb.name LIKE ? OR cb.code LIKE ?
    OR EXISTS(SELECT 1 FROM company_contacts cc WHERE cc.company_id=r.company_id AND cc.active=1 AND (cc.full_name LIKE ? OR cc.phone LIKE ? OR cc.email LIKE ?)))`;
    params.push(...Array(13).fill(`%${q}%`))}
  if(party==='company')where+=' AND r.company_id IS NOT NULL';
  if(party==='individual')where+=' AND r.company_id IS NULL';
  if(companyId){where+=' AND r.company_id=?';params.push(companyId)}
  if(branchId){where+=' AND r.branch_id=?';params.push(branchId)}
  if(statuses.length){where+=` AND r.status IN (${statuses.map(()=>'?').join(',')})`;params.push(...statuses)}
  if(employeeId){where+=' AND EXISTS(SELECT 1 FROM request_assignees ra WHERE ra.request_id=r.id AND ra.user_id=?)';params.push(employeeId)}
  where+=vis.sql;params.push(...vis.params);
  return db.prepare(`SELECT r.ref,COALESCE(co.name,r.name) party,cb.name branch,r.service_label,r.status,r.deadline,r.created_at,(SELECT GROUP_CONCAT(u.display_name,'، ') FROM request_assignees ra JOIN users u ON u.id=ra.user_id WHERE ra.request_id=r.id) staff,r.total_amount,r.paid_amount FROM requests r LEFT JOIN companies co ON co.id=r.company_id LEFT JOIN company_branches cb ON cb.id=r.branch_id ${where} ORDER BY r.id DESC`).all(...params);
}
function reportScope(req){const companyId=Number(req.query.company)||null,branchId=Number(req.query.branch)||null,company=companyId?db.prepare('SELECT name FROM companies WHERE id=?').get(companyId):null,branch=company&&branchId?db.prepare('SELECT name FROM company_branches WHERE id=? AND company_id=?').get(branchId,companyId):null;return{title:branch?`تقرير طلبات ${company.name} — فرع ${branch.name}`:company?`تقرير طلبات ${company.name}`:'تقرير الطلبات',file:branch?`sanad-company-${companyId}-branch-${branchId}`:company?`sanad-company-${companyId}`:'sanad-requests'}}
router.get('/export.csv',can('requests.export'),(req,res)=>{const rows=exportRows(req),scope=reportScope(req);require('../../lib/reporting').csv(res,scope.file,['الرقم','العميل أو الشركة','الفرع','الخدمة','الحالة','الموعد','التاريخ','الموظفون','الأتعاب','المدفوع'],rows.map(r=>[r.ref,r.party,r.branch,(r.service_label||'').split(' / ')[0],(STATUS[r.status]||{}).ar||r.status,r.deadline,r.created_at,r.staff,r.total_amount,r.paid_amount]))});
router.get('/print',can('requests.export'),(req,res)=>{const rows=exportRows(req),scope=reportScope(req);require('../../lib/reporting').print(res,scope.title,['الرقم','الشركة أو العميل','الفرع','الخدمة','الحالة','الموعد','الموظفون'],rows.map(r=>[r.ref,r.party,r.branch||'—',(r.service_label||'').split(' / ')[0],(STATUS[r.status]||{}).ar||r.status,r.deadline,r.staff]))});

// ---------------------------------------------------------------- new request
/**
 * Opening a request on behalf of a client who phoned or walked in.
 *
 * The result is indistinguishable from a request the client submitted, apart
 * from the record of who opened it — same reference, same upload link, same
 * confirmation email. So the client can still upload documents without ever
 * creating an account, and if they register later with the same address the
 * request attaches itself to the new account.
 */
router.get('/new', can('requests.create'), (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort, id').all();
  const services = db
    .prepare('SELECT * FROM services WHERE active = 1 ORDER BY category_id, sort, id')
    .all();

  const groups = categories
    .map((c) => ({ category: c, items: services.filter((s) => s.category_id === c.id) }))
    .filter((g) => g.items.length);

  const clientId = parseInt(req.query.client, 10) || null;
  let client = clientId ? db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) : null;

  // A client with no account still has a phone number that identifies them, so
  // the form can be filled from their most recent request.
  if (!client && req.query.phone) {
    const key = String(req.query.phone).replace(/\D/g, '').slice(-9);
    const previous = key.length >= 7
      ? db
          .prepare(
            `SELECT name, phone, email, relation, beneficiary_name
             FROM requests WHERE phone_key = ? ORDER BY id DESC LIMIT 1`
          )
          .get(key)
      : null;

    if (previous) {
      client = {
        id: null,
        full_name: previous.name,
        phone: previous.phone,
        email: previous.email,
        relation: previous.relation,
        beneficiary_name: previous.beneficiary_name,
      };
    }
  }

  res.render('admin/request_new', {
    groups,
    forClient: client,
    recentClients: db
      .prepare('SELECT id, full_name, phone, email FROM clients ORDER BY id DESC LIMIT 200')
      .all(),
    companies: db.prepare('SELECT id,name,phone,email,contact_name FROM companies WHERE active=1 ORDER BY name').all(),
    branches: db.prepare('SELECT id,company_id,name,phone,email,manager FROM company_branches WHERE active=1 ORDER BY name').all(),
    selectedCompany: parseInt(req.query.company,10)||null,
    selectedBranch: parseInt(req.query.branch,10)||null,
    err: req.query.err,
    form: {},
  });
});

router.post('/new', can('requests.create'), (req, res) => {
  const quota = tenantPolicy.allowance('requests', 1);
  if (!quota.allowed) return res.status(402).render('errors/subscription', {
    license: tenantPolicy.license(), status: 'limit', expired: false, layout: false,
  });
  const b = req.body;
  const name = (b.name || '').trim();
  const phone = (b.phone || '').trim();
  const email = (b.email || '').trim().toLowerCase();
  const back = (extra) => res.redirect(`${req.adminPath}/requests/new?err=${extra}`);

  const partyType = b.party_type === 'company' ? 'company' : 'person';
  const companyId = partyType === 'company' ? (parseInt(b.company_id,10)||null) : null;
  const branchId = partyType === 'company' ? (parseInt(b.branch_id,10)||null) : null;
  let company = null, branch = null;
  if (partyType === 'company') {
    company = companyId ? db.prepare('SELECT * FROM companies WHERE id=? AND active=1').get(companyId) : null;
    branch = branchId ? db.prepare('SELECT * FROM company_branches WHERE id=? AND company_id=? AND active=1').get(branchId,companyId) : null;
    if (!company || !branch) return back('company_branch');
  }
  if (!name || !phone) return back('missing');

  const serviceIds=[...new Set((Array.isArray(b.service_ids)?b.service_ids:[b.service_ids||b.service_id]).map(Number).filter(Boolean))].slice(0,30);
  const serviceId = serviceIds[0] || null;
  const service = serviceId
    ? db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId)
    : null;

  // An existing client can be attached directly; otherwise the request stands
  // alone until somebody registers with the same address.
  let clientId = parseInt(b.client_id, 10) || null;
  if (!clientId && email) {
    const match = db.prepare('SELECT id FROM clients WHERE lower(email) = ?').get(email);
    if (match) clientId = match.id;
  }
  if (partyType === 'company') clientId = null;

  const uploadToken = crypto.randomBytes(24).toString('hex');
  const ref = refLib.generate(
    (candidate) => !!db.prepare('SELECT 1 FROM requests WHERE ref = ?').get(candidate)
  );

  const info = db
    .prepare(
      `INSERT INTO requests (ref, name, phone, email, client_id, company_id, branch_id, service_id, service_label,
                             title, message, status, relation, beneficiary_name,
                             upload_token, opened_by, source,issued_on,expires_on,renewal_on)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,'new',?,?,?,?,'office',?,?,?)`
    )
    .run(
      ref, name, phone, email || null, clientId, companyId, branchId,
      service ? service.id : null,
      service ? `${service.title_ar} / ${service.title_en}` : null,
      (b.title || '').trim() || null,
      (b.message || '').trim(),
      ['self', 'guardian', 'agent', 'relative', 'other'].includes(b.relation) ? b.relation : 'self',
      (b.beneficiary_name || '').trim() || null,
      uploadToken,
      me(req),
      /^\d{4}-\d{2}-\d{2}$/.test(b.issued_on||'')?b.issued_on:null,
      /^\d{4}-\d{2}-\d{2}$/.test(b.expires_on||'')?b.expires_on:null,
      /^\d{4}-\d{2}-\d{2}$/.test(b.renewal_on||'')?b.renewal_on:null
    );

  const id = Number(info.lastInsertRowid);
  const addService=db.prepare('INSERT OR IGNORE INTO request_services(request_id,service_id,label,sort,added_by) VALUES(?,?,?,?,?)');
  serviceIds.forEach((sid,i)=>{const s=db.prepare('SELECT title_ar,title_en FROM services WHERE id=? AND active=1').get(sid);if(s)addService.run(id,sid,`${s.title_ar} / ${s.title_en}`,i,me(req))});
  const saved = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);

  audit.log(req, 'request.create', {
    type: 'request',
    id,
    label: ref,
    details: partyType==='company' ? `فتح طلب لشركة ${company.name} — فرع ${branch.name}` : `فتح طلب للعميل ${name} من المكتب`,
  });

  if (email) {
    mailer.send(emails.requestReceived(saved, { lang: 'ar' }));
    devlinks.record(
      `رفع مستندات — ${ref} (${name})`,
      `${mailer.baseUrl()}/upload/${id}?t=${uploadToken}`
    );
  }

  notify.notify(id, {
    type: 'new_request',
    text: `${me(req)} فتح طلب جديد ${ref} للعميل ${name}`,
    byUserId: req.session.user.id,
  });

  res.redirect(`${req.adminPath}/requests/${id}?msg=created`);
});

// ---------------------------------------------------------------- detail
router.get('/:id', loadRequest, (req, res) => {
  const r = req.reqRow;

  const assignees = db
    .prepare(
      `SELECT a.*, u.display_name, u.username, u.active, COALESCE(s.contribution_percent,0) contribution_percent
       FROM request_assignees a JOIN users u ON u.id = a.user_id
       LEFT JOIN request_assignee_shares s ON s.request_id=a.request_id AND s.user_id=a.user_id
       WHERE a.request_id = ? ORDER BY a.id`
    )
    .all(r.id);

  const lawyers = db
    .prepare("SELECT id, display_name, username, role, assign_locked, assign_lock_reason FROM users WHERE active = 1 ORDER BY display_name")
    .all();

  const documents = db
    .prepare('SELECT * FROM documents WHERE request_id = ? ORDER BY id')
    .all(r.id)
    .map((d) => ({
      ...d,
      files: db
        .prepare('SELECT * FROM document_files WHERE document_id = ? ORDER BY page_no, side DESC')
        .all(d.id),
    }));

  const requirements = db
    .prepare('SELECT * FROM requirements WHERE request_id = ? ORDER BY id')
    .all(r.id);

  const todos = db.prepare('SELECT * FROM todos WHERE request_id = ? ORDER BY sort, id').all(r.id);
  const timePauses = db.prepare('SELECT p.*,u.display_name approved_by_name FROM request_time_pauses p LEFT JOIN users u ON u.id=p.approved_by WHERE p.request_id=? ORDER BY p.id DESC').all(r.id);

  const showMoney = canSeePayments(req.user);
  const fees = showMoney
    ? db.prepare('SELECT * FROM fee_items WHERE request_id = ? ORDER BY sort, id').all(r.id)
    : [];
  const paymentRows = showMoney ? payments.listFor(r.id) : [];

  // Anyone who works on the file can see what it has cost; only money.view
  // sees it beside the fees.
  const showExpenses = showMoney || req.userCan('expenses.add');
  const expenseRows = showExpenses ? expensesLib.listFor(r.id) : [];
  const expenseTotals = showExpenses ? expensesLib.totalsFor(r.id) : null;
  const availableCustodies = req.userCan('expenses.add') ? custodyLib.availableFor(req.user.id) : [];

  // Everything the client asked for, not just the first one.
  const requestServices = db
    .prepare(
      `SELECT rs.*, s.title_ar, s.active
       FROM request_services rs LEFT JOIN services s ON s.id = rs.service_id
       WHERE rs.request_id = ? ORDER BY rs.sort, rs.id`
    )
    .all(r.id);

  const requestDestinations = db
    .prepare(
      `SELECT rd.*, d.name AS destination, d.colour
       FROM request_destinations rd
       JOIN destinations d ON d.id = rd.destination_id
       WHERE rd.request_id = ? ORDER BY rd.status, rd.id`
    )
    .all(r.id);

  const allDestinations = db
    .prepare('SELECT id, name, colour FROM destinations WHERE active = 1 ORDER BY sort, id')
    .all();
  const balance = showMoney ? payments.balanceFor(r.id) : null;

  const clientAccount = r.client_id
    ? db.prepare('SELECT * FROM clients WHERE id = ?').get(r.client_id)
    : null;

  // Everything else this client has with us. Matched on account first and on
  // phone number otherwise, so requests placed before they registered still
  // show up together.
  const vis2 = visibleRequestFilter(req.user);
  const siblings = db
    .prepare(
      `SELECT r.id, r.ref, r.status, r.title, r.service_label, r.created_at
       FROM requests r
       WHERE r.id != ?
         AND (
           (? IS NOT NULL AND r.client_id = ?)
           OR r.phone_key = ?
         )
         ${vis2.sql}
       ORDER BY r.id DESC LIMIT 8`
    )
    .all(
      r.id,
      r.client_id, r.client_id,
      String(r.phone || '').replace(/\D/g, '').slice(-9),
      ...vis2.params
    );

  const legalCase = db.prepare('SELECT id,file_no,status,title FROM legal_cases WHERE request_id=?').get(r.id);
  const caseCategories = db.prepare('SELECT id,name FROM case_categories WHERE active=1 ORDER BY sort,name').all();

  res.render('admin/request_detail', {
    reqRow: r,
    clientAccount,
    siblings,
    legalCase,
    caseCategories,
    assignees,
    lawyers,
    thread: commentsLib.threadFor(r.id),
    documents,
    requirements,
    todos,
    timePauses,
    fees,
    payments: paymentRows,
    expenses: expenseRows,
    expenseTotals,
    availableCustodies,
    showExpenses,
    expenseCategories: expensesLib.CATEGORIES,
    requestServices,
    requestDestinations,
    allDestinations,
    balance,
    paymentMethods: payments.selectableMethods(),
    trail: audit.forEntity('request', r.id, 40, { includeMoney: canSeePayments(req.user) }),
    showMoney: canSeePayments(req.user),
    mayAssign: canAssign(req.user),
    mayUnassign: canUnassign(req.user),
    mayArchive: canArchive(req.user),
    msg: req.query.msg,
  });
});

// ---------------------------------------------------------------- print / PDF
/**
 * A print-ready view of the whole file: client details, fees, documents,
 * requirements, steps, the full comment thread and the audit trail.
 *
 * Rendered as a print-styled page rather than a generated PDF on purpose —
 * the browser's own "Save as PDF" handles Arabic shaping and RTL correctly,
 * which server-side PDF libraries famously do not.
 */
router.get('/:id/print', can('requests.export'), loadRequest, (req, res) => {
  const r = req.reqRow;
  const showMoney = canSeePayments(req.user);

  const documents = db
    .prepare('SELECT * FROM documents WHERE request_id = ? ORDER BY id')
    .all(r.id)
    .map((d) => ({
      ...d,
      files: db
        .prepare('SELECT * FROM document_files WHERE document_id = ? ORDER BY page_no, side DESC')
        .all(d.id),
    }));

  res.render('admin/request_print', {
    reqRow: r,
    reportProfile: require('../../lib/reporting').profileForBranch(r.office_branch_id),
    clientAccount: r.client_id
      ? db.prepare('SELECT * FROM clients WHERE id = ?').get(r.client_id)
      : null,
    assignees: db
      .prepare(
        `SELECT a.*, u.display_name FROM request_assignees a
         JOIN users u ON u.id = a.user_id WHERE a.request_id = ? ORDER BY a.id`
      )
      .all(r.id),
    thread: commentsLib.threadFor(r.id),
    documents,
    requirements: db
      .prepare('SELECT * FROM requirements WHERE request_id = ? ORDER BY id')
      .all(r.id),
    todos: db.prepare('SELECT * FROM todos WHERE request_id = ? ORDER BY sort, id').all(r.id),
    fees: showMoney
      ? db.prepare('SELECT * FROM fee_items WHERE request_id = ? ORDER BY sort, id').all(r.id)
      : [],
    trail: audit.forEntity('request', r.id, 200, { includeMoney: showMoney }),
    showMoney,
    printedBy: me(req),
    layout: false,
  });
});

// ---------------------------------------------------------------- status & money
router.post('/:id/update', loadRequest, (req, res) => {
  const r = req.reqRow;
  const user = req.session.user;

  const status = STATUS[req.body.status] ? req.body.status : r.status;
  const changes = [];

  if (status !== r.status) {
    if (status === 'completed') {
      const incomplete = db.prepare('SELECT COUNT(*) c FROM todos WHERE request_id=? AND done=0').get(r.id).c;
      const docs = db.prepare('SELECT COUNT(*) c FROM documents WHERE request_id=?').get(r.id).c;
      const summary = String(req.body.completion_summary||'').trim();
      if (incomplete || !docs || !summary) return res.redirect(`${req.adminPath}/requests/${r.id}?msg=completion_requirements`);
      const rating=Math.max(1,Math.min(5,Number(req.body.completion_rating)||5));
      db.prepare('UPDATE requests SET completion_summary=?,completion_rating=? WHERE id=?').run(summary.slice(0,3000),rating,r.id);
    }
    db.prepare(`UPDATE requests SET status = ?, completed_at=CASE WHEN ?='completed' THEN COALESCE(completed_at,datetime('now')) ELSE NULL END,reopened_count=reopened_count+CASE WHEN status='completed' AND ?!='completed' THEN 1 ELSE 0 END,last_reopened_at=CASE WHEN status='completed' AND ?!='completed' THEN datetime('now') ELSE last_reopened_at END WHERE id = ?`).run(status,status,status,status,r.id);
    changes.push(`الحالة: «${STATUS[r.status]?.ar || r.status}» ← «${STATUS[status].ar}»`);
    notify.notify(r.id, {
      type: 'status',
      text: `${me(req)} غيّر حالة ${r.ref} إلى «${STATUS[status].ar}»`,
      byUserId: user.id,
    });

    if (status === 'completed' && r.status !== 'completed' && r.email) {
      mailer.send(emails.requestCompleted(r, { lang: 'ar' }));
    }
  }

  // Only admins and supervisors may touch money; a lawyer's form never
  // contains these fields, and this check makes forging them pointless.
  // Both money figures are derived now — the total from the fee lines and the
  // paid amount from the payments ledger — so neither is editable here.

  if (changes.length) {
    audit.log(req, 'request.update', {
      type: 'request',
      id: r.id,
      label: r.ref,
      details: changes.join('، '),
    });
  }
  res.redirect(req.adminPath + '/requests/' + r.id);
});

const pauseUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `pause-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${pathLib.extname(file.originalname || '').toLowerCase().slice(0, 6)}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.mimetype);
    cb(ok ? null : new Error('نوع ملف الإثبات غير مدعوم'), ok);
  },
});

router.post('/:id/time-pauses', loadRequest, (req, res, next) => {
  // Same reasoning as the /documents route below: multer's fileFilter/limits
  // errors are real, expected user mistakes (wrong file type, file too big),
  // not server faults — they must become a friendly redirect, never reach
  // Express's default error handler (which would render a generic 500).
  pauseUpload.single('proof')(req, res, (err) => {
    if (err) {
      const code = err.code === 'LIMIT_FILE_SIZE' ? 'pause_too_big' : 'pause_bad_type';
      return res.redirect(`${req.adminPath}/requests/${req.params.id}?msg=${code}`);
    }
    next();
  });
}, csrf.verifyDeferred, (req,res)=>{
  const reasons=['awaiting_documents','awaiting_payment','government','manager_approval','administrative'];
  const reason=reasons.includes(req.body.reason)?req.body.reason:null,note=String(req.body.note||'').trim();
  if(!reason||!note)return res.redirect(`${req.adminPath}/requests/${req.reqRow.id}?msg=pause_invalid`);
  db.prepare(`INSERT INTO request_time_pauses(request_id,reason,note,proof_path,status,created_by) VALUES(?,?,?,?,?,?)`).run(req.reqRow.id,reason,note,req.file?.filename||null,req.userCan('requests.assign')?'approved':'pending',req.user.id);
  if(req.userCan('requests.assign'))db.prepare("UPDATE request_time_pauses SET approved_at=datetime('now'),approved_by=? WHERE id=last_insert_rowid()").run(req.user.id);
  res.redirect(`${req.adminPath}/requests/${req.reqRow.id}?msg=pause_added`);
});
router.post('/:id/time-pauses/:pauseId/approve',can('requests.assign'),loadRequest,(req,res)=>{db.prepare("UPDATE request_time_pauses SET status='approved',approved_at=datetime('now'),approved_by=? WHERE id=? AND request_id=? AND status='pending'").run(req.user.id,req.params.pauseId,req.reqRow.id);res.redirect(`${req.adminPath}/requests/${req.reqRow.id}`)});
router.post('/:id/time-pauses/:pauseId/resume',can('requests.assign'),loadRequest,(req,res)=>{db.prepare("UPDATE request_time_pauses SET status='resumed',resumed_at=datetime('now'),resumed_by=? WHERE id=? AND request_id=? AND status='approved'").run(req.user.id,req.params.pauseId,req.reqRow.id);res.redirect(`${req.adminPath}/requests/${req.reqRow.id}`)});
router.get('/:id/time-pauses/:pauseId/proof', loadRequest, (req,res)=>{const row=db.prepare('SELECT proof_path FROM request_time_pauses WHERE id=? AND request_id=?').get(req.params.pauseId,req.reqRow.id);if(!row?.proof_path)return res.sendStatus(404);const full=pathLib.join(UPLOAD_DIR,pathLib.basename(row.proof_path));if(!full.startsWith(UPLOAD_DIR)||!fs.existsSync(full))return res.sendStatus(404);res.sendFile(full)});

// ---------------------------------------------------------------- staff files
// Same storage and processing as client uploads; the difference is only who
// the record says put it there.
const staffUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext =
        file.mimetype === 'application/pdf'
          ? '.pdf'
          : pathLib.extname(file.originalname || '').toLowerCase().slice(0, 6) || '.jpg';
      cb(null, `s${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
    cb(ok.includes(file.mimetype) ? null : new Error('نوع الملف غير مدعوم'), ok.includes(file.mimetype));
  },
});

router.post(
  '/:id/documents',
  loadRequest,
  (req, res, next) => {
    staffUpload.array('files', 10)(req, res, (err) => {
      if (err) {
        const code = err.code === 'LIMIT_FILE_SIZE' ? 'too_big' : 'bad_type';
        return res.redirect(`${req.adminPath}/requests/${req.params.id}?msg=${code}`);
      }
      next();
    });
  },
  csrf.verifyDeferred,
  async (req, res) => {
    const r = req.reqRow;
    const name = (req.body.name || '').trim();
    const files = req.files || [];

    if (!name || !files.length) {
      return res.redirect(`${req.adminPath}/requests/${r.id}?msg=doc_missing`);
    }
    const quota = tenantPolicy.storageAllowance(files);
    if (!quota.allowed) {
      tenantPolicy.removeUploaded(files);
      return res.status(402).render('errors/subscription', {
        license: tenantPolicy.license(), status: 'limit', expired: false, layout: false,
      });
    }

    const processed = await images.normaliseAll(files);
    const stats = new Map(processed.files.map((o) => [o.file.filename, o.result]));

    const isPdf = files.every((f) => f.mimetype === 'application/pdf');
    const docId = Number(
      db
        .prepare(
          `INSERT INTO documents (request_id, name, kind, note, uploaded_by, uploaded_by_id,
                                  source, internal)
           VALUES (?,?,?,?,?,?,'staff',?)`
        )
        .run(
          r.id, name, isPdf ? 'pdf' : 'images',
          (req.body.note || '').trim() || null,
          me(req), req.session.user.id,
          req.body.internal ? 1 : 0
        ).lastInsertRowid
    );

    const ins = db.prepare(
      `INSERT INTO document_files
         (document_id, stored_name, original_name, mime, size, page_no, side,
          original_size, was_converted, width, height)
       VALUES (@document_id, @stored_name, @original_name, @mime, @size, @page_no, @side,
               @original_size, @was_converted, @width, @height)`
    );

    db.transaction(() => {
      files.forEach((f, i) => {
        const st = stats.get(f.filename);
        ins.run({
          document_id: docId,
          stored_name: st ? st.storedName : f.filename,
          original_name: f.originalname,
          mime: st ? st.mime : f.mimetype,
          size: st ? st.after : f.size,
          page_no: i + 1,
          side: 'front',
          original_size: st ? st.before : f.size,
          was_converted: st && st.converted ? 1 : 0,
          width: st ? st.width : null,
          height: st ? st.height : null,
        });
      });
    })();

    audit.log(req, 'request.staff_upload', {
      type: 'request',
      id: r.id,
      label: r.ref,
      details: `أرفق مستند «${name}» (${files.length} ملف)${req.body.internal ? ' — داخلي' : ''}`,
    });

    notify.notify(r.id, {
      type: 'upload',
      text: `${me(req)} أرفق مستند «${name}» على ${r.ref}`,
      byUserId: req.session.user.id,
    });

    res.redirect(`${req.adminPath}/requests/${r.id}?msg=doc_added`);
  }
);

// ---------------------------------------------------------------- urgency
/**
 * Marking a request urgent.
 *
 * The reason is required, not optional. A flag with no explanation gets applied
 * to everything within a month and stops meaning anything; a flag that has to
 * say "the client flies on the 14th" stays honest.
 */
router.post('/:id/critical', loadRequest, (req, res) => {
  const r = req.reqRow;
  const on = !!req.body.is_critical;
  const reason = (req.body.critical_reason || '').trim();

  if (on && reason.length < 5) {
    return res.redirect(`${req.adminPath}/requests/${r.id}?msg=need_reason`);
  }

  db.prepare(
    `UPDATE requests SET is_critical = ?, critical_reason = ?, critical_by = ?, critical_at = ?
     WHERE id = ?`
  ).run(
    on ? 1 : 0,
    on ? reason.slice(0, 300) : null,
    on ? me(req) : null,
    on ? new Date().toISOString() : null,
    r.id
  );

  audit.log(req, 'request.critical', {
    type: 'request',
    id: r.id,
    label: r.ref,
    details: on ? `علّم الطلب كعاجل: ${reason}` : 'شال علامة العاجل',
  });

  if (on && !r.is_critical) {
    notify.notify(r.id, {
      type: 'critical',
      priority: 'critical',
      text: `🔴 ${r.ref} اتعلّم كعاجل — ${reason.slice(0, 90)}`,
      byUserId: req.session.user.id,
    });
  }

  res.redirect(`${req.adminPath}/requests/${r.id}?msg=critical_saved`);
});

// ---------------------------------------------------------------- title
router.post('/:id/title', loadRequest, (req, res) => {
  const r = req.reqRow;
  const next = (req.body.title || '').trim() || null;
  if (next === r.title) return res.redirect(`${req.adminPath}/requests/${r.id}`);

  db.prepare('UPDATE requests SET title = ? WHERE id = ?').run(next, r.id);

  audit.log(req, 'request.title', {
    type: 'request',
    id: r.id,
    label: r.ref,
    details: next
      ? `غيّر عنوان الطلب إلى «${next}»`
      : 'شال عنوان الطلب',
  });
  res.redirect(`${req.adminPath}/requests/${r.id}?msg=title_saved`);
});

// ---------------------------------------------------------------- deadline
router.post('/:id/deadline', loadRequest, (req, res) => {
  const r = req.reqRow;
  const raw = (req.body.deadline || '').trim();
  const next = parseDate(raw);

  // A value that was typed but is not a real date is a mistake worth reporting,
  // not something to silently store or silently ignore.
  if (raw && !next) {
    return res.redirect(`${req.adminPath}/requests/${r.id}?msg=bad_date`);
  }
  if (next === r.deadline) return res.redirect(req.adminPath + '/requests/' + r.id);

  // Clearing the marker means the new date gets its own daily reminders once
  // it passes, rather than inheriting the old one.
  db.prepare('UPDATE requests SET deadline = ?, deadline_alerted_at = NULL WHERE id = ?')
    .run(next, r.id);

  // Everyone may edit the date, but every edit is on the record — that was the
  // point of allowing it rather than locking lawyers out.
  const from = r.deadline || 'بدون موعد';
  const to = next || 'بدون موعد';
  audit.log(req, 'request.deadline', {
    type: 'request',
    id: r.id,
    label: r.ref,
    details: `الموعد النهائي: ${from} ← ${to}`,
  });
  notify.notify(r.id, {
    type: 'deadline',
    text: `${me(req)} غيّر موعد تسليم ${r.ref} إلى ${to}`,
    byUserId: req.session.user.id,
  });

  res.redirect(req.adminPath + '/requests/' + r.id + '?msg=deadline');
});

router.post('/:id/renewal-dates', loadRequest, (req,res)=>{
  const r=req.reqRow, val=k=>{const v=String(req.body[k]||'').trim();return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:null};
  const issued=val('issued_on'),expires=val('expires_on'),renewal=val('renewal_on');
  if(issued&&expires&&issued>expires)return res.redirect(`${req.adminPath}/requests/${r.id}?msg=bad_date`);
  db.prepare('UPDATE requests SET issued_on=?,expires_on=?,renewal_on=? WHERE id=?').run(issued,expires,renewal,r.id);
  audit.log(req,'request.renewal_dates',{type:'request',id:r.id,label:r.ref,details:`إصدار ${issued||'—'}، انتهاء ${expires||'—'}، تجديد ${renewal||'—'}`});
  res.redirect(`${req.adminPath}/requests/${r.id}?msg=renewal_dates`);
});

// ---------------------------------------------------------------- assignment
/**
 * Clears locks whose return date has passed.
 *
 * Expiring on read rather than on a timer means the list is always correct,
 * even if the process restarted over the weekend.
 */
function releaseExpiredLocks() {
  db.prepare(
    `UPDATE users SET assign_locked = 0, assign_lock_reason = NULL,
                      assign_lock_until = NULL, assign_lock_by = NULL
     WHERE assign_locked = 1 AND assign_lock_until IS NOT NULL
       AND assign_lock_until < date('now')`
  ).run();
}

router.post('/:id/assign', loadRequest, (req, res) => {
  releaseExpiredLocks();
  const r = req.reqRow;
  if (!canAssign(req.user)) return res.status(403).render('admin/denied');

  const userId = parseInt(req.body.user_id, 10);
  const lawyer = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(userId);
  if (!lawyer) return res.redirect(req.adminPath + '/requests/' + r.id);

  // Somebody who has said they are unavailable does not get work put on them
  // without the person assigning seeing why — they can still go ahead.
  if (lawyer.assign_locked && req.body.override !== '1') {
    return res.redirect(
      `${req.adminPath}/requests/${r.id}?msg=assignee_locked&who=${lawyer.id}`
    );
  }

  const exists = db
    .prepare('SELECT 1 FROM request_assignees WHERE request_id = ? AND user_id = ?')
    .get(r.id, userId);
  if (exists) return res.redirect(req.adminPath + '/requests/' + r.id + '?msg=already');

  db.prepare('INSERT INTO request_assignees (request_id, user_id, assigned_by) VALUES (?,?,?)').run(
    r.id,
    userId,
    me(req)
  );

  audit.log(req, 'request.assign', {
    type: 'request',
    id: r.id,
    label: r.ref,
    details: `عيّن الموظف ${lawyer.display_name} على الطلب`,
  });

  notify.notifyUsers([userId], r.id, {
    type: 'assigned',
    text: `${me(req)} عيّنك على الطلب ${r.ref}`,
  });

  res.redirect(req.adminPath + '/requests/' + r.id + '?msg=assigned');
});

router.post('/:id/unassign', loadRequest, (req, res) => {
  const r = req.reqRow;
  if (!canUnassign(req.user)) return res.status(403).render('admin/denied');

  const userId = parseInt(req.body.user_id, 10);
  const lawyer = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  db.prepare('DELETE FROM request_assignees WHERE request_id = ? AND user_id = ?').run(r.id, userId);

  audit.log(req, 'request.unassign', {
    type: 'request',
    id: r.id,
    label: r.ref,
    details: `ألغى تعيين الموظف ${lawyer ? lawyer.display_name : userId} من الطلب`,
  });
  res.redirect(req.adminPath + '/requests/' + r.id + '?msg=unassigned');
});

router.post('/:id/contributions',can('requests.assign'),loadRequest,(req,res)=>{
  const ids=[].concat(req.body.user_ids||[]).map(Number),vals=[].concat(req.body.contribution||[]).map(Number);
  const rows=ids.map((id,i)=>[id,Math.max(0,Math.min(100,vals[i]||0))]);
  const valid=db.prepare('SELECT user_id FROM request_assignees WHERE request_id=?').all(req.reqRow.id).map(x=>x.user_id);
  if(rows.some(x=>!valid.includes(x[0]))||Math.abs(rows.reduce((s,x)=>s+x[1],0)-100)>.01)return res.redirect(`${req.adminPath}/requests/${req.reqRow.id}?msg=share_total`);
  const up=db.prepare('INSERT INTO request_assignee_shares(request_id,user_id,contribution_percent) VALUES(?,?,?) ON CONFLICT(request_id,user_id) DO UPDATE SET contribution_percent=excluded.contribution_percent');
  db.transaction(()=>rows.forEach(x=>up.run(req.reqRow.id,x[0],x[1])))();
  res.redirect(`${req.adminPath}/requests/${req.reqRow.id}?msg=shares`);
});

// ---------------------------------------------------------------- comments
router.post('/:id/comments', loadRequest, (req, res) => {
  const r = req.reqRow;
  // A comment is a note on a file, not a document. Capping it keeps one
  // pasted page from bloating every list that renders the thread.
  const MAX_COMMENT = 5000;
  const body = (req.body.body || '').trim().slice(0, MAX_COMMENT);
  if (!body) return res.redirect(req.adminPath + '/requests/' + r.id);

  // Depth is capped: a reply to a reply joins the same thread.
  let parentId = parseInt(req.body.parent_id, 10) || null;
  if (parentId) parentId = commentsLib.rootIdOf(parentId);

  const info = db
    .prepare(
      `INSERT INTO comments (request_id, parent_id, author_id, author_label, author_role, body)
       VALUES (?,?,?,?,?,?)`
    )
    .run(r.id, parentId, req.session.user.id, me(req), req.session.user.role, body);

  audit.log(req, 'request.comment', {
    type: 'request',
    id: r.id,
    label: r.ref,
    details: parentId ? 'رد على تعليق' : 'أضاف تعليق',
  });

  notify.notify(r.id, {
    type: 'comment',
    text: `${me(req)} ${parentId ? 'رد على تعليق في' : 'علّق على'} ${r.ref}: ${body.slice(0, 80)}`,
    commentId: Number(info.lastInsertRowid),
    byUserId: req.session.user.id,
  });

  res.redirect(req.adminPath + '/requests/' + r.id + '#c' + info.lastInsertRowid);
});

router.post('/:id/comments/:commentId/delete', loadRequest, (req, res) => {
  const r = req.reqRow;
  const c = db.prepare('SELECT * FROM comments WHERE id = ? AND request_id = ?').get(
    req.params.commentId,
    r.id
  );
  if (!c) return res.redirect(req.adminPath + '/requests/' + r.id);

  // Anyone may withdraw their own comment; admins and supervisors may strike
  // through anyone's, because they are the ones answerable for the file.
  const isOwner = c.author_id === req.session.user.id;
  const canModerate = ['admin', 'supervisor'].includes(req.session.user.role);
  if (!isOwner && !canModerate) return res.status(403).render('admin/denied');

  // The text is kept and shown struck through. This is a documentation trail:
  // hiding what was said would defeat the purpose, and a struck line still
  // records that the author withdrew it.
  db.prepare("UPDATE comments SET deleted_at = datetime('now'), deleted_by = ? WHERE id = ?").run(
    me(req),
    c.id
  );

  audit.log(req, 'request.comment_delete', {
    type: 'request',
    id: r.id,
    label: r.ref,
    details: isOwner
      ? 'شطب تعليقه'
      : `شطب تعليق كتبه ${c.author_label}`,
  });
  res.redirect(req.adminPath + '/requests/' + r.id + '#c' + c.id);
});

router.post('/:id/comments/:commentId/restore', loadRequest, (req, res) => {
  const r = req.reqRow;
  const c = db
    .prepare('SELECT * FROM comments WHERE id = ? AND request_id = ?')
    .get(req.params.commentId, r.id);
  if (!c || !c.deleted_at) return res.redirect(req.adminPath + '/requests/' + r.id);

  const isOwner = c.author_id === req.session.user.id;
  const canModerate = ['admin', 'supervisor'].includes(req.session.user.role);
  if (!isOwner && !canModerate) return res.status(403).render('admin/denied');

  db.prepare('UPDATE comments SET deleted_at = NULL, deleted_by = NULL WHERE id = ?').run(c.id);

  audit.log(req, 'request.comment_restore', {
    type: 'request',
    id: r.id,
    label: r.ref,
    details: `رجّع تعليق كتبه ${c.author_label}`,
  });
  res.redirect(req.adminPath + '/requests/' + r.id + '#c' + c.id);
});

// ---------------------------------------------------------------- requirements
router.post('/:id/requirements', loadRequest, (req, res) => {
  const r = req.reqRow;
  const title = (req.body.title || '').trim();
  if (!title) return res.redirect(req.adminPath + '/requests/' + r.id);

  db.prepare('INSERT INTO requirements (request_id, title, created_by) VALUES (?,?,?)').run(
    r.id,
    title,
    me(req)
  );

  audit.log(req, 'request.requirement', {
    type: 'request',
    id: r.id,
    label: r.ref,
    details: `طلب من العميل: ${title}`,
  });

  // The request is now genuinely waiting on the client, and the board should
  // say so without anyone remembering to change it by hand.
  if (!['completed', 'cancelled', 'awaiting_docs'].includes(r.status)) {
    db.prepare("UPDATE requests SET status = 'awaiting_docs' WHERE id = ?").run(r.id);
    audit.log(req, 'request.update', {
      type: 'request',
      id: r.id,
      label: r.ref,
      details: `الحالة تغيّرت تلقائياً إلى «${STATUS.awaiting_docs.ar}» بعد طلب مستندات`,
    });
  }

  // The client is told what is missing — this is the message that saves the
  // office a phone call.
  if (r.email && req.body.notify !== '0') {
    mailer.send(emails.requirementAdded(r, [title], { lang: 'ar' }));
  }

  res.redirect(req.adminPath + '/requests/' + r.id + '?msg=req_added');
});

router.post('/:id/requirements/:reqId/toggle', loadRequest, (req, res) => {
  const r = req.reqRow;
  const item = db.prepare('SELECT * FROM requirements WHERE id = ? AND request_id = ?').get(
    req.params.reqId,
    r.id
  );
  if (!item) return res.redirect(req.adminPath + '/requests/' + r.id);

  const done = item.status === 'received';
  db.prepare(
    `UPDATE requirements SET status = ?, received_at = ?, received_by = ? WHERE id = ?`
  ).run(done ? 'pending' : 'received', done ? null : new Date().toISOString(), done ? null : me(req), item.id);

  audit.log(req, 'request.requirement_toggle', {
    type: 'request',
    id: r.id,
    label: r.ref,
    details: `${done ? 'رجّع' : 'استلم'} المطلوب: ${item.title}`,
  });

  // Once nothing is outstanding the request is no longer waiting on anyone,
  // so it moves itself back into the working pile.
  const stillPending = db
    .prepare("SELECT COUNT(*) c FROM requirements WHERE request_id = ? AND status = 'pending'")
    .get(r.id).c;

  if (!stillPending && r.status === 'awaiting_docs') {
    db.prepare("UPDATE requests SET status = 'in_progress' WHERE id = ?").run(r.id);
    audit.log(req, 'request.update', {
      type: 'request',
      id: r.id,
      label: r.ref,
      details: `كل المطلوب اتستلم — الحالة رجعت «${STATUS.in_progress.ar}» تلقائياً`,
    });
  }
  res.redirect(req.adminPath + '/requests/' + r.id);
});

// ---------------------------------------------------------------- todos
router.post('/:id/todos', loadRequest, (req, res) => {
  const r = req.reqRow;
  const title = (req.body.title || '').trim();
  if (!title) return res.redirect(req.adminPath + '/requests/' + r.id);

  const sort = db
    .prepare('SELECT COALESCE(MAX(sort),0) + 1 AS n FROM todos WHERE request_id = ?')
    .get(r.id).n;

  db.prepare('INSERT INTO todos (request_id, title, sort, created_by) VALUES (?,?,?,?)').run(
    r.id,
    title,
    sort,
    me(req)
  );

  audit.log(req, 'request.todo', {
    type: 'request',
    id: r.id,
    label: r.ref,
    details: `أضاف خطوة: ${title}`,
  });
  res.redirect(req.adminPath + '/requests/' + r.id);
});

router.post('/:id/todos/:todoId/edit', loadRequest, (req, res) => {
  const r = req.reqRow;
  const t = db.prepare('SELECT * FROM todos WHERE id = ? AND request_id = ?').get(
    req.params.todoId,
    r.id
  );
  if (!t) return res.redirect(req.adminPath + '/requests/' + r.id);

  const title = (req.body.title || '').trim();
  if (title && title !== t.title) {
    db.prepare('UPDATE todos SET title = ? WHERE id = ?').run(title, t.id);
    audit.log(req, 'request.todo_edit', {
      type: 'request',
      id: r.id,
      label: r.ref,
      details: `عدّل خطوة: «${t.title}» ← «${title}»`,
    });
  }
  res.redirect(req.adminPath + '/requests/' + r.id);
});

router.post('/:id/todos/reorder', loadRequest, express.json(), (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ ok: false });

  const stmt = db.prepare('UPDATE todos SET sort = ? WHERE id = ? AND request_id = ?');
  db.transaction(() => ids.forEach((id, i) => stmt.run(i + 1, id, req.reqRow.id)))();

  audit.log(req, 'request.todo_reorder', {
    type: 'request',
    id: req.reqRow.id,
    label: req.reqRow.ref,
    details: 'أعاد ترتيب خطوات التنفيذ',
  });
  res.json({ ok: true });
});

router.post('/:id/todos/:todoId/toggle', loadRequest, (req, res) => {
  const r = req.reqRow;
  const t = db.prepare('SELECT * FROM todos WHERE id = ? AND request_id = ?').get(
    req.params.todoId,
    r.id
  );
  if (!t) return res.redirect(req.adminPath + '/requests/' + r.id);

  const done = t.done ? 0 : 1;

  // The date the work happened is not always the date somebody remembered to
  // tick the box, so it can be set explicitly.
  const picked = parseDate(req.body.done_on);
  const doneOn = done ? picked || new Date().toISOString().slice(0, 10) : null;

  db.prepare('UPDATE todos SET done = ?, done_by = ?, done_at = ?, done_on = ? WHERE id = ?').run(
    done,
    done ? me(req) : null,
    done ? new Date().toISOString() : null,
    doneOn,
    t.id
  );

  audit.log(req, 'request.todo_toggle', {
    type: 'request',
    id: r.id,
    label: r.ref,
    details: done ? `خلّص خطوة: ${t.title} (بتاريخ ${doneOn})` : `فتح خطوة: ${t.title}`,
  });
  res.redirect(req.adminPath + '/requests/' + r.id);
});

router.post('/:id/todos/:todoId/date', loadRequest, (req, res) => {
  const r = req.reqRow;
  const t = db.prepare('SELECT * FROM todos WHERE id = ? AND request_id = ?').get(
    req.params.todoId,
    r.id
  );
  if (!t || !t.done) return res.redirect(`${req.adminPath}/requests/${r.id}`);

  const picked = parseDate(req.body.done_on);
  if (!picked) return res.redirect(`${req.adminPath}/requests/${r.id}`);

  db.prepare('UPDATE todos SET done_on = ? WHERE id = ?').run(picked, t.id);
  audit.log(req, 'request.todo_date', {
    type: 'request',
    id: r.id,
    label: r.ref,
    details: `غيّر تاريخ تنفيذ «${t.title}» من ${t.done_on || '—'} إلى ${picked}`,
  });
  res.redirect(`${req.adminPath}/requests/${r.id}`);
});

router.post('/:id/todos/:todoId/delete', loadRequest, (req, res) => {
  const r = req.reqRow;
  const t = db.prepare('SELECT * FROM todos WHERE id = ? AND request_id = ?').get(
    req.params.todoId,
    r.id
  );
  if (!t) return res.redirect(req.adminPath + '/requests/' + r.id);

  const trashId = trash.remove({
    entity: 'todo',
    id: t.id,
    label: t.title,
    row: t,
    by: me(req),
    deleteFn: () => db.prepare('DELETE FROM todos WHERE id = ?').run(t.id),
  });

  audit.log(req, 'request.todo_delete', {
    type: 'request',
    id: r.id,
    label: r.ref,
    details: `حذف خطوة: ${t.title}`,
  });
  res.redirect(`${req.adminPath}/requests/${r.id}?msg=todo_deleted&undo=${trashId}`);
});

// ---------------------------------------------------------------- fees
// The total is always the sum of the lines, never typed directly, so the
// number on screen and the breakdown behind it can never disagree.
function recalcTotal(requestId) {
  const sum = db
    .prepare('SELECT COALESCE(SUM(amount),0) t FROM fee_items WHERE request_id = ?')
    .get(requestId).t;
  db.prepare('UPDATE requests SET total_amount = ? WHERE id = ?').run(sum, requestId);
  return sum;
}

router.post('/:id/fees', loadRequest, (req, res) => {
  const r = req.reqRow;
  if (!canEditFees(req.user)) return res.status(403).render('admin/denied');

  const label = (req.body.label || '').trim().slice(0, 200);
  const amount = parseAmount(req.body.amount);
  if (!label || amount === null) {
    return res.redirect(`${req.adminPath}/requests/${r.id}?msg=bad_amount`);
  }

  const sort = db
    .prepare('SELECT COALESCE(MAX(sort),0) + 1 AS n FROM fee_items WHERE request_id = ?')
    .get(r.id).n;

  db.prepare(
    'INSERT INTO fee_items (request_id, label, amount, sort, created_by) VALUES (?,?,?,?,?)'
  ).run(r.id, label, amount, sort, me(req));

  const total = recalcTotal(r.id);
  audit.log(req, 'request.fee_add', {
    type: 'request',
    id: r.id,
    label: r.ref,
    details: `أضاف بند أتعاب: ${label} — ${amount}. الإجمالي بقى ${total}`,
  });
  res.redirect(req.adminPath + '/requests/' + r.id + '?msg=fee_added');
});

router.post('/:id/fees/:feeId/edit', loadRequest, (req, res) => {
  const r = req.reqRow;
  if (!canEditFees(req.user)) return res.status(403).render('admin/denied');

  const item = db
    .prepare('SELECT * FROM fee_items WHERE id = ? AND request_id = ?')
    .get(req.params.feeId, r.id);
  if (!item) return res.redirect(req.adminPath + '/requests/' + r.id);

  const label = (req.body.label || '').trim().slice(0, 200) || item.label;
  const parsed = parseAmount(req.body.amount);
  const amount = parsed === null ? item.amount : parsed;

  db.prepare('UPDATE fee_items SET label = ?, amount = ? WHERE id = ?').run(label, amount, item.id);
  const total = recalcTotal(r.id);

  audit.log(req, 'request.fee_edit', {
    type: 'request',
    id: r.id,
    label: r.ref,
    details: `عدّل بند: «${item.label} — ${item.amount}» ← «${label} — ${amount}». الإجمالي ${total}`,
  });
  res.redirect(req.adminPath + '/requests/' + r.id);
});

router.post('/:id/fees/:feeId/delete', loadRequest, (req, res) => {
  const r = req.reqRow;
  if (!canEditFees(req.user)) return res.status(403).render('admin/denied');

  const item = db
    .prepare('SELECT * FROM fee_items WHERE id = ? AND request_id = ?')
    .get(req.params.feeId, r.id);
  if (!item) return res.redirect(req.adminPath + '/requests/' + r.id);

  db.prepare('DELETE FROM fee_items WHERE id = ?').run(item.id);
  const total = recalcTotal(r.id);

  audit.log(req, 'request.fee_delete', {
    type: 'request',
    id: r.id,
    label: r.ref,
    details: `حذف بند أتعاب: ${item.label} — ${item.amount}. الإجمالي بقى ${total}`,
  });
  res.redirect(req.adminPath + '/requests/' + r.id);
});

// ---------------------------------------------------------------- special request
router.post('/:id/special', loadRequest, (req, res) => {
  const r = req.reqRow;
  const text = (req.body.special_request || '').trim();
  if (text === (r.special_request || '')) return res.redirect(req.adminPath + '/requests/' + r.id);

  db.prepare('UPDATE requests SET special_request = ? WHERE id = ?').run(text || null, r.id);
  audit.log(req, 'request.special', {
    type: 'request',
    id: r.id,
    label: r.ref,
    details: text ? 'عدّل الطلب الخاص' : 'مسح الطلب الخاص',
  });
  res.redirect(req.adminPath + '/requests/' + r.id + '?msg=special_saved');
});

// ---------------------------------------------------------------- archive
/**
 * Erasing an archived request for good.
 *
 * The office needs this for entries that should never have existed: a payment
 * refunded in full, a figure entered against the wrong file, a duplicate. While
 * such a request stays in the archive its money keeps counting towards the
 * revenue figures, which quietly makes those figures wrong — and a total nobody
 * trusts is worse than no total.
 *
 * Limited to the archive on purpose. Live work is archived first, which is a
 * deliberate second step: it means nothing anyone is working on can be erased
 * in one click.
 *
 * What goes with it: every comment, document, payment, expense, fee line and
 * uploaded file. A payment row without its request is money attributed to
 * nothing, and a scan left on disk after its record is gone is the worst of
 * both — invisible and still there.
 */
router.post('/:id/erase', loadRequest, (req, res) => {
  const r = req.reqRow;

  // Its own permission: erasing a request changes the revenue figures, which is
  // a different trust than managing staff accounts.
  if (!req.userCan('requests.erase')) return res.status(403).render('admin/denied');

  const back = `${req.adminPath}/requests/${r.id}`;

  // Only from the archive, so live work cannot be erased in a single step.
  if (!r.archived_at) return res.redirect(`${back}?msg=erase_needs_archive`);

  const reason = (req.body.reason || '').trim();
  if (reason.length < 5) return res.redirect(`${back}?msg=need_erase_reason`);

  // Typing the reference proves the right record is on screen.
  if (String(req.body.confirm_ref || '').trim().toUpperCase() !== r.ref.toUpperCase()) {
    return res.redirect(`${back}?msg=erase_ref_mismatch`);
  }

  const money = payments.balanceFor(r.id) || { paid: 0 };
  const paidBefore = money.paid || 0;

  // Files first: a row removed before its file leaves the file orphaned on disk
  // with nothing pointing at it.
  const onDisk = db
    .prepare(
      `SELECT stored_name AS f FROM document_files
        WHERE document_id IN (SELECT id FROM documents WHERE request_id = ?)
       UNION ALL
       SELECT receipt_file AS f FROM payments WHERE request_id = ? AND receipt_file IS NOT NULL
       UNION ALL
       SELECT receipt_file AS f FROM expenses WHERE request_id = ? AND receipt_file IS NOT NULL`
    )
    .all(r.id, r.id, r.id);

  let erasedFiles = 0;
  onDisk.forEach((row) => {
    if (!row.f) return;
    const full = pathLib.join(UPLOAD_DIR, pathLib.basename(row.f));
    if (!full.startsWith(UPLOAD_DIR)) return;
    try {
      if (fs.existsSync(full)) {
        fs.unlinkSync(full);
        erasedFiles += 1;
      }
    } catch (err) {
      console.error('could not erase', row.f, err.message);
    }
  });

  db.transaction(() => {
    // Optional cross-module links must not turn an intentional permanent
    // deletion into a foreign-key error.  Keep the operational history and
    // detach only the request/case pointer that is being erased.
    db.prepare('UPDATE agenda_events SET case_id = NULL WHERE case_id IN (SELECT id FROM legal_cases WHERE request_id = ?)').run(r.id);
    db.prepare('UPDATE agenda_events SET request_id = NULL WHERE request_id = ?').run(r.id);
    db.prepare('UPDATE support_tickets SET request_id = NULL WHERE request_id = ?').run(r.id);
    db.prepare('UPDATE treasury_transactions SET request_id = NULL WHERE request_id = ?').run(r.id);

    db.prepare(
      'DELETE FROM document_files WHERE document_id IN (SELECT id FROM documents WHERE request_id = ?)'
    ).run(r.id);

    [
      'documents', 'comments', 'todos', 'requirements', 'fee_items', 'payments',
      'expenses', 'request_services', 'request_destinations', 'request_assignees',
      'notifications',
    ].forEach((table) =>
      db.prepare(`DELETE FROM ${table} WHERE request_id = ?`).run(r.id)
    );

    db.prepare('DELETE FROM requests WHERE id = ?').run(r.id);
  })();

  /*
   * The trail keeps the shape of what was removed, not its contents.
   *
   * Enough for somebody reviewing the revenue later to see why a figure changed
   * and on whose decision, without restoring the record the office chose to
   * erase.
   */
  notify.notifyAdmins({
    type: 'erased',
    byUserId: req.session.user.id,
    text:
      `🗑 ${me(req)} حذف الطلب ${r.ref} نهائياً` +
      (paidBefore > 0 ? ` — كان عليه تحصيل ${paidBefore.toLocaleString('en-US')}` : '') +
      `. السبب: ${reason.slice(0, 90)}`,
  });

  audit.log(req, 'request.erase', {
    type: 'settings',
    details:
      `حذف طلب ${r.ref} نهائياً من الأرشيف — ` +
      (paidBefore > 0 ? `كان عليه تحصيل ${paidBefore}، ` : '') +
      `${erasedFiles} ملف اتشال من السيرفر. السبب: ${reason.slice(0, 200)}`,
  });

  res.redirect(
    `${req.adminPath}/requests?archived=1&msg=erased&ref=${encodeURIComponent(r.ref)}`
  );
});

router.post('/:id/archive', loadRequest, (req, res) => {
  const r = req.reqRow;
  if (!canArchive(req.user)) return res.status(403).render('admin/denied');

  const archiving = !r.archived_at;
  db.prepare('UPDATE requests SET archived_at = ? WHERE id = ?').run(
    archiving ? new Date().toISOString() : null,
    r.id
  );

  audit.log(req, archiving ? 'request.archive' : 'request.unarchive', {
    type: 'request',
    id: r.id,
    label: r.ref,
    details: archiving ? 'أرشف الطلب' : 'رجّع الطلب من الأرشيف',
  });
  res.redirect(archiving ? req.adminPath + '/requests' : `${req.adminPath}/requests/${r.id}`);
});

module.exports = router;
