const { addColumn } = require('../migrate');

// Phase 0 — the plumbing every later feature depends on:
// persistent sessions, an audit trail, and real account fields.
exports.up = (db) => {
  // Sessions were held in server memory, so every deploy logged everyone out.
  // Once clients have accounts that becomes a visible problem, not a nuisance.
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid        TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);

  // "Who did what" — every state change in the system lands here.
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER,
      user_label   TEXT,
      action       TEXT NOT NULL,
      entity_type  TEXT,
      entity_id    INTEGER,
      entity_label TEXT,
      details      TEXT,
      created_at   TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
  `);

  // Staff accounts grow: deactivation instead of deletion (so history survives),
  // a forced first-login password change, and contact details.
  addColumn(db, 'users', 'active', 'INTEGER DEFAULT 1');
  addColumn(db, 'users', 'must_change_password', 'INTEGER DEFAULT 0');
  addColumn(db, 'users', 'email', 'TEXT');
  addColumn(db, 'users', 'phone', 'TEXT');
  addColumn(db, 'users', 'created_by', 'TEXT');
  addColumn(db, 'users', 'deactivated_at', 'TEXT');

  db.exec(`UPDATE users SET active = 1 WHERE active IS NULL`);
  db.exec(`UPDATE users SET must_change_password = 0 WHERE must_change_password IS NULL`);
};
