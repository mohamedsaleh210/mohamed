const { addColumn } = require('../migrate');

/**
 * Corporate clients are kept beside (not instead of) personal client accounts.
 * A company may have many branches and every corporate request must name one.
 * Existing requests remain personal and therefore need no backfill.
 */
exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT NOT NULL,
      legal_name       TEXT,
      registration_no  TEXT,
      tax_no           TEXT,
      phone            TEXT,
      email            TEXT,
      address          TEXT,
      contact_name     TEXT,
      notes            TEXT,
      active           INTEGER DEFAULT 1,
      created_by       INTEGER REFERENCES users(id),
      created_at       TEXT DEFAULT (datetime('now')),
      updated_at       TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);

    CREATE TABLE IF NOT EXISTS company_branches (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      code        TEXT,
      phone       TEXT,
      email       TEXT,
      address     TEXT,
      manager     TEXT,
      notes       TEXT,
      active      INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now')),
      UNIQUE(company_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_company_branches_company ON company_branches(company_id, active);
  `);

  addColumn(db, 'requests', 'company_id', 'INTEGER REFERENCES companies(id)');
  addColumn(db, 'requests', 'branch_id', 'INTEGER REFERENCES company_branches(id)');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_requests_company ON requests(company_id, branch_id, id DESC);
  `);
};
