const { db } = require('../db');

/**
 * Payment methods.
 *
 * The list is fixed rather than free text, because a revenue report that
 * groups by a typed string ends up with "انستاباي", "إنستاباي" and "Instapay"
 * as three separate rows. `needsReference` marks the methods where a
 * transaction number exists and is worth chasing.
 */
const METHODS = {
  cash: { ar: 'كاش في المكتب', en: 'Cash at the office', icon: '💵', needsReference: false },
  bank: { ar: 'تحويل بنكي', en: 'Bank transfer', icon: '🏦', needsReference: true },
  bank_intl: {
    ar: 'تحويل بنكي من الخارج',
    en: 'International bank transfer',
    icon: '🌍',
    needsReference: true,
  },
  instapay: { ar: 'إنستاباي', en: 'InstaPay', icon: '📲', needsReference: true },
  wallet: { ar: 'محفظة إلكترونية', en: 'Mobile wallet', icon: '📱', needsReference: true },
  remittance: { ar: 'حوالة', en: 'Remittance', icon: '✉️', needsReference: true },
  cheque: { ar: 'شيك', en: 'Cheque', icon: '🧾', needsReference: true },
  other: { ar: 'طريقة أخرى', en: 'Other', icon: '•', needsReference: false },
  unknown: { ar: 'غير محدّدة', en: 'Unspecified', icon: '?', needsReference: false },
};

const methodLabel = (key) => (METHODS[key] ? METHODS[key].ar : key);

/** Only the methods staff should be able to pick; `unknown` is historical. */
const selectableMethods = () =>
  Object.entries(METHODS)
    .filter(([key]) => key !== 'unknown')
    .map(([key, m]) => ({ key, ...m }));

/**
 * Keeps requests.paid_amount equal to the sum of its live payments.
 *
 * Derived rather than typed, exactly like the fee total: two places holding
 * the same number is two places that can disagree, and the one people trust is
 * whichever they happened to look at.
 */
function recalc(requestId) {
  const sum = db
    .prepare(
      'SELECT COALESCE(SUM(amount), 0) t FROM payments WHERE request_id = ? AND voided_at IS NULL'
    )
    .get(requestId).t;

  db.prepare('UPDATE requests SET paid_amount = ? WHERE id = ?').run(sum, requestId);
  return sum;
}

const listFor = (requestId) =>
  db
    .prepare('SELECT * FROM payments WHERE request_id = ? ORDER BY paid_on DESC, id DESC')
    .all(requestId)
    .map((p) => ({ ...p, methodLabel: methodLabel(p.method) }));

/**
 * The balance on one request: what was charged, what a discount took off, what
 * came in, and what is still owed.
 */
function balanceFor(requestId) {
  const r = db
    .prepare(
      'SELECT total_amount, paid_amount, discount, written_off, write_off_reason FROM requests WHERE id = ?'
    )
    .get(requestId);
  if (!r) return null;

  const billed = r.total_amount || 0;
  const discount = r.discount || 0;
  const writtenOff = r.written_off || 0;
  const paid = r.paid_amount || 0;

  // What is still collectable: billed, less anything given away and anything
  // given up on.
  const due = Math.max(0, billed - discount - writtenOff);

  return {
    billed,
    discount,
    writtenOff,
    writeOffReason: r.write_off_reason,
    due,
    paid,
    remaining: Math.round((due - paid) * 100) / 100,
    settled: paid >= due - 0.01,
    overpaid: paid > due + 0.01,
  };
}

// ---------------------------------------------------------------- reporting

/** A day is stored as YYYY-MM-DD, so period bounds are plain string compares. */
function periodBounds(period, from, to) {
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const shift = (days) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return iso(d);
  };

  switch (period) {
    case 'today':
      return { from: iso(today), to: iso(today), label: 'اليوم' };
    case 'week':
      return { from: shift(6), to: iso(today), label: 'آخر ٧ أيام' };
    case 'month':
      return { from: shift(29), to: iso(today), label: 'آخر ٣٠ يوم' };
    case 'quarter':
      return { from: shift(89), to: iso(today), label: 'آخر ٣ شهور' };
    case 'year':
      return { from: shift(364), to: iso(today), label: 'آخر سنة' };
    case 'this_month': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: iso(first), to: iso(today), label: 'الشهر ده' };
    }
    case 'last_month': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: iso(first), to: iso(last), label: 'الشهر اللي فات' };
    }
    case 'custom':
      return {
        from: /^\d{4}-\d{2}-\d{2}$/.test(from || '') ? from : shift(29),
        to: /^\d{4}-\d{2}-\d{2}$/.test(to || '') ? to : iso(today),
        label: 'فترة محددة',
      };
    default:
      return { from: shift(29), to: iso(today), label: 'آخر ٣٠ يوم' };
  }
}

/** Everything the revenue page needs, for one period, in one place. */
function report({ from, to }) {
  const range = [from, to];

  const totals = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS collected, COUNT(*) AS count,
              COUNT(DISTINCT request_id) AS requests
       FROM payments
       WHERE voided_at IS NULL AND paid_on BETWEEN ? AND ?`
    )
    .get(...range);

  const byMethod = db
    .prepare(
      `SELECT method, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
       FROM payments
       WHERE voided_at IS NULL AND paid_on BETWEEN ? AND ?
       GROUP BY method ORDER BY total DESC`
    )
    .all(...range)
    .map((m) => ({ ...m, label: methodLabel(m.method) }));

  const byDay = db
    .prepare(
      `SELECT paid_on AS day, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
       FROM payments
       WHERE voided_at IS NULL AND paid_on BETWEEN ? AND ?
       GROUP BY paid_on ORDER BY paid_on`
    )
    .all(...range);

  // Attributed to the service on the request, so the office can see which work
  // actually earns rather than which is most requested.
  const byService = db
    .prepare(
      `SELECT COALESCE(c.name_ar, 'بدون قسم') AS category,
              COALESCE(s.title_ar, 'بدون خدمة') AS service,
              COALESCE(SUM(p.amount), 0) AS total, COUNT(*) AS count
       FROM payments p
       JOIN requests r ON r.id = p.request_id
       LEFT JOIN services s ON s.id = r.service_id
       LEFT JOIN categories c ON c.id = s.category_id
       WHERE p.voided_at IS NULL AND p.paid_on BETWEEN ? AND ?
       GROUP BY s.id ORDER BY total DESC LIMIT 20`
    )
    .all(...range);

  const byStaff = db
    .prepare(
      `SELECT COALESCE(recorded_by, 'غير معروف') AS staff,
              COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
       FROM payments
       WHERE voided_at IS NULL AND paid_on BETWEEN ? AND ?
       GROUP BY recorded_by ORDER BY total DESC`
    )
    .all(...range);

  // Outstanding is a snapshot of now, not of the period — money owed does not
  // belong to the month it was billed in.
  const outstanding = db
    .prepare(
      `SELECT COALESCE(SUM(MAX(0,
                r.total_amount - COALESCE(r.discount,0) - COALESCE(r.written_off,0) - r.paid_amount
              )), 0) AS amount,
              COUNT(*) AS requests
       FROM requests r
       WHERE r.archived_at IS NULL
         AND r.status != 'cancelled'
         AND r.total_amount - COALESCE(r.discount,0) - COALESCE(r.written_off,0) - r.paid_amount > 0.01`
    )
    .get();

  const topDebtors = db
    .prepare(
      `SELECT r.id, r.ref, r.name, r.status,
              (r.total_amount - COALESCE(r.discount,0) - COALESCE(r.written_off,0) - r.paid_amount) AS owed
       FROM requests r
       WHERE r.archived_at IS NULL AND r.status != 'cancelled'
         AND r.total_amount - COALESCE(r.discount,0) - COALESCE(r.written_off,0) - r.paid_amount > 0.01
       ORDER BY owed DESC LIMIT 10`
    )
    .all();

  const voided = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count
       FROM payments WHERE voided_at IS NOT NULL AND paid_on BETWEEN ? AND ?`
    )
    .get(...range);

  const discounts = db
    .prepare(
      `SELECT COALESCE(SUM(discount), 0) AS amount, COUNT(*) AS requests
       FROM requests WHERE discount > 0 AND archived_at IS NULL`
    )
    .get();

  // Reported separately: a written-off debt is a fact worth seeing, not
  // something to quietly remove from the page.
  const writtenOff = db
    .prepare(
      `SELECT COALESCE(SUM(written_off), 0) AS amount, COUNT(*) AS requests
       FROM requests WHERE written_off > 0 AND archived_at IS NULL`
    )
    .get();

  const writeOffList = db
    .prepare(
      `SELECT id, ref, name, written_off, write_off_reason, write_off_by, write_off_at
       FROM requests WHERE written_off > 0 AND archived_at IS NULL
       ORDER BY write_off_at DESC LIMIT 10`
    )
    .all();

  return {
    totals, byMethod, byDay, byService, byStaff,
    outstanding, topDebtors, voided, discounts, writtenOff, writeOffList,
  };
}

/** Rows for the CSV export, flat and already labelled. */
const exportRows = ({ from, to }) =>
  db
    .prepare(
      `SELECT p.paid_on, p.amount, p.method, p.reference, p.note,
              p.recorded_by, r.ref, r.name, r.service_label
       FROM payments p
       JOIN requests r ON r.id = p.request_id
       WHERE p.voided_at IS NULL AND p.paid_on BETWEEN ? AND ?
       ORDER BY p.paid_on, p.id`
    )
    .all(from, to)
    .map((row) => ({ ...row, methodLabel: methodLabel(row.method) }));

module.exports = {
  METHODS,
  methodLabel,
  selectableMethods,
  recalc,
  listFor,
  balanceFor,
  periodBounds,
  report,
  exportRows,
};
