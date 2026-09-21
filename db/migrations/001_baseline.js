// The schema as it existed before this rebuild. Written with IF NOT EXISTS so
// it is a no-op on a database that already has these tables.
exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'supervisor',
      display_name  TEXT,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      sort    INTEGER DEFAULT 0,
      name_ar TEXT, name_en TEXT,
      desc_ar TEXT, desc_en TEXT
    );

    CREATE TABLE IF NOT EXISTS services (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id     INTEGER,
      sort            INTEGER DEFAULT 0,
      title_ar TEXT,  title_en TEXT,
      body_ar  TEXT,  body_en  TEXT,
      is_consultation INTEGER DEFAULT 0,
      active          INTEGER DEFAULT 1,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS requests (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      ref             TEXT UNIQUE,
      name            TEXT NOT NULL,
      phone           TEXT NOT NULL,
      service_id      INTEGER,
      service_label   TEXT,
      message         TEXT,
      status          TEXT DEFAULT 'new',
      assigned_lawyer TEXT,
      total_amount    REAL DEFAULT 0,
      paid_amount     REAL DEFAULT 0,
      created_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS request_notes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      author     TEXT,
      note       TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
    );
  `);
};
