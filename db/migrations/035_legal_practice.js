/**
 * Law-office module. A request remains the commercial/client-facing record;
 * a legal case is the professional file created from that request.
 */
exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS case_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#b78b32',
      active INTEGER DEFAULT 1,
      sort INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS legal_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL UNIQUE REFERENCES requests(id) ON DELETE CASCADE,
      client_id INTEGER REFERENCES clients(id),
      category_id INTEGER REFERENCES case_categories(id),
      file_no TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      case_number TEXT,
      judicial_year TEXT,
      court TEXT,
      circuit TEXT,
      opposing_party TEXT,
      status TEXT NOT NULL DEFAULT 'preparation',
      priority TEXT NOT NULL DEFAULT 'normal',
      opened_on TEXT DEFAULT (date('now')),
      closed_on TEXT,
      next_hearing TEXT,
      summary TEXT,
      client_summary TEXT,
      created_by INTEGER REFERENCES users(id),
      updated_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cases_status ON legal_cases(status, next_hearing);
    CREATE INDEX IF NOT EXISTS idx_cases_client ON legal_cases(client_id);

    CREATE TABLE IF NOT EXISTS case_assignees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES legal_cases(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      assignment_role TEXT DEFAULT 'lawyer',
      lead INTEGER DEFAULT 0,
      assigned_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(case_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_case_assignees_user ON case_assignees(user_id);

    CREATE TABLE IF NOT EXISTS case_hearings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES legal_cases(id) ON DELETE CASCADE,
      hearing_on TEXT NOT NULL,
      court TEXT,
      circuit TEXT,
      purpose TEXT NOT NULL,
      decision TEXT,
      next_hearing TEXT,
      status TEXT DEFAULT 'scheduled',
      client_visible INTEGER DEFAULT 1,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_hearings_date ON case_hearings(hearing_on, status);

    CREATE TABLE IF NOT EXISTS case_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES legal_cases(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      details TEXT,
      due_on TEXT,
      assigned_user_id INTEGER REFERENCES users(id),
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'normal',
      client_visible INTEGER DEFAULT 0,
      completed_at TEXT,
      completed_by INTEGER REFERENCES users(id),
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_case_tasks_due ON case_tasks(assigned_user_id, status, due_on);

    CREATE TABLE IF NOT EXISTS case_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES legal_cases(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL DEFAULT 'note',
      title TEXT NOT NULL,
      details TEXT,
      event_on TEXT DEFAULT (datetime('now')),
      client_visible INTEGER DEFAULT 0,
      created_by INTEGER REFERENCES users(id),
      created_by_label TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_case_events_case ON case_events(case_id, event_on);

    CREATE TABLE IF NOT EXISTS case_parties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES legal_cases(id) ON DELETE CASCADE,
      party_type TEXT NOT NULL DEFAULT 'opponent',
      name TEXT NOT NULL,
      capacity TEXT,
      phone TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO case_categories (name, color, sort) VALUES
      ('مدني', '#2f80c9', 10), ('تجاري', '#7b5cc7', 20),
      ('عمالي', '#d98a3d', 30), ('أحوال شخصية', '#c15450', 40),
      ('جنائي', '#33434a', 50), ('إداري', '#3a9d6b', 60),
      ('تنفيذ', '#b78b32', 70), ('عقاري', '#607d8b', 80);
  `);
};
