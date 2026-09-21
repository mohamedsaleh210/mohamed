exports.up = db => db.exec(`
  CREATE TABLE IF NOT EXISTS agenda_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    event_type TEXT NOT NULL DEFAULT 'task',
    starts_at TEXT NOT NULL,
    ends_at TEXT,
    priority TEXT DEFAULT 'normal',
    status TEXT DEFAULT 'pending',
    assigned_user_id INTEGER REFERENCES users(id),
    request_id INTEGER REFERENCES requests(id),
    case_id INTEGER REFERENCES legal_cases(id),
    client_visible INTEGER DEFAULT 0,
    location TEXT,
    notes TEXT,
    reminder_minutes INTEGER DEFAULT 1440,
    created_by INTEGER REFERENCES users(id),
    completed_at TEXT,
    created_at TEXT DEFAULT(datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_agenda_date ON agenda_events(starts_at,status);
  CREATE INDEX IF NOT EXISTS idx_agenda_user ON agenda_events(assigned_user_id,starts_at);
`);
