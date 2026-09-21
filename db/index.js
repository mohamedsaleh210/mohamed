const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * All persistent state (database + uploaded files) lives under DATA_DIR.
 * Keeping every path derived from this one variable means the whole app can be
 * moved to another host by copying a single folder.
 *
 * "~/sanad-data" is accepted so the value can be set without knowing the
 * account's username — shells expand ~, but environment variables passed to a
 * process do not, so it is expanded here.
 */
const APP_ROOT = path.resolve(__dirname, '..');
const LEGACY_DIR = path.join(APP_ROOT, 'data');

/** Can we actually create and write to this path? */
function writable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, '.write-probe');
    fs.writeFileSync(probe, 'x');
    fs.unlinkSync(probe);
    return true;
  } catch (_) {
    return false;
  }
}

function resolveDataDir() {
  const raw = (process.env.DATA_DIR || '').trim();

  if (raw) {
    if (raw === '~') return os.homedir();
    if (raw.startsWith('~/')) return path.join(os.homedir(), raw.slice(2));
    return path.resolve(raw);
  }

  // Railway and similar mount a volume at /data.
  if (fs.existsSync('/data')) return '/data';

  /**
   * No DATA_DIR set.
   *
   * The old default was a folder inside the application, which managed hosts
   * delete on every deploy — so forgetting one environment variable was enough
   * to lose every client file on the next update. A default that destroys data
   * when you forget to override it is the wrong default, however well it is
   * documented.
   *
   * In production the data therefore goes to the account's home directory,
   * outside anything a deploy touches. Locally it stays beside the code, which
   * is what makes development and testing convenient.
   */
  if (process.env.NODE_ENV === 'production') {
    const home = os.homedir();
    const safe = path.join(home, 'sanad-data');

    if (home && !APP_ROOT.startsWith(home + path.sep + 'sanad-data') && writable(safe)) {
      return safe;
    }

    // Nowhere safe to write: fall through to the legacy path and let the
    // warning below explain the risk, rather than refusing to start.
    return LEGACY_DIR;
  }

  return LEGACY_DIR;
}

const DATA_DIR = resolveDataDir();

/**
 * One-time rescue for installs created before the default moved.
 *
 * If the safe location is empty but a database is sitting in the old in-app
 * folder, that database is the office's real data — and it is one deploy away
 * from being deleted. It is copied, not moved: the original stays untouched, so
 * a mistake here costs nothing.
 */
if (
  process.env.NODE_ENV === 'production' &&
  path.resolve(DATA_DIR) !== path.resolve(LEGACY_DIR) &&
  !fs.existsSync(path.join(DATA_DIR, 'sanad.db')) &&
  fs.existsSync(path.join(LEGACY_DIR, 'sanad.db'))
) {
  try {
    fs.cpSync(LEGACY_DIR, DATA_DIR, { recursive: true });
    console.log(
      '\n  Existing data found in the old in-app folder and copied to a safe location:\n' +
        `    from: ${LEGACY_DIR}\n` +
        `    to:   ${DATA_DIR}\n` +
        '  The originals were left in place; the next deploy will remove them.\n'
    );
  } catch (err) {
    console.error('  Could not copy existing data to the safe location:', err.message);
  }
}

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Managed hosts (Hostinger, Railway, Render…) replace the application folder on
// every deploy. A database sitting inside it is silently destroyed the first
// time the office pushes an update — by which point there are real client files
// in it. Worth being loud about.
const appRoot = APP_ROOT;
const insideApp = path.resolve(DATA_DIR).startsWith(appRoot + path.sep);

// Printed on every boot: the single most useful line in the log when something
// has gone wrong with storage.
console.log(`  data: ${path.resolve(DATA_DIR)}`);

if (insideApp && process.env.NODE_ENV === 'production') {
  console.warn(
    '\n' +
      '  ╔════════════════════════════════════════════════════════════╗\n' +
      '  ║  DANGER: the data directory is inside the app directory     ║\n' +
      '  ╚════════════════════════════════════════════════════════════╝\n' +
      `    DATA_DIR = ${path.resolve(DATA_DIR)}\n` +
      `    app root = ${appRoot}\n\n` +
      '    The next deploy will wipe this folder, taking the database\n' +
      '    and every client document with it.\n\n' +
      '    This only happens when the home directory is not writable.\n' +
      '    Set DATA_DIR to a path outside the app, for example:\n' +
      '      DATA_DIR=/home/<username>/sanad-data\n'
  );
}

const db = new Database(path.join(DATA_DIR, 'sanad.db'));

db.pragma('journal_mode = WAL');
// SQLite ships with foreign keys DISABLED. Without this line every
// "ON DELETE CASCADE" / "REFERENCES" in the schema is silently ignored,
// which would leave orphaned services when a category is removed.
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------- settings
const getSetting = (key, def = '') => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row && row.value !== null && row.value !== '' ? row.value : def;
};

const setSetting = (key, value) => {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value === null || value === undefined ? '' : String(value));
};

const getBool = (key, def = false) => {
  const v = getSetting(key, def ? '1' : '0');
  return v === '1' || v === 'true';
};

module.exports = { db, getSetting, setSetting, getBool, DATA_DIR, UPLOAD_DIR };
