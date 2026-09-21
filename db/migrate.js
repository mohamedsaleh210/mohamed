const fs = require('fs');
const path = require('path');
const { db } = require('./index');

// Every schema change from here on lives in db/migrations as a numbered file.
// The runner records what it has already applied, so restarting the server or
// deploying a new build never re-runs a migration and never touches live rows.
function migrate({ quiet = false } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const dir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(dir)) return;

  const applied = new Set(db.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name));
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .sort();

  const log = (msg) => {
    if (!quiet) console.log(msg);
  };

  for (const file of files) {
    if (applied.has(file)) continue;

    const migration = require(path.join(dir, file));
    log(`  → applying migration ${file}`);

    // Each migration runs inside a transaction: if it throws halfway through,
    // SQLite rolls the whole thing back and the database is left untouched.
    const run = db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
    });

    try {
      run();
    } catch (err) {
      console.error(`\n  ✗ migration ${file} failed — database left unchanged.`);
      throw err;
    }
  }
}

/** Adds a column only when it is missing. Safe to call on every boot. */
function addColumn(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

module.exports = { migrate, addColumn };
