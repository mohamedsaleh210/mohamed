const { addColumn } = require('../migrate');

// Phase 2–4 core: client accounts, lawyer assignment, threaded comments,
// and uploaded documents.
exports.up = (db) => {
  // ---------------------------------------------------------------- clients
  // Clients are deliberately a separate table from staff `users`: different
  // login route, different fields, and no risk of a client id ever satisfying
  // a staff permission check.
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      email            TEXT UNIQUE NOT NULL,
      password_hash    TEXT,
      google_id        TEXT UNIQUE,
      full_name        TEXT,
      phone            TEXT,
      relation         TEXT DEFAULT 'self',
      beneficiary_name TEXT,
      email_verified   INTEGER DEFAULT 0,
      verify_token     TEXT,
      lang             TEXT DEFAULT 'ar',
      created_at       TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
  `);

  // ---------------------------------------------------------------- requests
  addColumn(db, 'requests', 'client_id', 'INTEGER REFERENCES clients(id)');
  addColumn(db, 'requests', 'email', 'TEXT');
  addColumn(db, 'requests', 'relation', "TEXT DEFAULT 'self'");
  addColumn(db, 'requests', 'beneficiary_name', 'TEXT');
  addColumn(db, 'requests', 'upload_token', 'TEXT');
  addColumn(db, 'requests', 'deadline', 'TEXT');
  addColumn(db, 'requests', 'archived_at', 'TEXT');
  addColumn(db, 'requests', 'files_purged_at', 'TEXT');
  addColumn(db, 'requests', 'files_purged_note', 'TEXT');

  // ---------------------------------------------------------------- assignment
  // Many lawyers per request, no upper limit. A lawyer who is not in this
  // table cannot open the request at all.
  db.exec(`
    CREATE TABLE IF NOT EXISTS request_assignees (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id  INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      assigned_by TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      UNIQUE (request_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_assignees_user ON request_assignees(user_id);
  `);

  // ---------------------------------------------------------------- comments
  // parent_id gives Facebook-style replies. Depth is capped at two levels in
  // the UI: a reply to a reply attaches to the same thread with an @mention.
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id   INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      parent_id    INTEGER REFERENCES comments(id) ON DELETE CASCADE,
      author_id    INTEGER,
      author_label TEXT,
      author_role  TEXT,
      body         TEXT NOT NULL,
      deleted_at   TEXT,
      deleted_by   TEXT,
      created_at   TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_comments_request ON comments(request_id);
  `);

  // ------------------------------------------------------ client requirements
  // "المطلوب من العميل" — the only internal list the client is allowed to see.
  db.exec(`
    CREATE TABLE IF NOT EXISTS requirements (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id  INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      status      TEXT DEFAULT 'pending',
      created_by  TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      received_at TEXT,
      received_by TEXT
    );
  `);

  // ---------------------------------------------------------------- documents
  // A document is what the client names ("بطاقة الرقم القومي"); it holds either
  // page images (front + optional back) or a single PDF.
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id  INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      kind        TEXT DEFAULT 'images',
      note        TEXT,
      uploaded_by TEXT,
      source      TEXT DEFAULT 'client',
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS document_files (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id   INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      stored_name   TEXT NOT NULL,
      original_name TEXT,
      mime          TEXT,
      size          INTEGER DEFAULT 0,
      page_no       INTEGER DEFAULT 1,
      side          TEXT DEFAULT 'front',
      created_at    TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_files_document ON document_files(document_id);
  `);

  // ---------------------------------------------------------------- todos
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      done       INTEGER DEFAULT 0,
      sort       INTEGER DEFAULT 0,
      created_by TEXT,
      done_by    TEXT,
      done_at    TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ---------------------------------------------------------------- notifications
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type       TEXT NOT NULL,
      request_id INTEGER REFERENCES requests(id) ON DELETE CASCADE,
      comment_id INTEGER,
      text       TEXT,
      seen_at    TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, seen_at);
  `);
};
