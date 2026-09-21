// Persistent login-throttle storage. The migration runner expects every
// migration module to expose an `up(db)` function.
exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_throttle (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      last_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_login_throttle_last ON login_throttle(last_at);
  `);
};
