/**
 * Expenses on a request.
 *
 * The question was whether these are costs against the file or office costs
 * recorded next to it. They are both, and the difference is who ends up paying:
 *
 *   on_client = 1  the client is charged for it — a taxi to the registry that
 *                  the fee quote already covers. It comes back through fees, so
 *                  it does not reduce what the office earns.
 *   on_client = 0  the office absorbs it. This is the number that turns
 *                  "collected" into "actually earned".
 *
 * Reimbursement is tracked separately: a lawyer who paid cash out of pocket is
 * owed that money whether or not the client is charged for it. Conflating the
 * two would mean the office either forgets to pay staff back or double-counts
 * the cost.
 */
exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id    INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      amount        REAL NOT NULL,
      reason        TEXT NOT NULL,
      category      TEXT DEFAULT 'other',
      spent_on      TEXT NOT NULL,
      on_client     INTEGER DEFAULT 0,
      receipt_file  TEXT,
      paid_by       TEXT,
      paid_by_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reimbursed_at TEXT,
      reimbursed_by TEXT,
      voided_at     TEXT,
      voided_by     TEXT,
      void_reason   TEXT,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_request ON expenses(request_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(spent_on DESC);
    CREATE INDEX IF NOT EXISTS idx_expenses_person ON expenses(paid_by_id, spent_on);

    -- The two questions asked every month: what is outstanding to staff, and
    -- what did the office actually spend.
    CREATE INDEX IF NOT EXISTS idx_expenses_unreimbursed
      ON expenses(paid_by_id) WHERE reimbursed_at IS NULL AND voided_at IS NULL;
  `);
};
