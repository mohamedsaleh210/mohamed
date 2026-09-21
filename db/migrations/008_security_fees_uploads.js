const { addColumn } = require('../migrate');

// Security visibility, per-request fee breakdown, and the free-text
// "special request" that replaced the multi-service idea.
exports.up = (db) => {
  // ---------------------------------------------------------------- security
  // Every sign-in is recorded with where it came from. The users page shows the
  // last few so an admin can spot a login that does not look like the person.
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
      username   TEXT,
      ip         TEXT,
      user_agent TEXT,
      device     TEXT,
      browser    TEXT,
      os         TEXT,
      success    INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_login_user ON login_history(user_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_login_created ON login_history(created_at DESC);
  `);

  addColumn(db, 'users', 'last_login_at', 'TEXT');
  addColumn(db, 'users', 'last_login_ip', 'TEXT');

  // ---------------------------------------------------------------- fees
  // A request is rarely one flat number: it is "X for the license, Y for the
  // inspection". Each line is recorded separately and the total is derived.
  db.exec(`
    CREATE TABLE IF NOT EXISTS fee_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id  INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      label       TEXT NOT NULL,
      amount      REAL NOT NULL DEFAULT 0,
      sort        INTEGER DEFAULT 0,
      created_by  TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_fee_request ON fee_items(request_id);
  `);

  // Anything already entered as a single amount becomes one line, so no
  // existing figure is lost.
  const withTotals = db
    .prepare('SELECT id, total_amount FROM requests WHERE total_amount > 0')
    .all();
  const ins = db.prepare(
    'INSERT INTO fee_items (request_id, label, amount, sort, created_by) VALUES (?,?,?,1,?)'
  );
  withTotals.forEach((r) => ins.run(r.id, 'أتعاب الخدمة', r.total_amount, 'النظام'));

  // ---------------------------------------------------------------- request
  addColumn(db, 'requests', 'special_request', 'TEXT');

  // ---------------------------------------------------------------- cleanup
  // Checklist templates were built and then dropped from scope.
  db.exec('DROP TABLE IF EXISTS todo_templates');

  // Social links now live in one place only, so the two display toggles go.
  db.prepare("DELETE FROM settings WHERE key IN ('social_show_header','social_show_footer')").run();
};
