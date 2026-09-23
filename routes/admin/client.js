const express = require('express');
const audit = require('../../lib/audit');
const notify = require('../../lib/notify');
const fs = require('fs');
const path = require('path');
const { db, UPLOAD_DIR } = require('../../db');
const { visibleRequestFilter } = require('../../lib/access');
const { requireStaff, can } = require('../../middleware/auth');
const { STATUS } = require('../../lib/i18n');
const tenantPolicy = require('../../lib/tenant-policy');

const me = (req) => req.session.user.display_name || req.session.user.username;
const refLib = require('../../lib/ref');

const router = express.Router();
router.use(requireStaff);



// A client with a hundred requests is unusual but possible, and rendering all
// of them would be slow for no benefit — nobody reads past the first screen.
// One extra row is fetched to detect that there are more.
const MAX_ROWS = 100;

/**
 * A client's file.
 *
 * The office needs to answer two questions before starting work: has this
 * person asked for this before, and does what they are asking for now fit with
 * what is already open. Both are impossible from a single request page, which
 * is why every request now links here.
 *
 * A client is identified by their account when they have one, and by phone
 * number otherwise — requests placed before somebody registered belong to the
 * same person and have to appear together.
 */
function resolveClient(key) {
  if (/^\d+$/.test(key)) {
    const account = db.prepare('SELECT * FROM clients WHERE id = ?').get(key);
    if (account) return { account, phoneKey: refLib.phoneKey(account.phone) };
  }

  // Otherwise the key is a phone number belonging to requests with no account.
  const phoneKey = refLib.phoneKey(key);
  if (phoneKey.length < 7) return null;

  const sample = db
    .prepare(
      `SELECT name, phone, email FROM requests
       WHERE phone_key = ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(phoneKey);

  return sample ? { account: null, guest: sample, phoneKey } : null;
}

/**
 * The client directory.
 *
 * People arrive through requests, so a client is not always an account: some
 * have registered, some have only ever phoned. Both are listed, keyed on the
 * phone number that ties their requests together.
 */
const PAGE_SIZE = 40;

// ---------------------------------------------------------------- companies
router.get('/companies', can('clients.directory'), (req, res) => {
  const q = String(req.query.q || '').trim();
  const rows = db.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM company_branches b WHERE b.company_id=c.id AND b.active=1) branch_count,
      (SELECT COUNT(*) FROM requests r WHERE r.company_id=c.id AND r.archived_at IS NULL) request_count
    FROM companies c WHERE c.active=1 AND (?='' OR c.name LIKE ? OR c.registration_no LIKE ?)
    ORDER BY c.name`).all(q, `%${q}%`, `%${q}%`);
  res.render('admin/companies', { rows, q, msg: req.query.msg });
});

router.post('/companies/new', can('clients.edit'), (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 200);
  if (!name) return res.redirect(req.adminPath + '/clients/companies?msg=missing');
  const info = db.prepare(`INSERT INTO companies
    (name,legal_name,registration_no,tax_no,phone,email,address,contact_name,notes,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(name,
      String(req.body.legal_name||'').trim()||null, String(req.body.registration_no||'').trim()||null,
      String(req.body.tax_no||'').trim()||null, String(req.body.phone||'').trim()||null,
      String(req.body.email||'').trim()||null, String(req.body.address||'').trim()||null,
      String(req.body.contact_name||'').trim()||null, String(req.body.notes||'').trim()||null, req.user.id);
  audit.log(req, 'company.create', { type:'company', id:Number(info.lastInsertRowid), label:name, details:`إضافة شركة: ${name}` });
  res.redirect(`${req.adminPath}/clients/companies/${info.lastInsertRowid}?msg=created`);
});

router.get('/companies/:id', can('clients.directory'), (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id=? AND active=1').get(req.params.id);
  if (!company) return res.status(404).render('errors/404');
  const branches = db.prepare(`SELECT b.*,
    (SELECT COUNT(*) FROM requests r WHERE r.branch_id=b.id AND r.archived_at IS NULL) request_count
    FROM company_branches b WHERE b.company_id=? AND b.active=1 ORDER BY b.name`).all(company.id);
  const requests = db.prepare(`SELECT r.*,b.name branch_name FROM requests r
    JOIN company_branches b ON b.id=r.branch_id WHERE r.company_id=? AND r.archived_at IS NULL
    ORDER BY r.id DESC LIMIT 100`).all(company.id);
  const services=db.prepare(`SELECT s.id,s.title_ar,CASE WHEN cs.service_id IS NULL THEN 0 ELSE 1 END selected
    FROM services s LEFT JOIN company_services cs ON cs.service_id=s.id AND cs.company_id=?
    WHERE s.active=1 ORDER BY s.sort,s.title_ar`).all(company.id);
  const contacts=db.prepare(`SELECT cc.*,b.name branch_name FROM company_contacts cc
    LEFT JOIN company_branches b ON b.id=cc.branch_id WHERE cc.company_id=? AND cc.active=1 ORDER BY cc.id DESC`).all(company.id);
  res.render('admin/company', { company, branches, requests, services, contacts, STATUS, msg:req.query.msg });
});

/**
 * A company's file as a printable document, with its branches listed —
 * covers both "company" and "company with branches" as one document, since
 * a company without any branches on file just prints an empty branch table
 * rather than needing a second route. No requests, money or contacts on the
 * page — this is an identity document, not a case file.
 */
router.get('/companies/:id/print', can('clients.directory'), (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id=? AND active=1').get(req.params.id);
  if (!company) return res.status(404).render('errors/404');
  const branches = db.prepare(
    `SELECT * FROM company_branches WHERE company_id=? AND active=1 ORDER BY name`
  ).all(company.id);

  require('../../lib/reporting').profileDoc(
    res,
    `ملف الشركة — ${company.name}`,
    company.legal_name && company.legal_name !== company.name ? company.legal_name : null,
    [
      {
        heading: 'البيانات الأساسية',
        fields: [
          ['اسم الشركة', company.name],
          ['الاسم القانوني', company.legal_name],
          ['السجل التجاري', company.registration_no],
          ['الرقم الضريبي', company.tax_no],
          ['رقم الموبايل', company.phone],
          ['البريد', company.email],
          ['العنوان', company.address],
          ['مسؤول التواصل', company.contact_name],
          ['تاريخ الإضافة', company.created_at],
        ],
      },
      {
        heading: `الفروع (${branches.length})`,
        table: {
          columns: ['اسم الفرع', 'الكود', 'المدير', 'الموبايل', 'البريد', 'العنوان'],
          rows: branches.map((b) => [b.name, b.code, b.manager, b.phone, b.email, b.address]),
        },
      },
    ]
  );
});

/**
 * One branch of a company, printed on its own — for handing a single
 * branch's identity to that branch's own manager without the rest of the
 * company's branch list.
 */
router.get('/companies/:id/branches/:branchId/print', can('clients.directory'), (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id=? AND active=1').get(req.params.id);
  if (!company) return res.status(404).render('errors/404');
  const branch = db
    .prepare('SELECT * FROM company_branches WHERE id=? AND company_id=? AND active=1')
    .get(req.params.branchId, company.id);
  if (!branch) return res.status(404).render('errors/404');

  require('../../lib/reporting').profileDoc(
    res,
    `ملف الفرع — ${branch.name}`,
    company.name,
    [
      {
        heading: 'بيانات الفرع',
        fields: [
          ['اسم الفرع', branch.name],
          ['الشركة', company.name],
          ['الكود', branch.code],
          ['المدير', branch.manager],
          ['رقم الموبايل', branch.phone],
          ['البريد', branch.email],
          ['العنوان', branch.address],
          ['تاريخ الإضافة', branch.created_at],
        ],
      },
    ]
  );
});

router.post('/companies/:id/services', can('clients.edit'), (req,res)=>{
  const company=db.prepare('SELECT * FROM companies WHERE id=? AND active=1').get(req.params.id);
  if(!company)return res.status(404).render('errors/404');
  const chosen=(Array.isArray(req.body.service_ids)?req.body.service_ids:[req.body.service_ids]).map(Number).filter(Boolean);
  const insert=db.prepare('INSERT OR IGNORE INTO company_services(company_id,service_id) VALUES(?,?)');
  db.transaction(()=>{db.prepare('DELETE FROM company_services WHERE company_id=?').run(company.id);chosen.forEach(id=>insert.run(company.id,id))})();
  audit.log(req,'company.services',{type:'company',id:company.id,label:company.name,details:`تحديد ${chosen.length} خدمة للشركة`});
  res.redirect(`${req.adminPath}/clients/companies/${company.id}?msg=services_saved`);
});

router.post('/companies/:id/contacts', can('clients.edit'), (req,res)=>{
  const company=db.prepare('SELECT * FROM companies WHERE id=? AND active=1').get(req.params.id);
  if(!company)return res.status(404).render('errors/404');
  const name=String(req.body.full_name||'').trim().slice(0,180);
  if(!name)return res.redirect(`${req.adminPath}/clients/companies/${company.id}?msg=contact_missing`);
  const branchId=Number(req.body.branch_id)||null;
  db.prepare(`INSERT INTO company_contacts(company_id,branch_id,full_name,job_title,phone,email,notes) VALUES(?,?,?,?,?,?,?)`).run(company.id,branchId,name,String(req.body.job_title||'').trim()||null,String(req.body.phone||'').trim()||null,String(req.body.email||'').trim().toLowerCase()||null,String(req.body.notes||'').trim()||null);
  audit.log(req,'company.contact_create',{type:'company',id:company.id,label:company.name,details:`إضافة عميل/مسؤول اتصال: ${name}`});
  res.redirect(`${req.adminPath}/clients/companies/${company.id}?msg=contact_created`);
});

router.post('/companies/:id/branches', can('clients.edit'), (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id=? AND active=1').get(req.params.id);
  if (!company) return res.status(404).render('errors/404');
  const name = String(req.body.name||'').trim().slice(0,180);
  if (!name) return res.redirect(`${req.adminPath}/clients/companies/${company.id}?msg=branch_missing`);
  const quota = tenantPolicy.allowance('branches', 1);
  if (!quota.allowed) return res.status(402).render('errors/subscription', {
    license: tenantPolicy.license(), status: 'limit', expired: false, layout: false,
  });
  try {
    const info=db.prepare(`INSERT INTO company_branches(company_id,name,code,phone,email,address,manager,notes)
      VALUES(?,?,?,?,?,?,?,?)`).run(company.id,name,String(req.body.code||'').trim()||null,
      String(req.body.phone||'').trim()||null,String(req.body.email||'').trim()||null,
      String(req.body.address||'').trim()||null,String(req.body.manager||'').trim()||null,
      String(req.body.notes||'').trim()||null);
    audit.log(req,'company.branch_create',{type:'company',id:company.id,label:company.name,details:`إضافة فرع: ${name}`});
    res.redirect(`${req.adminPath}/clients/companies/${company.id}?msg=branch_created&branch=${info.lastInsertRowid}`);
  } catch (_) { res.redirect(`${req.adminPath}/clients/companies/${company.id}?msg=branch_exists`); }
});

router.get('/', can('clients.directory'), (req, res) => {
  const q = (req.query.q || '').trim();
  const sort = ['newest', 'oldest', 'recent', 'requests', 'owing'].includes(req.query.sort)
    ? req.query.sort
    : 'recent';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  const params = [];
  let where = 'WHERE r.phone_key IS NOT NULL';

  if (q) {
    const digits = q.replace(/\D/g, '');
    if (digits.length >= 7) {
      where += ' AND r.phone_key = ?';
      params.push(digits.slice(-9));
    } else {
      where += ' AND (r.name LIKE ? OR r.email LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
  }

  // One row per person, built from their requests: the account when there is
  // one, and the most recent details otherwise.
  const base = `
    FROM requests r
    LEFT JOIN clients c ON c.id = r.client_id
    ${where}
    GROUP BY r.phone_key
  `;

  const total = db
    .prepare(`SELECT COUNT(*) c FROM (SELECT r.phone_key ${base})`)
    .get(...params).c;

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pages);

  const order = {
    recent: 'last_request DESC',
    newest: 'first_request DESC',
    oldest: 'first_request ASC',
    requests: 'request_count DESC',
    owing: 'owed DESC',
  }[sort];

  const clients = db
    .prepare(
      `SELECT r.phone_key,
              MAX(r.client_id) AS client_id,
              MAX(COALESCE(c.full_name, r.name)) AS name,
              MAX(r.phone) AS phone,
              MAX(COALESCE(c.email, r.email)) AS email,
              COUNT(*) AS request_count,
              SUM(CASE WHEN r.status NOT IN ('completed','cancelled') THEN 1 ELSE 0 END) AS open_count,
              MIN(r.created_at) AS first_request,
              MAX(r.created_at) AS last_request,
              SUM(MAX(0, r.total_amount - COALESCE(r.discount,0)
                        - COALESCE(r.written_off,0) - r.paid_amount)) AS owed
       ${base}
       ORDER BY ${order}
       LIMIT ? OFFSET ?`
    )
    .all(...params, PAGE_SIZE, (current - 1) * PAGE_SIZE);

  res.render('admin/clients', {
    clients,
    q,
    sort,
    page: current,
    pages,
    total,
    pageSize: PAGE_SIZE,
    showMoney: req.userCan('money.view'),
    msg: req.query.msg,
  });
});

function clientExportRows(req){const q=String(req.query.q||'').trim(),like=`%${q}%`;return db.prepare(`SELECT COALESCE(c.full_name,r.name) name,MAX(r.phone) phone,MAX(COALESCE(c.email,r.email)) email,COUNT(*) requests,SUM(CASE WHEN r.status NOT IN ('completed','cancelled') THEN 1 ELSE 0 END) open_count,MAX(r.created_at) last_request FROM requests r LEFT JOIN clients c ON c.id=r.client_id WHERE (?='' OR COALESCE(c.full_name,r.name) LIKE ? OR r.phone LIKE ? OR COALESCE(c.email,r.email) LIKE ?) GROUP BY r.phone_key ORDER BY last_request DESC`).all(q,like,like,like)}
router.get('/export.csv',can('clients.export'),(req,res)=>{const rows=clientExportRows(req);require('../../lib/reporting').csv(res,'sanad-clients',['العميل','رقم الموبايل','البريد','عدد الطلبات','المفتوحة','آخر طلب'],rows.map(r=>[r.name,r.phone,r.email,r.requests,r.open_count,r.last_request]))});
router.get('/print',can('clients.export'),(req,res)=>{const rows=clientExportRows(req);require('../../lib/reporting').print(res,'تقرير العملاء',['العميل','رقم الموبايل','البريد','الطلبات','المفتوحة','آخر طلب'],rows.map(r=>[r.name,r.phone,r.email,r.requests,r.open_count,r.last_request]))});

router.get('/:key', (req, res) => {
  const found = resolveClient(req.params.key);
  if (!found) return res.status(404).render('errors/404');

  const { account, guest, phoneKey } = found;
  const vis = visibleRequestFilter(req.user);
  const showMoney = req.userCan('money.view');

  const requests = db
    .prepare(
      `SELECT r.*,
        (SELECT COUNT(*) FROM documents d WHERE d.request_id = r.id) AS doc_count,
        (SELECT COUNT(*) FROM requirements q
          WHERE q.request_id = r.id AND q.status = 'pending') AS pending_count,
        (SELECT GROUP_CONCAT(u.display_name, '، ') FROM request_assignees a
           JOIN users u ON u.id = a.user_id WHERE a.request_id = r.id) AS lawyers
       FROM requests r
       WHERE (
         (? IS NOT NULL AND r.client_id = ?)
         OR r.phone_key = ?
       )
       ${vis.sql}
       ORDER BY r.id DESC
       LIMIT ?`
    )
    .all(
      account ? account.id : null,
      account ? account.id : null,
      phoneKey,
      ...vis.params,
      MAX_ROWS + 1
    );

  const truncated = requests.length > MAX_ROWS;
  if (truncated) requests.length = MAX_ROWS;

  const today = new Date().toISOString().slice(0, 10);
  const open = requests.filter((r) => !['completed', 'cancelled'].includes(r.status));

  // The same service twice is not automatically a mistake — a client can own
  // two properties — but it is always worth a second look before starting.
  const byService = {};
  requests.forEach((r) => {
    const label = r.service_label ? r.service_label.split(' / ')[0] : 'بدون خدمة';
    (byService[label] = byService[label] || []).push(r);
  });

  const repeated = Object.entries(byService)
    .filter(([, list]) => list.length > 1)
    .map(([label, list]) => ({
      label,
      count: list.length,
      // Two open requests for one service is the case that usually means
      // somebody filed the same thing twice.
      openCount: list.filter((r) => !['completed', 'cancelled'].includes(r.status)).length,
      requests: list,
    }));

  const totals = showMoney
    ? {
        billed: requests.reduce((n, r) => n + (r.total_amount || 0), 0),
        paid: requests.reduce((n, r) => n + (r.paid_amount || 0), 0),
      }
    : null;

  res.render('admin/client', {
    account,
    guest,
    phoneKey,
    requests: requests.map((r) => ({
      ...r,
      overdue:
        r.deadline && r.deadline < today && !['completed', 'cancelled'].includes(r.status),
    })),
    open,
    repeated,
    totals,
    truncated,
    maxRows: MAX_ROWS,
    msg: req.query.msg,
    showMoney,
    STATUS,
  });
});

/**
 * A client's file as a clean, printable document — no request rows or money
 * figures, just who they are. Gated the same as viewing the file itself
 * (requireStaff, router-wide); a registered account or a guest known only by
 * phone both resolve here exactly as they do on the file page.
 */
router.get('/:key/print', (req, res) => {
  const found = resolveClient(req.params.key);
  if (!found) return res.status(404).render('errors/404');
  const { account, guest, phoneKey } = found;
  const requestCount = db
    .prepare(
      `SELECT COUNT(*) c FROM requests r WHERE (? IS NOT NULL AND r.client_id=?) OR r.phone_key=?`
    )
    .get(account ? account.id : null, account ? account.id : null, phoneKey).c;

  require('../../lib/reporting').profileDoc(
    res,
    `ملف العميل — ${account ? account.full_name : guest.name}`,
    account ? (account.email_verified ? 'حساب مسجّل' : 'حساب لم يُفعّل بعد') : 'عميل بدون حساب — معروف برقم الموبايل',
    [
      {
        heading: 'البيانات الأساسية',
        fields: [
          ['الاسم', account ? account.full_name : guest.name],
          ['رقم الموبايل', account ? account.phone : guest.phone],
          ['البريد', account ? account.email : guest.email],
          ['صفته في الطلب', account && account.relation !== 'self' ? account.relation : null],
          ['اسم صاحب الطلب الأصلي', account ? account.beneficiary_name : null],
          ['تاريخ التسجيل', account ? account.created_at : null],
          ['عدد الطلبات', requestCount],
        ],
      },
    ]
  );
});

router.post('/:key/update', can('clients.edit'), (req, res) => {
  const found = resolveClient(req.params.key);
  if (!found) return res.status(404).render('errors/404');

  const { account, guest, phoneKey } = found;
  const fullName = String(req.body.full_name || '').trim().slice(0, 180);
  const phone = String(req.body.phone || '').trim().slice(0, 50);
  const email = String(req.body.email || '').trim().toLowerCase().slice(0, 254);
  const relation = ['self','guardian','agent','relative','other'].includes(req.body.relation)
    ? req.body.relation : 'self';
  const beneficiary = relation === 'self' ? null : String(req.body.beneficiary_name || '').trim().slice(0, 180) || null;
  const newPhoneKey = refLib.phoneKey(phone);
  const back = `${req.adminPath}/clients/${encodeURIComponent(req.params.key)}`;

  if (!fullName || newPhoneKey.length < 7 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return res.redirect(back + '?msg=bad_client_data');
  }

  if (account && email) {
    const duplicate = db.prepare('SELECT id FROM clients WHERE lower(email)=lower(?) AND id!=?').get(email, account.id);
    if (duplicate) return res.redirect(back + '?msg=email_exists');
  }

  const oldName = account ? account.full_name : guest.name;
  const oldPhone = account ? account.phone : guest.phone;
  const oldEmail = account ? account.email : guest.email;

  db.transaction(() => {
    if (account) {
      db.prepare(`UPDATE clients SET full_name=?,phone=?,email=?,relation=?,beneficiary_name=?,
        email_verified=CASE WHEN lower(email)=lower(?) THEN email_verified ELSE 0 END WHERE id=?`)
        .run(fullName,phone,email||account.email,relation,beneficiary,email||account.email,account.id);
      db.prepare(`UPDATE requests SET name=?,phone=?,phone_key=?,email=?,relation=?,beneficiary_name=?
        WHERE client_id=?`).run(fullName,phone,newPhoneKey,email||null,relation,beneficiary,account.id);
    } else {
      db.prepare(`UPDATE requests SET name=?,phone=?,phone_key=?,email=?,relation=?,beneficiary_name=?
        WHERE phone_key=?`).run(fullName,phone,newPhoneKey,email||null,relation,beneficiary,phoneKey);
    }
  })();

  audit.log(req, 'client.update', {
    type: 'client', id: account ? account.id : null, label: fullName,
    details: `تعديل بيانات العميل: الاسم ${oldName} ← ${fullName}، رقم الموبايل ${oldPhone} ← ${phone}، البريد ${oldEmail || '—'} ← ${email || '—'}`,
  });

  res.redirect(`${req.adminPath}/clients/${account ? account.id : encodeURIComponent(phone)}?msg=client_saved`);
});

/**
 * Deleting a client outright.
 *
 * Needed for two real situations: a record created by mistake, and a person who
 * has asked the office to erase their data. Both are legitimate and neither is
 * served by a soft delete that leaves the name in the database.
 *
 * So this is the one place in the system that truly removes data, and it is
 * built to be hard to do by accident:
 *
 *   - the account and its requests go together, because a request without its
 *     client is a file nobody can act on;
 *   - the reason is required and recorded, since the audit trail has to explain
 *     an absence that cannot be inspected afterwards;
 *   - the confirmation is the client's own phone number, not a checkbox, so the
 *     right record has to be in front of you;
 *   - uploaded documents are erased from disk as well, or "deleted" would mean
 *     the scans of somebody's ID are still sitting on the server.
 */
router.post('/:key/delete', can('clients.file'), (req, res) => {
  const found = resolveClient(req.params.key);
  if (!found) return res.status(404).render('errors/404');

  const { account, guest, phoneKey } = found;
  const back = `${req.adminPath}/clients/${req.params.key}`;

  // A permission of its own, so the office can trust one person with cleanup
  // without making them an administrator.
  if (!req.userCan('clients.erase')) return res.status(403).render('admin/denied');

  const reason = (req.body.reason || '').trim();
  if (reason.length < 5) return res.redirect(`${back}?msg=need_delete_reason`);

  const phone = account ? account.phone : guest ? guest.phone : '';
  const typed = String(req.body.confirm_phone || '').replace(/\D/g, '');
  if (!typed || typed !== String(phone).replace(/\D/g, '')) {
    return res.redirect(`${back}?msg=confirm_mismatch`);
  }

  const requests = db
    .prepare(
      `SELECT id, ref FROM requests
       WHERE (? IS NOT NULL AND client_id = ?) OR phone_key = ?`
    )
    .all(account ? account.id : null, account ? account.id : null, phoneKey);

  const name = account ? account.full_name : guest ? guest.name : 'عميل';
  const ids = requests.map((r) => r.id);
  const list = ids.join(',') || '-1';

  // Files on disk first: a row removed before its file leaves the file behind
  // with nothing pointing at it.
  const files = db
    .prepare(
      `SELECT stored_name FROM document_files
       WHERE document_id IN (SELECT id FROM documents WHERE request_id IN (${list}))`
    )
    .all();

  const receipts = db
    .prepare(`SELECT receipt_file FROM payments WHERE request_id IN (${list}) AND receipt_file IS NOT NULL`)
    .all()
    .concat(
      db
        .prepare(`SELECT receipt_file FROM expenses WHERE request_id IN (${list}) AND receipt_file IS NOT NULL`)
        .all()
    );

  let erased = 0;
  [...files.map((f) => f.stored_name), ...receipts.map((r) => r.receipt_file)].forEach((nameOnDisk) => {
    if (!nameOnDisk) return;
    const full = path.join(UPLOAD_DIR, path.basename(nameOnDisk));
    if (!full.startsWith(UPLOAD_DIR)) return;
    try {
      if (fs.existsSync(full)) {
        fs.unlinkSync(full);
        erased += 1;
      }
    } catch (err) {
      console.error('could not erase', nameOnDisk, err.message);
    }
  });

  db.transaction(() => {
    // Children before parents; foreign keys are on and that is the point.
    db.prepare(`UPDATE agenda_events SET case_id = NULL WHERE case_id IN
                 (SELECT id FROM legal_cases WHERE request_id IN (${list}))`).run();
    db.prepare(`UPDATE agenda_events SET request_id = NULL WHERE request_id IN (${list})`).run();
    db.prepare(`UPDATE support_tickets SET request_id = NULL WHERE request_id IN (${list})`).run();
    db.prepare(`UPDATE treasury_transactions SET request_id = NULL WHERE request_id IN (${list})`).run();
    if (account) {
      db.prepare('UPDATE agenda_events SET client_id = NULL WHERE client_id = ?').run(account.id);
      db.prepare('UPDATE support_tickets SET opened_by_client_id = NULL, client_id = NULL WHERE opened_by_client_id = ? OR client_id = ?')
        .run(account.id, account.id);
      db.prepare('UPDATE treasury_transactions SET client_id = NULL WHERE client_id = ?').run(account.id);
    }
    db.prepare(`DELETE FROM document_files WHERE document_id IN
                 (SELECT id FROM documents WHERE request_id IN (${list}))`).run();
    db.prepare(`DELETE FROM documents WHERE request_id IN (${list})`).run();
    db.prepare(`DELETE FROM comments WHERE request_id IN (${list})`).run();
    db.prepare(`DELETE FROM todos WHERE request_id IN (${list})`).run();
    db.prepare(`DELETE FROM requirements WHERE request_id IN (${list})`).run();
    db.prepare(`DELETE FROM fee_items WHERE request_id IN (${list})`).run();
    db.prepare(`DELETE FROM payments WHERE request_id IN (${list})`).run();
    db.prepare(`DELETE FROM expenses WHERE request_id IN (${list})`).run();
    db.prepare(`DELETE FROM request_services WHERE request_id IN (${list})`).run();
    db.prepare(`DELETE FROM request_destinations WHERE request_id IN (${list})`).run();
    db.prepare(`DELETE FROM request_assignees WHERE request_id IN (${list})`).run();
    db.prepare(`DELETE FROM notifications WHERE request_id IN (${list})`).run();
    db.prepare(`DELETE FROM requests WHERE id IN (${list})`).run();

    if (account) {
      db.prepare('DELETE FROM password_resets WHERE audience = ? AND subject_id = ?')
        .run('client', account.id);
      db.prepare('DELETE FROM clients WHERE id = ?').run(account.id);
    }
  })();

  /*
   * The trail keeps what happened, not who it happened to.
   *
   * Enough to show the office acted deliberately and on whose instruction,
   * without preserving the personal data the deletion was meant to remove.
   */
  // Every administrator hears about it, because a trail nobody opens is not
  // oversight.
  notify.notifyAdmins({
    type: 'erased',
    byUserId: req.session.user.id,
    text:
      `🗑 ${me(req)} حذف عميل نهائياً — ${requests.length} طلب` +
      (erased ? ` و${erased} ملف` : '') +
      `. السبب: ${reason.slice(0, 90)}`,
  });

  audit.log(req, 'client.delete', {
    type: 'settings',
    details:
      `حذف عميل نهائياً — ${requests.length} طلب، ${erased} ملف من على السيرفر. ` +
      `السبب: ${reason.slice(0, 200)}`,
  });

  res.redirect(`${req.adminPath}/clients?msg=client_deleted&n=${requests.length}`);
});

module.exports = router;
