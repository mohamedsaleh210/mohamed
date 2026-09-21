/**
 * Let a staff account be removed.
 *
 * `request_assignees` referenced users with no delete rule, so once somebody
 * had been assigned to a single request their account could never be deleted —
 * the constraint simply refused, with an error the panel showed as a failure
 * nobody could explain.
 *
 * Deactivating is still the right thing to do in almost every case: it keeps
 * the history readable and stops the person signing in. But "almost every case"
 * is not "every case" — an account created by mistake should be removable, and
 * an office that has been told to erase someone's data has to be able to.
 *
 * Cascade rather than set-null, because an assignment to nobody is not a fact
 * worth keeping; who did the work stays in the audit trail, which is where the
 * office actually reads history.
 */
exports.up = (db) => {
  const fks = db.prepare('PRAGMA foreign_key_list(request_assignees)').all();
  const needsFix = fks.some((f) => f.table === 'users' && f.on_delete !== 'CASCADE');
  if (!needsFix) return;

  // SQLite cannot alter a constraint, so the table is rebuilt around the data.
  db.pragma('foreign_keys = OFF');

  db.exec(`
    CREATE TABLE request_assignees_new (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id  INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_by TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      UNIQUE(request_id, user_id)
    );

    INSERT INTO request_assignees_new (id, request_id, user_id, assigned_by, created_at)
    SELECT a.id, a.request_id, a.user_id, a.assigned_by, a.created_at
    FROM request_assignees a
    WHERE EXISTS (SELECT 1 FROM requests r WHERE r.id = a.request_id)
      AND EXISTS (SELECT 1 FROM users u WHERE u.id = a.user_id);

    DROP TABLE request_assignees;
    ALTER TABLE request_assignees_new RENAME TO request_assignees;

    CREATE INDEX IF NOT EXISTS idx_assignees_request ON request_assignees(request_id);
    CREATE INDEX IF NOT EXISTS idx_assignees_user ON request_assignees(user_id);
  `);

  db.pragma('foreign_keys = ON');
};
