const { addColumn } = require('../migrate');

exports.up = (db) => {
  addColumn(db, 'agenda_events', 'client_id', 'INTEGER REFERENCES clients(id)');
  addColumn(db, 'agenda_events', 'company_id', 'INTEGER REFERENCES companies(id)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS agenda_assignees (
      agenda_event_id INTEGER NOT NULL REFERENCES agenda_events(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (agenda_event_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_agenda_assignees_user
      ON agenda_assignees(user_id, agenda_event_id);

    INSERT OR IGNORE INTO agenda_assignees(agenda_event_id,user_id)
      SELECT id,assigned_user_id FROM agenda_events WHERE assigned_user_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS company_services (
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY(company_id,service_id)
    );

    CREATE TABLE IF NOT EXISTS company_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      branch_id INTEGER REFERENCES company_branches(id) ON DELETE SET NULL,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      full_name TEXT NOT NULL,
      job_title TEXT,
      phone TEXT,
      email TEXT,
      notes TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_company_contacts_company
      ON company_contacts(company_id,active);
  `);
};
