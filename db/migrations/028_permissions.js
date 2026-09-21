const { addColumn } = require('../migrate');

/**
 * Per-person permission exceptions, and the assignment lock.
 *
 * Only exceptions are stored: what the role already gives is not repeated in
 * the table. That way changing a role's defaults takes effect for everyone who
 * has not been explicitly overridden, instead of leaving a copy of yesterday's
 * rules on every account.
 */
exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_permissions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission TEXT NOT NULL,
      granted    INTEGER NOT NULL,
      reason     TEXT,
      set_by     TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, permission)
    );
    CREATE INDEX IF NOT EXISTS idx_user_perms ON user_permissions(user_id);
  `);

  // "Do not put new work on me" — leave, travel, or simply too much on already.
  // The reason is required so colleagues know whether to wait or reassign.
  addColumn(db, 'users', 'assign_locked', 'INTEGER DEFAULT 0');
  addColumn(db, 'users', 'assign_lock_reason', 'TEXT');
  addColumn(db, 'users', 'assign_lock_until', 'TEXT');
  addColumn(db, 'users', 'assign_lock_by', 'TEXT');
  addColumn(db, 'users', 'assign_lock_at', 'TEXT');
};
