// Every outgoing message is recorded: what was sent, to whom, and whether it
// actually left. Without this, "the client says no email arrived" is
// unanswerable.
exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      template    TEXT NOT NULL,
      to_email    TEXT NOT NULL,
      subject     TEXT,
      lang        TEXT DEFAULT 'ar',
      request_id  INTEGER,
      provider    TEXT,
      status      TEXT DEFAULT 'pending',
      error       TEXT,
      attempts    INTEGER DEFAULT 0,
      outbox_file TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      sent_at     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_mail_created ON mail_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mail_status  ON mail_log(status);
  `);
};
