const { addColumn } = require('../migrate');

// Two gaps closed here:
//  1. Per-service checklist templates, so a new request arrives with its steps
//     already filled in instead of someone retyping them every time.
//  2. A recoverable delete. Anything removed goes to a trash table first and
//     can be restored, which matters when several staff share the panel.
exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS todo_templates (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      sort       INTEGER DEFAULT 0,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tpl_service ON todo_templates(service_id);
  `);

  // Generic undo store: the deleted row is kept as JSON so it can be put back
  // exactly as it was, whatever table it came from.
  db.exec(`
    CREATE TABLE IF NOT EXISTS trash (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      entity      TEXT NOT NULL,
      entity_id   INTEGER,
      label       TEXT,
      payload     TEXT NOT NULL,
      deleted_by  TEXT,
      deleted_at  TEXT DEFAULT (datetime('now')),
      restored_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trash_deleted ON trash(deleted_at DESC);
  `);

  addColumn(db, 'todos', 'note', 'TEXT');
  addColumn(db, 'todos', 'from_template', 'INTEGER DEFAULT 0');
};
