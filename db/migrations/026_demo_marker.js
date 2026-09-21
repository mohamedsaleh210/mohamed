const { addColumn } = require('../migrate');

/**
 * A flag on anything the demo created.
 *
 * Removing demo data by pattern-matching addresses and phone numbers is
 * guesswork, and guesswork against a live database is how real client files get
 * deleted. A column set at creation time is unambiguous: everything without it
 * is real work and is never touched.
 */
exports.up = (db) => {
  addColumn(db, 'requests', 'is_demo', 'INTEGER DEFAULT 0');
  addColumn(db, 'clients', 'is_demo', 'INTEGER DEFAULT 0');
  addColumn(db, 'users', 'is_demo', 'INTEGER DEFAULT 0');
  addColumn(db, 'trips', 'is_demo', 'INTEGER DEFAULT 0');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_requests_demo ON requests(is_demo) WHERE is_demo = 1;
  `);
};
