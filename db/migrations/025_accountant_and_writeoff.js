const { addColumn } = require('../migrate');

/**
 * An accountant role, and writing off what will not be collected.
 *
 * The accountant needs the revenue picture and nothing else: not client files,
 * not documents, not the ability to change a number. Giving them a supervisor
 * account to "just look at the money" is how sensitive files end up open on a
 * desk that has no reason to see them.
 *
 * Writing off matters because an amount nobody will ever pay is not a
 * receivable. Leaving it in the outstanding total means the number slowly
 * stops meaning anything, and people stop reading it.
 */
exports.up = (db) => {
  addColumn(db, 'requests', 'written_off', 'REAL DEFAULT 0');
  addColumn(db, 'requests', 'write_off_reason', 'TEXT');
  addColumn(db, 'requests', 'write_off_by', 'TEXT');
  addColumn(db, 'requests', 'write_off_at', 'TEXT');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_requests_written_off
      ON requests(written_off) WHERE written_off > 0;
  `);
};
