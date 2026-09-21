const { addColumn } = require('../migrate');

exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff_custodies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      amount REAL NOT NULL CHECK(amount > 0),
      issued_on TEXT NOT NULL,
      purpose TEXT NOT NULL,
      reference TEXT,
      issued_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      issued_by TEXT,
      voided_at TEXT,
      voided_by TEXT,
      void_reason TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_custody_user ON staff_custodies(user_id, issued_on DESC);

    CREATE TABLE IF NOT EXISTS custody_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      custody_id INTEGER NOT NULL REFERENCES staff_custodies(id) ON DELETE CASCADE,
      amount REAL NOT NULL CHECK(amount > 0),
      returned_on TEXT NOT NULL,
      note TEXT,
      received_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      received_by TEXT,
      voided_at TEXT,
      voided_by TEXT,
      void_reason TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_custody_returns ON custody_returns(custody_id, returned_on DESC);
  `);

  addColumn(db, 'expenses', 'custody_id', 'INTEGER REFERENCES staff_custodies(id) ON DELETE SET NULL');
  db.exec('CREATE INDEX IF NOT EXISTS idx_expenses_custody ON expenses(custody_id, voided_at)');
};
