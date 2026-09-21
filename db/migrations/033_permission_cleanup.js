/**
 * Permissions must not outlive the account they belong to.
 *
 * The table was created without a foreign key to `users`, so deleting a member
 * of staff left their exceptions behind. SQLite reuses row ids, which means the
 * next account created could inherit permissions somebody else was given — an
 * account nobody granted anything to, quietly holding another person's access.
 *
 * The rebuild adds the cascade and clears anything already orphaned.
 */
exports.up = (db) => {
  const fk = db
    .prepare('PRAGMA foreign_key_list(user_permissions)')
    .all()
    .find((f) => f.table === 'users');

  if (fk && fk.on_delete === 'CASCADE') return;

  db.pragma('foreign_keys = OFF');

  db.exec(`
    CREATE TABLE user_permissions_new (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission TEXT NOT NULL,
      granted    INTEGER NOT NULL,
      reason     TEXT,
      set_by     TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, permission)
    );

    -- Only rows whose account still exists come across.
    INSERT INTO user_permissions_new
      (id, user_id, permission, granted, reason, set_by, created_at)
    SELECT p.id, p.user_id, p.permission, p.granted, p.reason, p.set_by, p.created_at
    FROM user_permissions p
    WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = p.user_id);

    DROP TABLE user_permissions;
    ALTER TABLE user_permissions_new RENAME TO user_permissions;

    CREATE INDEX IF NOT EXISTS idx_user_perms ON user_permissions(user_id);
  `);

  db.pragma('foreign_keys = ON');
};
