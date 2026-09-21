// Persistent login throttling. Keeping the counter in SQLite means restarting
// the process cannot be used to reset the protection. Each tenant has its own
// database and its own credentials, so per-tenant counters are intentional.
const { db } = require('../db');

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const DISABLED = process.env.SANAD_NO_THROTTLE === '1' && process.env.NODE_ENV !== 'production';

function keyFor(req) {
  return String(req.ip || req.connection?.remoteAddress || 'unknown').slice(0, 180);
}

function retryAfter(req) {
  if (DISABLED) return 0;
  const key = keyFor(req);
  const rec = db.prepare('SELECT count,last_at FROM login_throttle WHERE key=?').get(key);
  if (!rec) return 0;
  const elapsed = Date.now() - Number(rec.last_at);
  if (elapsed > WINDOW_MS) {
    db.prepare('DELETE FROM login_throttle WHERE key=?').run(key);
    return 0;
  }
  if (Number(rec.count) < MAX_ATTEMPTS) return 0;
  return Math.ceil((WINDOW_MS - elapsed) / 1000);
}

function recordFailure(req) {
  if (DISABLED) return;
  const key = keyFor(req), now = Date.now();
  const rec = db.prepare('SELECT count,last_at FROM login_throttle WHERE key=?').get(key);
  const count = rec && now - Number(rec.last_at) <= WINDOW_MS ? Number(rec.count) + 1 : 1;
  db.prepare(`INSERT INTO login_throttle(key,count,last_at) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET count=excluded.count,last_at=excluded.last_at`).run(key,count,now);
  // opportunistic cleanup; avoids a timer and keeps the table tiny
  if (Math.random() < 0.03) db.prepare('DELETE FROM login_throttle WHERE last_at < ?').run(now - WINDOW_MS);
}

function clear(req) {
  db.prepare('DELETE FROM login_throttle WHERE key=?').run(keyFor(req));
}

function reset() {
  db.prepare('DELETE FROM login_throttle').run();
}

module.exports = { retryAfter, recordFailure, clear, reset, MAX_ATTEMPTS };
