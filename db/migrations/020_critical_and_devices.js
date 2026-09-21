const { addColumn } = require('../migrate');

// Urgency on a request, and a record of the devices staff sign in from.
exports.up = (db) => {
  // Some requests genuinely cannot wait — a client flying out, a deadline tied
  // to something outside the office. Marking that is only useful if the reason
  // travels with it, otherwise the flag becomes noise nobody trusts.
  addColumn(db, 'requests', 'is_critical', 'INTEGER DEFAULT 0');
  addColumn(db, 'requests', 'critical_reason', 'TEXT');
  addColumn(db, 'requests', 'critical_by', 'TEXT');
  addColumn(db, 'requests', 'critical_at', 'TEXT');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_requests_critical
      ON requests(is_critical) WHERE is_critical = 1 AND archived_at IS NULL;
  `);

  // A device fingerprint per account. The first time a combination appears,
  // the admins hear about it — a sign-in from somewhere new is the earliest
  // visible sign of a shared or stolen password.
  db.exec(`
    CREATE TABLE IF NOT EXISTS known_devices (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      fingerprint TEXT NOT NULL,
      label       TEXT,
      ip          TEXT,
      first_seen  TEXT DEFAULT (datetime('now')),
      last_seen   TEXT DEFAULT (datetime('now')),
      seen_count  INTEGER DEFAULT 1,
      UNIQUE(user_id, fingerprint)
    );
    CREATE INDEX IF NOT EXISTS idx_devices_user ON known_devices(user_id);
  `);

  // Existing sign-in history seeds the known devices, so switching this on does
  // not announce every regular device at once as if it were new.
  const history = db
    .prepare(
      `SELECT user_id, device, browser, os, ip, MIN(created_at) AS first_seen,
              MAX(created_at) AS last_seen, COUNT(*) AS n
       FROM login_history
       WHERE success = 1 AND user_id IS NOT NULL
       GROUP BY user_id, device, browser, os`
    )
    .all();

  const ins = db.prepare(
    `INSERT OR IGNORE INTO known_devices
       (user_id, fingerprint, label, ip, first_seen, last_seen, seen_count)
     VALUES (?,?,?,?,?,?,?)`
  );

  history.forEach((h) => {
    ins.run(
      h.user_id,
      `${h.device}|${h.browser}|${h.os}`,
      `${h.device} · ${h.browser} · ${h.os}`,
      h.ip,
      h.first_seen,
      h.last_seen,
      h.n
    );
  });
};
