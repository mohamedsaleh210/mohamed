const { addColumn } = require('../migrate');

// Password reset for both audiences, plus the small gaps that live nearby:
// a per-request applicant relationship, and an editable request title.
exports.up = (db) => {
  // Single-use, short-lived tokens. Kept in their own table rather than on the
  // account so an unused request leaves nothing behind on the row itself.
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      audience   TEXT NOT NULL,
      subject_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at    TEXT,
      requested_ip TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reset_token ON password_resets(token_hash);
    CREATE INDEX IF NOT EXISTS idx_reset_subject ON password_resets(audience, subject_id);
  `);

  // The applicant's relationship belongs to the request, not the account: the
  // same person may apply for themselves once and for their child the next time.
  addColumn(db, 'requests', 'title', 'TEXT');

  // Client language was stored to pick an email language. The office replies in
  // whatever language the client wrote in, so the stored preference only added
  // a field that could disagree with reality.
  db.exec("UPDATE clients SET lang = 'ar' WHERE lang IS NULL");
};
