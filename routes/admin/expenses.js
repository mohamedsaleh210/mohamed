const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { db, UPLOAD_DIR } = require('../../db');
const expenses = require('../../lib/expenses');
const images = require('../../lib/images');
const audit = require('../../lib/audit');
const csrf = require('../../lib/csrf');
const access = require('../../lib/access');
const custody = require('../../lib/custody');
const notify = require('../../lib/notify');
const { can } = require('../../middleware/auth');

const router = express.Router();

const me = (req) => req.session.user.display_name || req.session.user.username;

const receiptUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) =>
      cb(
        null,
        `expense-${Date.now()}-${crypto.randomBytes(6).toString('hex')}` +
          (file.mimetype === 'application/pdf' ? '.pdf' : '.jpg')
      ),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    /^image\/|application\/pdf/.test(file.mimetype)
      ? cb(null, true)
      : cb(new Error('الإيصال لازم يكون صورة أو PDF')),
});

const validDate = (v) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) return null;
  const [y, m, d] = v.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d
    ? v
    : null;
};

function parseAmount(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0 || value > 10000000) return null;
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------- overview
/**
 * All expenses, for whoever is allowed to see beyond their own.
 *
 * The default view is unreimbursed, because that is the list somebody acts on:
 * money the office owes its own people.
 */
router.get('/', can('expenses.view_all'), (req, res) => {
  const view = ['all', 'owed', 'mine'].includes(req.query.view) ? req.query.view : 'owed';

  const where = {
    all: 'e.voided_at IS NULL',
    owed: 'e.voided_at IS NULL AND e.reimbursed_at IS NULL',
    mine: 'e.voided_at IS NULL AND e.paid_by_id = @me',
  }[view];

  const rows = db
    .prepare(
      `SELECT e.*, r.ref, r.name AS client_name, c.purpose AS custody_purpose
       FROM expenses e JOIN requests r ON r.id = e.request_id
       LEFT JOIN staff_custodies c ON c.id=e.custody_id
       WHERE ${where}
       ORDER BY e.spent_on DESC, e.id DESC LIMIT 200`
    )
    .all({ me: req.session.user.id })
    .map((e) => ({ ...e, categoryLabel: expenses.label(e.category) }));

  res.render('admin/expenses', {
    rows,
    view,
    categories: expenses.CATEGORIES,
    summary: expenses.report(
      { from: '2000-01-01', to: new Date().toISOString().slice(0, 10) }
    ),
    canManage: req.userCan('expenses.manage'),
    msg: req.query.msg,
  });
});

function expenseRows(req){const view=['all','owed','mine'].includes(req.query.view)?req.query.view:'owed';let where='e.voided_at IS NULL';const p=[];if(view==='owed')where+=' AND e.reimbursed_at IS NULL';if(view==='mine'){where+=' AND e.paid_by_id=?';p.push(req.user.id)}return db.prepare(`SELECT e.spent_on,e.amount,e.reason,e.category,e.on_client,e.paid_by,e.reimbursed_at,e.custody_id,r.ref,r.name FROM expenses e JOIN requests r ON r.id=e.request_id WHERE ${where} ORDER BY e.spent_on DESC,e.id DESC`).all(...p)}
router.get('/export.csv',can('expenses.export'),(req,res)=>{const rows=expenseRows(req);require('../../lib/reporting').csv(res,'sanad-expenses',['التاريخ','المبلغ','السبب','النوع','على من','الطلب','العميل','الموظف','المصدر','الحالة'],rows.map(e=>[e.spent_on,e.amount,e.reason,expenses.label(e.category),e.on_client?'العميل':'المكتب',e.ref,e.name,e.paid_by,e.custody_id?'عهدة':'مال الموظف',e.reimbursed_at?'تمت التسوية':'معلق']))});
router.get('/print',can('expenses.export'),(req,res)=>{const rows=expenseRows(req);require('../../lib/reporting').print(res,'تقرير المصروفات',['التاريخ','المبلغ','السبب','الطلب','العميل','الموظف','الحالة'],rows.map(e=>[e.spent_on,e.amount,e.reason,e.ref,e.name,e.paid_by,e.reimbursed_at?'تمت التسوية':'معلق']))});

// ---------------------------------------------------------------- staff custody
router.get('/custodies', can('custody.view_all'), (req, res) => {
  const staff = db.prepare('SELECT id,display_name,role FROM users WHERE active=1 ORDER BY display_name').all();
  const rows = db.prepare(`SELECT c.*,u.display_name,
      COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.custody_id=c.id AND e.voided_at IS NULL),0) spent,
      COALESCE((SELECT SUM(cr.amount) FROM custody_returns cr WHERE cr.custody_id=c.id AND cr.voided_at IS NULL),0) returned
    FROM staff_custodies c JOIN users u ON u.id=c.user_id
    WHERE c.voided_at IS NULL ORDER BY c.issued_on DESC,c.id DESC LIMIT 300`).all()
    .map(c=>({...c,remaining:c.amount-c.spent-c.returned}));
  const treasuries=db.prepare(`SELECT t.*,COALESCE(SUM(CASE WHEN x.voided_at IS NULL AND x.direction='in' THEN x.amount WHEN x.voided_at IS NULL THEN -x.amount ELSE 0 END),0) balance FROM treasuries t LEFT JOIN treasury_transactions x ON x.treasury_id=t.id WHERE t.active=1 GROUP BY t.id ORDER BY t.id`).all();
  res.render('admin/custodies',{ rows, staff, treasuries, employees:custody.overview(), msg:req.query.msg, err:req.query.err });
});
router.get('/custodies/export.csv',can('expenses.custody'),can('expenses.export'),(req,res)=>{const rows=custody.overview();require('../../lib/reporting').csv(res,'sanad-custodies',['الموظف','المستلم','المصروف','المرتجع','المتبقي'],rows.map(x=>[x.display_name,x.received,x.spent,x.returned,x.remaining]))});
router.get('/custodies/print',can('expenses.custody'),can('expenses.export'),(req,res)=>{const rows=custody.overview();require('../../lib/reporting').print(res,'تقرير عهد الموظفين',['الموظف','المستلم','المصروف','المرتجع','المتبقي'],rows.map(x=>[x.display_name,x.received,x.spent,x.returned,x.remaining]))});

router.post('/custodies/new', can('custody.create'), (req, res) => {
  const userId=Number(req.body.user_id); const amount=parseAmount(req.body.amount);
  const issuedOn=validDate(req.body.issued_on); const purpose=String(req.body.purpose||'').trim().slice(0,300);
  const person=db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(userId);
  if(!person||!amount||!issuedOn||purpose.length<3) return res.redirect(req.adminPath+'/expenses/custodies?err=invalid');
  const treasuryId=Number(req.body.treasury_id),treasury=db.prepare(`SELECT t.*,COALESCE(SUM(CASE WHEN x.voided_at IS NULL AND x.direction='in' THEN x.amount WHEN x.voided_at IS NULL THEN -x.amount ELSE 0 END),0) balance FROM treasuries t LEFT JOIN treasury_transactions x ON x.treasury_id=t.id WHERE t.id=? AND t.active=1 GROUP BY t.id`).get(treasuryId);
  if(!treasury||treasury.balance<amount)return res.redirect(req.adminPath+'/expenses/custodies?err=treasury');
  const custodyType=req.body.custody_type==='fees'?'fees':'operational';
  const reference=String(req.body.reference||'').trim().slice(0,100)||null;
  const info=db.prepare(`INSERT INTO staff_custodies(user_id,amount,issued_on,purpose,reference,issued_by_id,issued_by,treasury_id,custody_type,status) VALUES (?,?,?,?,?,?,?,?,?,'pending_approval')`).run(userId,amount,issuedOn,purpose,reference,req.user.id,me(req),treasuryId,custodyType);
  db.prepare("INSERT INTO custody_events(custody_id,action,actor_id,details) VALUES(?,'created',?,?)").run(info.lastInsertRowid,req.user.id,purpose);
  audit.log(req,'custody.create',{type:'user',id:userId,label:person.display_name,details:`إنشاء عهدة بانتظار الاعتماد ${amount} — ${purpose}`});
  res.redirect(req.adminPath+'/expenses/custodies?msg=created');
});

router.post('/custodies/:id/approve',can('custody.approve'),(req,res)=>{const c=db.prepare("SELECT * FROM staff_custodies WHERE id=? AND status='pending_approval' AND voided_at IS NULL").get(req.params.id);if(!c)return res.redirect(req.adminPath+'/expenses/custodies?err=state');db.prepare("UPDATE staff_custodies SET status='approved',approved_by_id=?,approved_at=datetime('now') WHERE id=?").run(req.user.id,c.id);db.prepare("INSERT INTO custody_events(custody_id,action,actor_id) VALUES(?,'approved',?)").run(c.id,req.user.id);audit.log(req,'custody.approve',{type:'user',id:c.user_id,details:`اعتماد عهدة ${c.amount}`});res.redirect(req.adminPath+'/expenses/custodies?msg=approved');});
router.post('/custodies/:id/disburse',can('custody.disburse'),(req,res)=>{const c=db.prepare("SELECT c.*,u.display_name FROM staff_custodies c JOIN users u ON u.id=c.user_id WHERE c.id=? AND c.status='approved' AND c.voided_at IS NULL").get(req.params.id);if(!c)return res.redirect(req.adminPath+'/expenses/custodies?err=state');const t=db.prepare(`SELECT t.*,COALESCE(SUM(CASE WHEN x.voided_at IS NULL AND x.direction='in' THEN x.amount WHEN x.voided_at IS NULL THEN -x.amount ELSE 0 END),0) balance FROM treasuries t LEFT JOIN treasury_transactions x ON x.treasury_id=t.id WHERE t.id=? GROUP BY t.id`).get(c.treasury_id);if(!t||t.balance<c.amount)return res.redirect(req.adminPath+'/expenses/custodies?err=treasury');db.transaction(()=>{db.prepare(`INSERT INTO treasury_transactions(treasury_id,direction,amount,transaction_date,method,source_name,purpose,reference,custody_id,recorded_by_id,recorded_by) VALUES(?,'out',?,date('now'),'custody',?,?,?,?,?,?)`).run(c.treasury_id,c.amount,c.display_name,c.purpose,c.reference,c.id,req.user.id,me(req));db.prepare("UPDATE staff_custodies SET status='pending_receipt',disbursed_by_id=?,disbursed_at=datetime('now') WHERE id=?").run(req.user.id,c.id);db.prepare("INSERT INTO custody_events(custody_id,action,actor_id) VALUES(?,'disbursed',?)").run(c.id,req.user.id);})();notify.notifyUsers([c.user_id],null,{type:'custody',text:`عهدة بقيمة ${c.amount} جاهزة لتأكيد الاستلام — ${c.purpose}`,priority:'high'});audit.log(req,'custody.disburse',{type:'user',id:c.user_id,details:`صرف عهدة ${c.amount}`});res.redirect(req.adminPath+'/expenses/custodies?msg=disbursed');});
router.get('/my-custodies',can('custody.view_own'),(req,res)=>res.render('admin/my_custodies',{statement:custody.employeeStatement(req.user.id),msg:req.query.msg}));
router.post('/my-custodies/:id/receive',can('custody.receive'),(req,res)=>{const c=db.prepare("SELECT * FROM staff_custodies WHERE id=? AND user_id=? AND status='pending_receipt'").get(req.params.id,req.user.id);if(!c)return res.sendStatus(404);db.prepare("UPDATE staff_custodies SET status='active',received_at=datetime('now') WHERE id=?").run(c.id);db.prepare("INSERT INTO custody_events(custody_id,action,actor_id) VALUES(?,'received',?)").run(c.id,req.user.id);audit.log(req,'custody.receive',{type:'user',id:req.user.id,details:`تأكيد استلام عهدة ${c.amount}`});res.redirect(req.adminPath+'/expenses/my-custodies?msg=received');});

router.post('/custodies/:id/return', can('custody.return'), (req, res) => {
  const row=custody.balanceFor(Number(req.params.id)); const amount=parseAmount(req.body.amount);
  const returnedOn=validDate(req.body.returned_on);
  if(!row||!amount||!returnedOn||amount>row.amount-row.spent-row.returned)
    return res.redirect(req.adminPath+'/expenses/custodies?err=return');
  db.prepare(`INSERT INTO custody_returns(custody_id,amount,returned_on,note,received_by_id,received_by)
    VALUES (?,?,?,?,?,?)`).run(row.id,amount,returnedOn,String(req.body.note||'').trim().slice(0,300)||null,req.user.id,me(req));
  db.prepare(`INSERT INTO treasury_transactions(treasury_id,direction,amount,transaction_date,method,source_name,purpose,custody_id,recorded_by_id,recorded_by) SELECT treasury_id,'in',?,?,'custody_return','مرتجع عهدة','مرتجع عهدة موظف',id,?,? FROM staff_custodies WHERE id=?`).run(amount,returnedOn,req.user.id,me(req),row.id);
  const person=db.prepare('SELECT display_name FROM users WHERE id=?').get(row.user_id);
  audit.log(req,'custody.return',{type:'user',id:row.user_id,label:person&&person.display_name,details:`استلام مرتجع عهدة ${amount}`});
  res.redirect(req.adminPath+'/expenses/custodies?msg=returned');
});

router.post('/custodies/:id/void', can('custody.reverse'), (req, res) => {
  const row=custody.balanceFor(Number(req.params.id)); const reason=String(req.body.reason||'').trim();
  if(!row||row.spent>0||row.returned>0||reason.length<3) return res.redirect(req.adminPath+'/expenses/custodies?err=void');
  db.prepare("UPDATE staff_custodies SET voided_at=datetime('now'),voided_by=?,void_reason=? WHERE id=?")
    .run(me(req),reason.slice(0,300),row.id);
  audit.log(req,'custody.void',{type:'user',id:row.user_id,details:`إلغاء عهدة ${row.amount} — ${reason}`});
  res.redirect(req.adminPath+'/expenses/custodies?msg=voided');
});

// ---------------------------------------------------------------- recording
router.post(
  '/request/:id',
  (req, res, next) => {
    receiptUpload.single('receipt')(req, res, (err) => {
      if (err) return res.redirect(`${req.adminPath}/requests/${req.params.id}?msg=bad_receipt`);
      next();
    });
  },
  csrf.verifyDeferred,
  async (req, res) => {
    const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
    if (!request) return res.status(404).render('errors/404');

    // Adding an expense is limited to files the person actually works on.
    if (!access.canAddExpense(req.user, request.id)) {
      return res.status(403).render('admin/denied');
    }

    const back = `${req.adminPath}/requests/${request.id}`;
    const amount = parseAmount(req.body.amount);
    const reason = (req.body.reason || '').trim();
    const spentOn = validDate(req.body.spent_on);
    const category = expenses.CATEGORIES[req.body.category] ? req.body.category : 'other';
    const custodyId = Number(req.body.custody_id) || null;

    if (!amount || !spentOn) return res.redirect(`${back}?msg=bad_expense`);
    if (reason.length < 3) return res.redirect(`${back}?msg=need_expense_reason`);

    let selectedCustody = null;
    if (custodyId) {
      selectedCustody = custody.balanceFor(custodyId);
      if (!selectedCustody || selectedCustody.user_id !== req.user.id || amount > selectedCustody.amount-selectedCustody.spent-selectedCustody.returned) {
        return res.redirect(`${back}?msg=bad_custody_balance`);
      }
    }

    let receipt = null;
    if (req.file) {
      if (/^image\//.test(req.file.mimetype)) {
        await images.normaliseImage(path.join(UPLOAD_DIR, req.file.filename), {
          mime: req.file.mimetype,
          originalName: req.file.originalname,
        });
      }
      receipt = req.file.filename;
    }

    db.prepare(
      `INSERT INTO expenses (request_id, amount, reason, category, spent_on, on_client,
                             receipt_file, paid_by, paid_by_id,custody_id,reimbursed_at,reimbursed_by,custody_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      request.id, amount, reason.slice(0, 300), category, spentOn,
      req.body.on_client ? 1 : 0, receipt, me(req), req.session.user.id,
      selectedCustody ? selectedCustody.id : null,
      selectedCustody ? new Date().toISOString() : null,
      selectedCustody ? 'من عهدة الموظف' : null,
      selectedCustody ? 'submitted' : 'approved'
    );

    audit.log(req, 'request.expense', {
      type: 'request',
      id: request.id,
      label: request.ref,
      details: `سجّل مصروف ${amount} (${expenses.label(category)})${selectedCustody?' من العهدة':' من ماله'} — ${reason}`,
    });

    res.redirect(`${back}?msg=expense_added`);
  }
);

router.post('/custody-expenses/:id/approve',can('custody.review_expense'),(req,res)=>{const e=db.prepare("SELECT * FROM expenses WHERE id=? AND custody_id IS NOT NULL AND custody_status='submitted' AND voided_at IS NULL").get(req.params.id);if(!e)return res.sendStatus(404);db.prepare("UPDATE expenses SET custody_status='approved',reviewed_by_id=?,reviewed_at=datetime('now'),review_note=? WHERE id=?").run(req.user.id,String(req.body.note||'').slice(0,300),e.id);audit.log(req,'custody.expense_approve',{type:'request',id:e.request_id,details:`اعتماد مصروف عهدة ${e.amount}`});res.redirect(req.adminPath+'/expenses');});
router.post('/custody-expenses/:id/reject',can('custody.review_expense'),(req,res)=>{const note=String(req.body.note||'').trim();const e=db.prepare("SELECT * FROM expenses WHERE id=? AND custody_id IS NOT NULL AND custody_status='submitted' AND voided_at IS NULL").get(req.params.id);if(!e||note.length<3)return res.sendStatus(400);db.prepare("UPDATE expenses SET custody_status='rejected',reviewed_by_id=?,reviewed_at=datetime('now'),review_note=? WHERE id=?").run(req.user.id,note.slice(0,300),e.id);audit.log(req,'custody.expense_reject',{type:'request',id:e.request_id,details:`رفض مصروف عهدة ${e.amount}: ${note}`});res.redirect(req.adminPath+'/expenses');});

/**
 * Expenses are voided with a reason, never deleted — the same rule as payments.
 * A cost that quietly disappears is how a file looks more profitable than it was.
 */
router.post('/:id/void', (req, res) => {
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!row || row.voided_at) return res.redirect(req.adminPath + '/expenses');

  // The person who recorded it may cancel their own; managing others needs the
  // ability.
  const own = row.paid_by_id === req.session.user.id;
  if (!own && !req.userCan('expenses.manage')) {
    return res.status(403).render('admin/denied');
  }

  const reason = (req.body.reason || '').trim();
  const back = req.body.next || `${req.adminPath}/requests/${row.request_id}`;
  if (reason.length < 3) return res.redirect(`${back}?msg=need_void_reason`);

  db.prepare(
    "UPDATE expenses SET voided_at = datetime('now'), voided_by = ?, void_reason = ? WHERE id = ?"
  ).run(me(req), reason.slice(0, 300), row.id);

  const request = db.prepare('SELECT ref FROM requests WHERE id = ?').get(row.request_id);
  audit.log(req, 'request.expense_void', {
    type: 'request',
    id: row.request_id,
    label: request ? request.ref : null,
    details: `ألغى مصروف ${row.amount} — السبب: ${reason}`,
  });

  res.redirect(`${back}?msg=expense_voided`);
});

/** Marking that the office has paid somebody back. */
router.post('/:id/reimburse', can('expenses.manage'), (req, res) => {
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!row || row.voided_at) return res.redirect(req.adminPath + '/expenses');
  // Paid from an advance: the office already supplied the money, so it can
  // never also become a reimbursement owed to the employee.
  if (row.custody_id) {
    return res.redirect(req.body.next || `${req.adminPath}/expenses?msg=custody_expense`);
  }

  const undo = row.reimbursed_at && req.body.undo === '1';

  db.prepare(
    'UPDATE expenses SET reimbursed_at = ?, reimbursed_by = ? WHERE id = ?'
  ).run(undo ? null : new Date().toISOString(), undo ? null : me(req), row.id);

  const request = db.prepare('SELECT ref FROM requests WHERE id = ?').get(row.request_id);
  audit.log(req, 'request.expense_reimburse', {
    type: 'request',
    id: row.request_id,
    label: request ? request.ref : null,
    details: undo
      ? `تراجع عن صرف مصروف ${row.amount} لـ ${row.paid_by}`
      : `صرف ${row.amount} لـ ${row.paid_by}`,
  });

  res.redirect(req.body.next || `${req.adminPath}/expenses?msg=reimbursed`);
});

// ---------------------------------------------------------------- receipts
router.get('/receipt/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!row || !row.receipt_file) return res.status(404).end();

  const own = row.paid_by_id === req.session.user.id;
  if (!own && !req.userCan('expenses.view_all')) return res.status(403).end();

  const full = path.join(UPLOAD_DIR, path.basename(row.receipt_file));
  if (!full.startsWith(UPLOAD_DIR) || !fs.existsSync(full)) return res.status(404).end();

  res.setHeader('Content-Type', full.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
  res.setHeader('Cache-Control', 'private, no-store');
  fs.createReadStream(full).pipe(res);
});

// ---------------------------------------------------------------- categories
/**
 * Managing the categories.
 *
 * A category in use is hidden rather than deleted: the expenses filed against
 * it still have to read correctly, and rewriting last year's records to tidy up
 * this year's list is not a trade worth making.
 */
const slugifyKey = (raw) =>
  String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);

router.get('/categories', can('expenses.manage'), (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM expenses e WHERE e.category = c.key AND e.voided_at IS NULL) AS used
       FROM expense_categories c ORDER BY c.sort, c.id`
    )
    .all();

  res.render('admin/expense_categories', { rows, msg: req.query.msg, err: req.query.err });
});

router.post('/categories/new', can('expenses.manage'), (req, res) => {
  const labelAr = (req.body.label_ar || '').trim();
  if (!labelAr) return res.redirect(`${req.adminPath}/expenses/categories?err=name`);

  // A stable key, derived from the Arabic name when no Latin one is given.
  let key = slugifyKey(req.body.key) || slugifyKey(req.body.label_en);
  if (!key) key = 'cat_' + Date.now().toString(36);

  let n = 2;
  const base = key;
  while (db.prepare('SELECT 1 FROM expense_categories WHERE key = ?').get(key)) {
    key = `${base}_${n++}`;
  }

  const sort = db.prepare('SELECT COALESCE(MAX(sort),0) + 1 AS n FROM expense_categories').get().n;

  db.prepare(
    'INSERT INTO expense_categories (key, label_ar, icon, sort, created_by) VALUES (?,?,?,?,?)'
  ).run(
    key,
    labelAr.slice(0, 60),
    (req.body.icon || '').trim().slice(0, 8) || '•',
    sort,
    me(req)
  );

  audit.log(req, 'expense_category.create', {
    type: 'settings',
    details: `أضاف نوع مصروف: ${labelAr}`,
  });

  res.redirect(`${req.adminPath}/expenses/categories?msg=added`);
});

router.post('/categories/:id/edit', can('expenses.manage'), (req, res) => {
  const row = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(req.params.id);
  if (!row) return res.redirect(`${req.adminPath}/expenses/categories`);

  db.prepare('UPDATE expense_categories SET label_ar = ?, icon = ?, active = ? WHERE id = ?').run(
    (req.body.label_ar || '').trim().slice(0, 60) || row.label_ar,
    (req.body.icon || '').trim().slice(0, 8) || row.icon,
    req.body.active ? 1 : 0,
    row.id
  );

  audit.log(req, 'expense_category.update', {
    type: 'settings',
    details: `عدّل نوع مصروف: ${row.label_ar}`,
  });

  res.redirect(`${req.adminPath}/expenses/categories?msg=saved`);
});

router.post('/categories/:id/delete', can('expenses.manage'), (req, res) => {
  const row = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(req.params.id);
  if (!row) return res.redirect(`${req.adminPath}/expenses/categories`);

  if (row.built_in) {
    return res.redirect(`${req.adminPath}/expenses/categories?err=built_in`);
  }

  const used = db
    .prepare("SELECT COUNT(*) c FROM expenses WHERE category = ?")
    .get(row.key).c;

  // Hidden, not deleted — the expenses already filed against it must keep their
  // name.
  if (used > 0) {
    db.prepare('UPDATE expense_categories SET active = 0 WHERE id = ?').run(row.id);
    audit.log(req, 'expense_category.hide', {
      type: 'settings',
      details: `أخفى نوع مصروف: ${row.label_ar} (مستخدم في ${used} مصروف)`,
    });
    return res.redirect(`${req.adminPath}/expenses/categories?msg=hidden&n=${used}`);
  }

  db.prepare('DELETE FROM expense_categories WHERE id = ?').run(row.id);
  audit.log(req, 'expense_category.delete', {
    type: 'settings',
    details: `حذف نوع مصروف: ${row.label_ar}`,
  });

  res.redirect(`${req.adminPath}/expenses/categories?msg=deleted`);
});

module.exports = router;
