const { db } = require('../db');
const notify = require('./notify');

/**
 * Deadline watch.
 *
 * A missed deadline is the one thing in this system that gets worse purely by
 * going unnoticed, so it is the one thing that announces itself rather than
 * waiting to be found on a list.
 *
 * Alerts go to everyone answerable for the request — the assigned lawyers, the
 * supervisors and the admins — because "someone else will have seen it" is how
 * a slipped date turns into a week.
 */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const OPEN_STATUSES = "('completed','cancelled')";

/**
 * Requests past their date that have not been announced today.
 *
 * Announcing once and stopping is how a slipped deadline quietly becomes a
 * forgotten one: the notice scrolls out of the inbox and nothing brings it
 * back. So it repeats every day, once, for as long as the request is open —
 * which also means the reminder stops the moment the work is done, without
 * anyone dismissing anything.
 */
function findOverdue() {
  const today = new Date().toISOString().slice(0, 10);

  return db
    .prepare(
      `SELECT id, ref, name, deadline, status, deadline_alerted_at
       FROM requests
       WHERE archived_at IS NULL
         AND deadline IS NOT NULL
         AND deadline < ?
         AND status NOT IN ${OPEN_STATUSES}
         AND (deadline_alerted_at IS NULL OR deadline_alerted_at < ?)
       ORDER BY deadline`
    )
    .all(today, today);
}

const daysLate = (deadline) =>
  Math.max(
    1,
    Math.round((Date.now() - new Date(deadline + 'T00:00:00Z').getTime()) / 86400000)
  );

/**
 * Sends one alert per overdue request per day.
 *
 * Today's date is the marker, not the deadline, so the check is simply "has
 * this been announced today". Moving the deadline forward removes it from the
 * list until that date passes too.
 */
function run() {
  const today = new Date().toISOString().slice(0, 10);
  let sent = 0;

  try {
    findOverdue().forEach((r) => {
      const late = daysLate(r.deadline);
      const text =
        late === 1
          ? `⚠ ${r.ref} تجاوز موعد التسليم بيوم — ${r.name}`
          : `⚠ ${r.ref} متأخر ${late} يوم عن موعد التسليم — ${r.name}`;

      notify.notify(r.id, { type: 'deadline_missed', text, priority: 'critical' });

      db.prepare('UPDATE requests SET deadline_alerted_at = ? WHERE id = ?').run(today, r.id);
      sent += 1;
    });
  } catch (err) {
    console.error('deadline watch failed:', err.message);
  }

  return sent;
}

/**
 * Runs shortly after boot, then each day just after midnight.
 *
 * Scheduled to the calendar rather than a fixed interval, so the notice is
 * waiting at the start of the working day instead of arriving at whatever hour
 * the server happened to restart.
 */
function start() {
  const tick = () => {
    const n = run();
    if (n) console.log(`  Deadline watch: ${n} overdue request(s) alerted`);

    // The failure that happens before a deadline exists.
    const waiting = alertUnclaimed();
    if (waiting) console.log(`  Unclaimed watch: ${waiting} request(s) nobody picked up`);
  };

  // A short delay so the first run does not compete with startup.
  const first = setTimeout(tick, 20 * 1000);
  if (first.unref) first.unref();

  const scheduleNextMidnight = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 1, 0, 0);

    const timer = setTimeout(() => {
      tick();
      scheduleNextMidnight();
    }, midnight - now);
    if (timer.unref) timer.unref();
  };

  scheduleNextMidnight();

  // A safety net: if the process sleeps through midnight, the next check still
  // catches it within a few hours.
  const backstop = setInterval(tick, CHECK_INTERVAL_MS);
  if (backstop.unref) backstop.unref();
}

/**
 * Requests nobody has picked up.
 *
 * The office watches deadlines closely, and misses the failure that happens
 * before a deadline exists: a request arrives, nobody is assigned, and it sits.
 * The client is waiting and the office does not know it has forgotten them —
 * there is no overdue date to trigger on, because nobody set one.
 *
 * Two days is the threshold: long enough that a weekend does not raise an
 * alarm, short enough that a client has not yet decided the office is ignoring
 * them.
 */
const UNCLAIMED_AFTER_DAYS = 2;

function unclaimed({ limit = 50 } = {}) {
  return db
    .prepare(
      `SELECT r.id, r.ref, r.name, r.service_label, r.page_label, r.created_at,
              CAST(julianday('now') - julianday(r.created_at) AS INTEGER) AS waiting_days
       FROM requests r
       WHERE r.archived_at IS NULL
         AND r.status NOT IN ('completed', 'cancelled')
         AND NOT EXISTS (SELECT 1 FROM request_assignees a WHERE a.request_id = r.id)
       ORDER BY r.created_at
       LIMIT ?`
    )
    .all(limit);
}

/**
 * Alerts supervisors about anything unclaimed past the threshold.
 *
 * Alerted once per request rather than daily: a second reminder about the same
 * forgotten file trains people to dismiss the first.
 */
function alertUnclaimed() {
  const waiting = unclaimed({ limit: 200 }).filter(
    (r) => r.waiting_days >= UNCLAIMED_AFTER_DAYS
  );
  if (!waiting.length) return 0;

  const recipients = db
    .prepare(
      `SELECT id FROM users WHERE active = 1
         AND (role = 'admin' OR role = 'supervisor')`
    )
    .all()
    .map((u) => u.id);

  if (!recipients.length) return 0;

  let sent = 0;

  waiting.forEach((r) => {
    // Once per request: the flag is what stops it repeating every night.
    const already = db
      .prepare(
        "SELECT 1 FROM notifications WHERE request_id = ? AND type = 'unclaimed' LIMIT 1"
      )
      .get(r.id);
    if (already) return;

    notify.notifyUsers(recipients, r.id, {
      type: 'unclaimed',
      text:
        `🕓 ${r.ref} مستني ${r.waiting_days} يوم ومحدش استلمه — ` +
        `${r.name}${r.page_label ? ` · ${r.page_label}` : ''}`,
      priority: r.waiting_days >= 5 ? 'critical' : 'high',
    });

    sent += 1;
  });

  return sent;
}

module.exports = {
  unclaimed,
  alertUnclaimed,
  UNCLAIMED_AFTER_DAYS, run, start, findOverdue, daysLate };
