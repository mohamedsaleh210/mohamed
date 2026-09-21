/**
 * Expense categories the office can extend.
 *
 * They were a fixed list in code, which is fine until an office spends money on
 * something nobody anticipated — a courier abroad, a committee fee, a
 * translator's stamp. The choice then is to file it under "other", which makes
 * the report useless, or to wait for a developer.
 *
 * The built-in ones are seeded and marked, so they can be hidden but not
 * deleted out from under the expenses already filed against them.
 */
exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS expense_categories (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      key        TEXT NOT NULL UNIQUE,
      label_ar   TEXT NOT NULL,
      icon       TEXT,
      sort       INTEGER DEFAULT 0,
      active     INTEGER DEFAULT 1,
      built_in   INTEGER DEFAULT 0,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_expense_cats ON expense_categories(sort) WHERE active = 1;
  `);

  const existing = db.prepare('SELECT COUNT(*) c FROM expense_categories').get().c;
  if (existing) return;

  const ins = db.prepare(
    'INSERT INTO expense_categories (key, label_ar, icon, sort, built_in) VALUES (?,?,?,?,1)'
  );

  [
    ['government', 'رسوم حكومية', '🏛'],
    ['transport', 'انتقالات', '🚗'],
    ['stamps', 'دمغات وطوابع', '🧾'],
    ['printing', 'طباعة وتصوير', '🖨'],
    ['translation', 'ترجمة', '🌐'],
    ['courier', 'شحن وبريد', '📦'],
    ['other', 'أخرى', '•'],
  ].forEach(([key, label, icon], i) => ins.run(key, label, icon, i + 1));
};
