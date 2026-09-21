const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { db, UPLOAD_DIR, getSetting } = require('../../db');
const payments = require('../../lib/payments');
const expensesLib = require('../../lib/expenses');
const images = require('../../lib/images');
const audit = require('../../lib/audit');
const { STATUS } = require('../../lib/i18n');
const notify = require('../../lib/notify');
const csrf = require('../../lib/csrf');
const { can } = require('../../middleware/auth');

const router = express.Router();

// Reading the money is open to the accountant; changing it is not.
router.use(can('revenue.view'));

/** Recording, voiding, discounting and writing off stay with supervisors. */
const canEditMoney = can('money.payments');

const me = (req) => req.session.user.display_name || req.session.user.username;

const receiptUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = file.mimetype === 'application/pdf' ? '.pdf' : '.jpg';
      cb(null, `receipt-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
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
  if (!Number.isFinite(value) || value <= 0 || value > 100000000) return null;
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------- revenue
router.get('/', (req, res) => {
  const period = req.query.period || 'month';
  const bounds = payments.periodBounds(period, req.query.from, req.query.to);
  const data = payments.report(bounds);
  const spend = expensesLib.report(bounds);
  const treasuryBalance = db.prepare(`SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE -amount END),0) balance FROM treasury_transactions WHERE voided_at IS NULL AND approval_status='approved'`).get().balance;

  res.render('admin/revenue', {
    ...data,
    expenses: spend,
    // What the office actually kept: collected, less what it absorbed.
    net: data.totals.collected - spend.totals.office,
    treasuryBalance,
    bounds,
    period,
    currency: getSetting('currency', 'EGP'),
    methods: payments.METHODS,
  });
});

/**
 * CSV exports.
 *
 * Four files rather than one, because the questions are different: what came
 * in, what went out, what each file earned, and what the office owes its own
 * people. A single sheet answering all four would answer none of them well.
 *
 * Every export respects the period and the page filter on screen, so what you
 * download is what you were looking at.
 */
const EXPORTS = {
  payments: {
    label: 'التحصيل',
    header: ['التاريخ', 'المبلغ', 'الطريقة', 'رقم العملية', 'رقم الطلب',
             'العميل', 'المجال', 'الخدمة', 'سجّلها'],
    rows: ({ from, to, pageId }) =>
      db
        .prepare(
          `SELECT p.paid_on, p.amount, p.method, p.reference, r.ref, r.name,
                  r.page_label, r.service_label, p.recorded_by
           FROM payments p JOIN requests r ON r.id = p.request_id
           WHERE p.voided_at IS NULL AND p.paid_on BETWEEN ? AND ?
             AND (? IS NULL OR r.page_id = ?)
           ORDER BY p.paid_on, p.id`
        )
        .all(from, to, pageId, pageId)
        .map((r) => [
          r.paid_on, r.amount, payments.methodLabel(r.method), r.reference || '',
          r.ref, r.name, r.page_label || '',
          r.service_label ? r.service_label.split(' / ')[0] : '', r.recorded_by || '',
        ]),
  },

  expenses: {
    label: 'المصاريف',
    header: ['التاريخ', 'المبلغ', 'على إيه', 'النوع', 'على مين',
             'رقم الطلب', 'العميل', 'المجال', 'مين دفعه', 'اتصرف له'],
    rows: ({ from, to, pageId }) =>
      db
        .prepare(
          `SELECT e.spent_on, e.amount, e.reason, e.category, e.on_client,
                  r.ref, r.name, r.page_label, e.paid_by, e.reimbursed_at
           FROM expenses e JOIN requests r ON r.id = e.request_id
           WHERE e.voided_at IS NULL AND e.spent_on BETWEEN ? AND ?
             AND (? IS NULL OR r.page_id = ?)
           ORDER BY e.spent_on, e.id`
        )
        .all(from, to, pageId, pageId)
        .map((e) => [
          e.spent_on, e.amount, e.reason, expensesLib.label(e.category),
          e.on_client ? 'على العميل' : 'على المكتب',
          e.ref, e.name, e.page_label || '', e.paid_by || '',
          e.reimbursed_at ? 'اتصرف' : 'لسه',
        ]),
  },

  /*
   * One row per request, with the number nobody can currently see: what the
   * office actually kept after everything it spent getting there.
   */
  requests: {
    label: 'ملخص الطلبات',
    header: ['رقم الطلب', 'العميل', 'المجال', 'الخدمة', 'الحالة', 'التاريخ',
             'الأتعاب', 'الخصم', 'دين معدوم', 'المُحصَّل', 'المتبقي',
             'مصاريف على المكتب', 'الصافي'],
    rows: ({ from, to, pageId }) =>
      db
        .prepare(
          `SELECT r.ref, r.name, r.page_label, r.service_label, r.status,
                  date(r.created_at) AS created,
                  COALESCE(r.total_amount,0) AS billed,
                  COALESCE(r.discount,0) AS discount,
                  COALESCE(r.written_off,0) AS written_off,
                  COALESCE(r.paid_amount,0) AS paid,
                  COALESCE((SELECT SUM(amount) FROM expenses x
                             WHERE x.request_id = r.id AND x.voided_at IS NULL
                               AND x.on_client = 0), 0) AS office_cost
           FROM requests r
           WHERE date(r.created_at) BETWEEN ? AND ?
             AND (? IS NULL OR r.page_id = ?)
           ORDER BY r.created_at, r.id`
        )
        .all(from, to, pageId, pageId)
        .map((r) => {
          const due = Math.max(0, r.billed - r.discount - r.written_off);
          return [
            r.ref, r.name, r.page_label || '',
            r.service_label ? r.service_label.split(' / ')[0] : '',
            (STATUS[r.status] || {}).ar || r.status, r.created,
            r.billed, r.discount, r.written_off, r.paid,
            Math.round((due - r.paid) * 100) / 100,
            r.office_cost,
            Math.round((r.paid - r.office_cost) * 100) / 100,
          ];
        }),
  },

  /* A running total, not a period figure — a debt does not belong to a month. */
  owed: {
    label: 'مستحق للموظفين',
    header: ['الموظف', 'عدد المصاريف', 'المبلغ المستحق', 'أقدم مصروف'],
    rows: () =>
      db
        .prepare(
          `SELECT COALESCE(paid_by, 'غير معروف') AS staff, COUNT(*) AS n,
                  SUM(amount) AS total, MIN(spent_on) AS oldest
           FROM expenses
           WHERE voided_at IS NULL AND reimbursed_at IS NULL
           GROUP BY paid_by ORDER BY total DESC`
        )
        .all()
        .map((r) => [r.staff, r.n, r.total, r.oldest]),
  },
};

router.get('/export.csv', can('revenue.export'), (req, res) => {
  const kind = EXPORTS[req.query.kind] ? req.query.kind : 'payments';
  const bounds = payments.periodBounds(req.query.period || 'month', req.query.from, req.query.to);
  const pageId = parseInt(req.query.page, 10) || null;

  const spec = EXPORTS[kind];
  const rows = spec.rows({ ...bounds, pageId });

  const esc = (v) => {
    const text = String(v == null ? '' : v);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines = [spec.header.join(',')];
  rows.forEach((row) => lines.push(row.map(esc).join(',')));

  const pageName = pageId
    ? (db.prepare('SELECT name_ar FROM pages WHERE id = ?').get(pageId) || {}).name_ar
    : null;

  audit.log(req, 'revenue.export', {
    type: 'settings',
    details: `صدّر «${spec.label}» — ${rows.length} صف` +
      ` عن ${bounds.from} إلى ${bounds.to}${pageName ? ` (${pageName})` : ''}`,
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="sanad-${kind}-${bounds.from}-to-${bounds.to}.csv"`
  );
  // A byte-order mark, or Excel reads the Arabic as mojibake.
  res.end(Buffer.from('﻿' + lines.join('\r\n'), 'utf8'));
});
router.get('/print',can('revenue.export'),(req,res)=>{const kind=EXPORTS[req.query.kind]?req.query.kind:'payments',bounds=payments.periodBounds(req.query.period||'month',req.query.from,req.query.to),spec=EXPORTS[kind],rows=spec.rows({...bounds,pageId:parseInt(req.query.page,10)||null});require('../../lib/reporting').print(res,`${spec.label} — ${bounds.from} إلى ${bounds.to}`,spec.header,rows)});

// ---------------------------------------------------------------- receipts
router.get('/receipt/:id', (req, res) => {
  const p = db.prepare('SELECT receipt_file FROM payments WHERE id = ?').get(req.params.id);
  if (!p || !p.receipt_file) return res.status(404).end();

  const full = path.join(UPLOAD_DIR, path.basename(p.receipt_file));
  if (!full.startsWith(UPLOAD_DIR) || !fs.existsSync(full)) return res.status(404).end();

  res.setHeader('Content-Type', full.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
  res.setHeader('Cache-Control', 'private, no-store');
  fs.createReadStream(full).pipe(res);
});

// ---------------------------------------------------------------- recording
router.post(
  '/request/:id',
  canEditMoney,
  (req, res, next) => {
    receiptUpload.single('receipt')(req, res, (err) => {
      if (err) {
        return res.redirect(`${req.adminPath}/requests/${req.params.id}?msg=bad_receipt`);
      }
      next();
    });
  },
  csrf.verifyDeferred,
  async (req, res) => {
    const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
    if (!request) return res.status(404).render('errors/404');

    const back = `${req.adminPath}/requests/${request.id}`;
    const amount = parseAmount(req.body.amount);
    const method = payments.METHODS[req.body.method] ? req.body.method : null;
    const paidOn = validDate(req.body.paid_on);

    if (!amount || !method || !paidOn) {
      return res.redirect(`${back}?msg=bad_payment`);
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
      `INSERT INTO payments (request_id, amount, method, paid_on, reference, note,
                             receipt_file, recorded_by, recorded_by_id)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(
      request.id, amount, method, paidOn,
      (req.body.reference || '').trim().slice(0, 120) || null,
      (req.body.note || '').trim().slice(0, 300) || null,
      receipt, me(req), req.session.user.id
    );

    const newTotal = payments.recalc(request.id);

    audit.log(req, 'request.payment', {
      type: 'request',
      id: request.id,
      label: request.ref,
      details: `سجّل دفعة ${amount} (${payments.methodLabel(method)}) بتاريخ ${paidOn}. المدفوع بقى ${newTotal}`,
    });

    const balance = payments.balanceFor(request.id);
    const settled = balance && balance.settled;

    notify.notify(request.id, {
      type: settled ? 'payment_complete' : 'payment',
      text: settled
        ? `✅ ${request.ref} اكتمل السداد — ${request.name}`
        : `💰 دفعة ${amount.toLocaleString('en-US')} على ${request.ref} (${payments.methodLabel(method)}) — ${request.name}`,
      byUserId: req.session.user.id,
      includeLawyers: false,
      includeAccountants: true,
    });

    res.redirect(`${back}?msg=payment_added`);
  }
);

/**
 * Payments are voided, never deleted.
 *
 * A ledger that can lose rows is not a ledger. A wrong entry stays visible with
 * the reason it was reversed, which is also what makes the audit trail worth
 * reading later.
 */
router.post('/:id/void', canEditMoney, (req, res) => {
  const p = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!p || p.voided_at) return res.redirect(req.adminPath + '/revenue');

  const reason = (req.body.reason || '').trim();
  const request = db.prepare('SELECT ref FROM requests WHERE id = ?').get(p.request_id);
  const back = `${req.adminPath}/requests/${p.request_id}`;

  if (reason.length < 3) return res.redirect(`${back}?msg=need_void_reason`);

  db.prepare(
    "UPDATE payments SET voided_at = datetime('now'), voided_by = ?, void_reason = ? WHERE id = ?"
  ).run(me(req), reason.slice(0, 300), p.id);

  const newTotal = payments.recalc(p.request_id);

  notify.notify(p.request_id, {
    type: 'payment_void',
    text: `↩ اتلغت دفعة ${p.amount.toLocaleString('en-US')} على ${request ? request.ref : ''} — ${reason}`,
    byUserId: req.session.user.id,
    includeLawyers: false,
    includeAccountants: true,
  });

  audit.log(req, 'request.payment_void', {
    type: 'request',
    id: p.request_id,
    label: request ? request.ref : null,
    details: `ألغى دفعة ${p.amount} بتاريخ ${p.paid_on} — السبب: ${reason}. المدفوع بقى ${newTotal}`,
  });

  res.redirect(`${back}?msg=payment_voided`);
});

// ---------------------------------------------------------------- discount
router.post('/request/:id/discount', canEditMoney, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).render('errors/404');

  const back = `${req.adminPath}/requests/${request.id}`;
  const raw = String(req.body.discount || '').trim();
  const value = raw ? parseAmount(raw) : 0;
  const reason = (req.body.discount_reason || '').trim();

  if (raw && value === null) return res.redirect(`${back}?msg=bad_amount`);
  if (value > 0 && reason.length < 3) return res.redirect(`${back}?msg=need_discount_reason`);

  db.prepare('UPDATE requests SET discount = ?, discount_reason = ? WHERE id = ?').run(
    value || 0,
    value > 0 ? reason.slice(0, 200) : null,
    request.id
  );

  audit.log(req, 'request.discount', {
    type: 'request',
    id: request.id,
    label: request.ref,
    details: value > 0 ? `خصم ${value} — السبب: ${reason}` : 'شال الخصم',
  });

  res.redirect(`${back}?msg=discount_saved`);
});

/**
 * Writing off an uncollectable balance.
 *
 * Not a discount and not a deletion: the amount stays on the record as money
 * that was owed and will not arrive. It leaves the outstanding total — which
 * is the point, because a receivable figure padded with debts nobody expects
 * to collect is a figure people stop trusting.
 */
router.post('/request/:id/write-off', canEditMoney, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).render('errors/404');

  const back = `${req.adminPath}/requests/${request.id}`;
  const clearing = req.body.clear === '1';

  if (clearing) {
    db.prepare(
      'UPDATE requests SET written_off = 0, write_off_reason = NULL, write_off_by = NULL, write_off_at = NULL WHERE id = ?'
    ).run(request.id);

    audit.log(req, 'request.write_off_clear', {
      type: 'request',
      id: request.id,
      label: request.ref,
      details: `تراجع عن إعدام دين ${request.written_off}`,
    });
    return res.redirect(`${back}?msg=writeoff_cleared`);
  }

  const owed =
    (request.total_amount || 0) - (request.discount || 0) - (request.paid_amount || 0);
  const amount = parseAmount(req.body.amount) || Math.round(owed * 100) / 100;
  const reason = (req.body.reason || '').trim();

  if (amount <= 0) return res.redirect(`${back}?msg=nothing_owed`);
  if (amount > owed + 0.01) return res.redirect(`${back}?msg=writeoff_too_big`);
  if (reason.length < 5) return res.redirect(`${back}?msg=need_writeoff_reason`);

  db.prepare(
    `UPDATE requests SET written_off = ?, write_off_reason = ?, write_off_by = ?,
                         write_off_at = datetime('now')
     WHERE id = ?`
  ).run(amount, reason.slice(0, 300), me(req), request.id);

  audit.log(req, 'request.write_off', {
    type: 'request',
    id: request.id,
    label: request.ref,
    details: `أعدم دين ${amount} — السبب: ${reason}`,
  });

  res.redirect(`${back}?msg=writeoff_saved`);
});

module.exports = router;
