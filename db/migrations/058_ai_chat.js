// Chat history for the staff-side AI assistant. Every row is tied to the
// person who sent or received it, so retention purge and per-user history
// both work off the same column.
exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      role       TEXT NOT NULL,
      content    TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ai_messages_user ON ai_messages(user_id, id);
    CREATE INDEX IF NOT EXISTS idx_ai_messages_created ON ai_messages(created_at);
  `);
};
