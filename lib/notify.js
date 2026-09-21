const { db } = require('../db');

/**
 * Who should hear about something happening on a request:
 * admins, supervisors, and the lawyers assigned to it — minus whoever did it,
 * since nobody needs telling about their own action.
 */
function audienceFor(requestId, { excludeUserId = null, includeLawyers = true, includeAccountants = false } = {}) {
  const roles = ['admin', 'supervisor'];
  // Accountants hear about money and nothing else — including them in every
  // notification would bury the payments they actually need to see.
  if (includeAccountants) roles.push('accountant');

  const staff = db
    .prepare(
      `SELECT id FROM users WHERE active = 1 AND role IN (${roles.map(() => '?').join(',')})`
    )
    .all(...roles)
    .map((r) => r.id);

  const lawyers = includeLawyers
    ? db
        .prepare(
          `SELECT u.id FROM request_assignees a
           JOIN users u ON u.id = a.user_id
           WHERE a.request_id = ? AND u.active = 1`
        )
        .all(requestId)
        .map((r) => r.id)
    : [];

  return [...new Set([...staff, ...lawyers])].filter((id) => id !== excludeUserId);
}

const insert = db.prepare(`
  INSERT INTO notifications (user_id, type, request_id, comment_id, text, priority)
  VALUES (?, ?, ?, ?, ?, ?)
`);

/**
 * Sends a notification to everyone who should see it.
 * `includeLawyers: false` is how payment events stay invisible to lawyers.
 */
function notify(
  requestId,
  {
    type,
    text,
    commentId = null,
    byUserId = null,
    includeLawyers = true,
    includeAccountants = false,
    priority = 'normal',
  }
) {
  const ids = audienceFor(requestId, {
    excludeUserId: byUserId,
    includeLawyers,
    includeAccountants,
  });
  const run = db.transaction(() => {
    ids.forEach((uid) => insert.run(uid, type, requestId, commentId, text, priority));
  });
  run();
  return ids.length;
}

/** Notifies specific people only — used for "you were assigned to this". */
/**
 * Tells every administrator that something was destroyed.
 *
 * Erasing a client or a request is recorded in the audit trail, but a trail is
 * something somebody has to go and open. If a member of staff with the erase
 * permission removes five clients this week, nobody responsible finds out
 * unless they happen to look — which is the same as nobody finding out.
 *
 * Critical priority, and never sent to the person who did it: they already know.
 */
function notifyAdmins({ type, text, byUserId = null, requestId = null }) {
  const admins = db
    .prepare("SELECT id FROM users WHERE role = 'admin' AND active = 1")
    .all()
    .map((u) => u.id)
    .filter((id) => id !== byUserId);

  if (!admins.length) return 0;

  const run = db.transaction(() => {
    admins.forEach((uid) => insert.run(uid, type, requestId, null, text, 'critical'));
  });
  run();

  return admins.length;
}

function notifyUsers(userIds, requestId, { type, text, commentId = null, priority = 'normal' }) {
  const run = db.transaction(() => {
    userIds.forEach((uid) => insert.run(uid, type, requestId, commentId, text, priority));
  });
  run();
}

const unseenCount = (userId) =>
  db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND seen_at IS NULL').get(userId).c;

const listFor = (userId, { onlyUnseen = false, limit = 60 } = {}) =>
  db
    .prepare(
      `SELECT n.*, r.ref, r.name AS client_name
       FROM notifications n
       LEFT JOIN requests r ON r.id = n.request_id
       WHERE n.user_id = ? ${onlyUnseen ? 'AND n.seen_at IS NULL' : ''}
       ORDER BY n.id DESC LIMIT ?`
    )
    .all(userId, limit);

const markSeen = (id, userId) =>
  db
    .prepare("UPDATE notifications SET seen_at = datetime('now') WHERE id = ? AND user_id = ?")
    .run(id, userId);

const markAllSeen = (userId) =>
  db
    .prepare("UPDATE notifications SET seen_at = datetime('now') WHERE user_id = ? AND seen_at IS NULL")
    .run(userId);

/**
 * Housekeeping.
 *
 * Unread notifications are never touched — the whole point is that they stay
 * until somebody says they have seen them. Read ones are history, so they are
 * dropped after a month, and a hard ceiling per person stops a busy account
 * from carrying thousands of rows forever.
 */
const KEEP_READ_DAYS = 30;
const MAX_PER_USER = 500;

function prune() {
  const removed = db
    .prepare(
      `DELETE FROM notifications
       WHERE seen_at IS NOT NULL AND seen_at < datetime('now', ?)`
    )
    .run(`-${KEEP_READ_DAYS} days`).changes;

  // Trim anyone over the ceiling, oldest read first — unread rows survive.
  const heavy = db
    .prepare(
      `SELECT user_id, COUNT(*) c FROM notifications
       GROUP BY user_id HAVING c > ?`
    )
    .all(MAX_PER_USER);

  let trimmed = 0;
  heavy.forEach((u) => {
    trimmed += db
      .prepare(
        `DELETE FROM notifications WHERE id IN (
           SELECT id FROM notifications
           WHERE user_id = ? AND seen_at IS NOT NULL
           ORDER BY id ASC LIMIT ?
         )`
      )
      .run(u.user_id, u.c - MAX_PER_USER).changes;
  });

  return removed + trimmed;
}

/** Runs once at boot and daily after that. */
function startHousekeeping() {
  const run = () => {
    try {
      const n = prune();
      if (n) console.log(`  Notification cleanup: removed ${n} old read notification(s)`);
    } catch (err) {
      console.error('notification prune failed:', err.message);
    }
  };

  run();
  const timer = setInterval(run, 24 * 60 * 60 * 1000);
  if (timer.unref) timer.unref();
}

module.exports = {
  notifyAdmins,
  notify,
  notifyUsers,
  unseenCount,
  listFor,
  markSeen,
  markAllSeen,
  prune,
  startHousekeeping,
  KEEP_READ_DAYS,
};
