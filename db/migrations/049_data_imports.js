exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS data_import_batches (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      token         TEXT NOT NULL UNIQUE,
      entity        TEXT NOT NULL,
      file_name     TEXT,
      total_rows    INTEGER NOT NULL DEFAULT 0,
      valid_rows    INTEGER NOT NULL DEFAULT 0,
      error_rows    INTEGER NOT NULL DEFAULT 0,
      payload_json  TEXT NOT NULL,
      errors_json   TEXT NOT NULL DEFAULT '[]',
      result_json   TEXT,
      status        TEXT NOT NULL DEFAULT 'review',
      created_by    INTEGER NOT NULL REFERENCES users(id),
      created_at    TEXT DEFAULT (datetime('now')),
      imported_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_data_import_batches_user
      ON data_import_batches(created_by, created_at DESC);
  `);
};
