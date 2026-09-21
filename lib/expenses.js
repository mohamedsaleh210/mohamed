const { db } = require('../db');

/**
 * Expenses recorded against a request.
 *
 * Kept apart from fees on purpose: a fee is what the client owes, an expense is
 * what the work cost. Mixing them makes the totals unreadable — you can no
 * longer tell a profitable file from a busy one.
 */
/**
 * The categories, read from the database so the office can add its own.
 *
 * Cached per call rather than at module load: a category added in the panel has
 * to appear on the next screen, not after a restart.
 */
function categories({ includeHidden = false } = {}) {
  const rows = db
    .prepare(
      `SELECT * FROM expense_categories
       ${includeHidden ? '' : 'WHERE active = 1'}
       ORDER BY sort, id`
    )
    .all();

  const out = {};
  rows.forEach((r) => {
    out[r.key] = { ar: r.label_ar, icon: r.icon || '•', builtIn: !!r.built_in, id: r.id };
  });
  return out;
}

/**
 * A category's name, including ones that have been hidden.
 *
 * An expense filed last year against a category the office has since retired
 * still has to read correctly — hiding a category must not rewrite history.
 */
function label(key) {
  const row = db.prepare('SELECT label_ar FROM expense_categories WHERE key = ?').get(key);
  return row ? row.label_ar : key;
}

// Kept as a property so existing callers reading CATEGORIES still work.
const CATEGORIES = new Proxy({}, {
  get: (_, prop) => categories()[prop],
  has: (_, prop) => prop in categories(),
  ownKeys: () => Reflect.ownKeys(categories()),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});

const listFor = (requestId) =>
  db
    .prepare('SELECT * FROM expenses WHERE request_id = ? ORDER BY spent_on DESC, id DESC')
    .all(requestId)
    .map((e) => ({ ...e, categoryLabel: label(e.category) }));

/**
 * What a request cost, split by who bears it.
 *
 * `office` is the figure that matters for profit; `onClient` is recovered
 * through the fee quote and so is reported but not subtracted.
 */
function totalsFor(requestId) {
  const rows = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN on_client = 0 THEN amount ELSE 0 END), 0) AS office,
              COALESCE(SUM(CASE WHEN on_client = 1 THEN amount ELSE 0 END), 0) AS onClient,
              COALESCE(SUM(CASE WHEN reimbursed_at IS NULL THEN amount ELSE 0 END), 0) AS owedToStaff,
              COUNT(*) AS count
       FROM expenses WHERE request_id = ? AND voided_at IS NULL`
    )
    .get(requestId);

  return { ...rows, total: rows.office + rows.onClient };
}

/** The same picture for a period, for the revenue page. */
function report({ from, to }) {
  const totals = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total,
              COALESCE(SUM(CASE WHEN on_client = 0 THEN amount ELSE 0 END), 0) AS office,
              COALESCE(SUM(CASE WHEN on_client = 1 THEN amount ELSE 0 END), 0) AS onClient,
              COUNT(*) AS count
       FROM expenses
       WHERE voided_at IS NULL AND spent_on BETWEEN ? AND ?`
    )
    .get(from, to);

  const byCategory = db
    .prepare(
      `SELECT category, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
       FROM expenses WHERE voided_at IS NULL AND spent_on BETWEEN ? AND ?
       GROUP BY category ORDER BY total DESC`
    )
    .all(from, to)
    .map((r) => ({ ...r, label: label(r.category) }));

  const byStaff = db
    .prepare(
      `SELECT COALESCE(paid_by, 'غير معروف') AS staff,
              COALESCE(SUM(amount), 0) AS total,
              COALESCE(SUM(CASE WHEN reimbursed_at IS NULL THEN amount ELSE 0 END), 0) AS owed,
              COUNT(*) AS count
       FROM expenses WHERE voided_at IS NULL AND spent_on BETWEEN ? AND ?
       GROUP BY paid_by ORDER BY total DESC`
    )
    .all(from, to);

  // Money the office owes its own people, as a running total rather than a
  // period figure — a debt does not belong to the month it was incurred in.
  const owed = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count,
              COUNT(DISTINCT paid_by_id) AS people
       FROM expenses WHERE voided_at IS NULL AND reimbursed_at IS NULL`
    )
    .get();

  return { totals, byCategory, byStaff, owed };
}

/** What one person is still owed, for their own screen. */
const owedTo = (userId) =>
  db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count
       FROM expenses
       WHERE paid_by_id = ? AND reimbursed_at IS NULL AND voided_at IS NULL`
    )
    .get(userId);

module.exports = { CATEGORIES, categories, label, listFor, totalsFor, report, owedTo };
