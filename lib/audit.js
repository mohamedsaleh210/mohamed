const { db } = require('../db');

const insert = db.prepare(`
  INSERT INTO audit_log (user_id, user_label, action, entity_type, entity_id, entity_label, details, ip, latitude, longitude)
  VALUES (@user_id, @user_label, @action, @entity_type, @entity_id, @entity_label, @details, @ip, @latitude, @longitude)
`);

/**
 * Records an action against the audit trail.
 *
 *   log(req, 'category.delete', { type: 'category', id: 4, label: 'خدمات الأجانب' });
 *
 * `details` is free-form and is what makes an entry readable months later —
 * prefer "غيّر الحالة من (جديد) إلى (جارٍ التنفيذ)" over "updated".
 */
function log(req, action, { type = null, id = null, label = null, details = null } = {}) {
  const user = req?.session?.user || null;
  try {
    const lastLocation = user ? db.prepare(`SELECT ip,latitude,longitude FROM login_history WHERE user_id=? AND success=1 ORDER BY id DESC LIMIT 1`).get(user.id) : null;
    insert.run({
      user_id: user ? user.id : null,
      user_label: user ? user.display_name || user.username : 'النظام',
      action,
      entity_type: type,
      entity_id: id,
      entity_label: label,
      details,
      ip: req ? require('./security').ipOf(req) : (lastLocation && lastLocation.ip) || null,
      latitude: lastLocation && lastLocation.latitude,
      longitude: lastLocation && lastLocation.longitude,
    });
  } catch (err) {
    // Logging must never take down the action it was recording.
    console.error('audit log failed:', err.message);
  }
}

// Entries whose text contains figures. A lawyer never sees the money side of a
// request, so these must not reach them through the activity trail either.
/**
 * Entries that carry an amount.
 *
 * This list only covered fee lines, so every payment, expense, discount and
 * write-off was readable in the trail by somebody with no right to see a single
 * figure — the money panel was hidden from them while the history of it was
 * not. Anything that touches money belongs here.
 */
const MONEY_ACTIONS = [
  'request.fee_add',
  'request.fee_edit',
  'request.fee_delete',
  'request.payment',
  'request.payment_void',
  'request.discount',
  'request.write_off',
  'request.write_off_clear',
  'request.expense',
  'request.expense_void',
  'request.expense_reimburse',
  'revenue.export',
];

/*
 * Anything whose action names money, plus an update whose text does. Matching
 * on the prefix as well as the list means a new money action is hidden by
 * default rather than exposed until somebody remembers to add it.
 */
const isMoneyEntry = (row) =>
  MONEY_ACTIONS.includes(row.action) ||
  /payment|fee|expense|discount|write_off|revenue/.test(row.action || '') ||
  (row.action === 'request.update' &&
    /المدفوع|الأتعاب|الإجمالي|خصم|مصروف|دفعة/.test(row.details || ''));

/**
 * The activity trail for one record, newest first.
 * Pass includeMoney: false for viewers who are not allowed to see amounts.
 */
function forEntity(type, id, limit = 100, { includeMoney = true } = {}) {
  const rows = db
    .prepare(
      `SELECT * FROM audit_log WHERE entity_type = ? AND entity_id = ?
       ORDER BY id DESC LIMIT ?`
    )
    .all(type, id, limit);

  return includeMoney ? rows : rows.filter((r) => !isMoneyEntry(r));
}

/** Site-wide trail with optional filters, for the admin log page. */
function recent({ action = '', userId = null, limit = 200 } = {}) {
  let sql = 'SELECT * FROM audit_log WHERE 1=1';
  const params = [];
  if (action) {
    sql += ' AND action LIKE ?';
    params.push(`${action}%`);
  }
  if (userId) {
    sql += ' AND user_id = ?';
    params.push(userId);
  }
  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(limit);
  return db.prepare(sql).all(...params);
}

module.exports = { log, forEntity, recent };
