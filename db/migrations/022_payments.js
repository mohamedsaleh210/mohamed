const { addColumn } = require('../migrate');

/**
 * A payments ledger.
 *
 * Until now a request carried one number, `paid_amount`, with no date, no
 * method and no record of who took the money. That is enough to answer "how
 * much is left on this file" and nothing else — not "what did we collect last
 * month", not "which payments came through the bank", not "who received this
 * cash".
 *
 * Each payment becomes a row. The number on the request stays, maintained as
 * the sum of its rows, so every screen that reads it keeps working.
 */
exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id   INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      amount       REAL NOT NULL,
      method       TEXT NOT NULL,
      paid_on      TEXT NOT NULL,
      reference    TEXT,
      note         TEXT,
      receipt_file TEXT,
      recorded_by     TEXT,
      recorded_by_id  INTEGER,
      created_at   TEXT DEFAULT (datetime('now')),
      voided_at    TEXT,
      voided_by    TEXT,
      void_reason  TEXT
    );

    -- Revenue is always asked for by period, so the date leads every index.
    CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(paid_on DESC);
    CREATE INDEX IF NOT EXISTS idx_payments_request ON payments(request_id);
    CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(method, paid_on);
    CREATE INDEX IF NOT EXISTS idx_payments_live ON payments(paid_on) WHERE voided_at IS NULL;
  `);

  // Existing totals become an opening entry each, dated to the request so the
  // history is not blank and the numbers still reconcile.
  const existing = db
    .prepare('SELECT id, paid_amount, created_at FROM requests WHERE paid_amount > 0')
    .all();

  const ins = db.prepare(
    `INSERT INTO payments (request_id, amount, method, paid_on, note, recorded_by)
     VALUES (?,?,?,?,?,?)`
  );

  existing.forEach((r) => {
    ins.run(
      r.id,
      r.paid_amount,
      'unknown',
      String(r.created_at || new Date().toISOString()).slice(0, 10),
      'رصيد سابق — قبل تفعيل سجل الدفعات',
      'النظام'
    );
  });

  // Which currency the office quotes in, kept alongside the ledger it applies to.
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('currency', 'EGP')").run();

  addColumn(db, 'requests', 'discount', 'REAL DEFAULT 0');
  addColumn(db, 'requests', 'discount_reason', 'TEXT');
};
