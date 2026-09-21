const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const archiver = require('archiver');
const unzipper = require('unzipper');

const APP_ROOT = path.resolve(__dirname, '..');
const OFFICE_ROOT = path.resolve(process.env.DATA_DIR || path.join(APP_ROOT, 'data'));
const PLATFORM_ROOT = path.resolve(process.env.PLATFORM_DATA_DIR || path.join(APP_ROOT, 'platform-data'));
const PENDING_FILE = path.join(APP_ROOT, '.restore-ready.json');

function safeStamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }
function ensureInside(root, target) {
  const rel = path.relative(root, target);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function copySnapshot(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name === 'restore-incoming' || /\.db-(?:wal|shm)$/.test(entry.name)) continue;
    const from = path.join(source, entry.name), to = path.join(destination, entry.name);
    if (entry.isDirectory()) await copySnapshot(from, to);
    else if (/\.db$/i.test(entry.name)) {
      const database = new Database(from, { readonly: true, fileMustExist: true });
      try { await database.backup(to); } finally { database.close(); }
    } else fs.copyFileSync(from, to);
  }
}

async function createBackup(scope = 'office', options = {}) {
  if (!['office', 'full'].includes(scope)) throw new Error('invalid_backup_scope');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sanad-backup-'));
  const stage = path.join(temp, 'snapshot');
  fs.mkdirSync(stage, { recursive: true });
  await copySnapshot(path.resolve(options.officeRoot || OFFICE_ROOT), path.join(stage, 'office-data'));
  if (scope === 'full') await copySnapshot(PLATFORM_ROOT, path.join(stage, 'platform-data'));
  fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify({
    format: 'sanad-backup-v1', scope, created_at: new Date().toISOString(), version: require('../package.json').version,
    includes: scope === 'full' ? ['office-data', 'platform-data'] : ['office-data'],
  }, null, 2));
  const outputPath = options.outputPath || path.join(temp, `sanad-${scope}-backup-${safeStamp()}.zip`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath), archive = archiver('zip', { zlib: { level: 6 } });
    output.on('close', resolve); output.on('error', reject); archive.on('error', reject);
    archive.pipe(output); archive.directory(stage, false); archive.finalize();
  });
  return { path: outputPath, cleanup: () => fs.rmSync(temp, { recursive: true, force: true }) };
}

async function extractSafely(zipPath, target) {
  const zip = await unzipper.Open.file(zipPath);
  for (const entry of zip.files) {
    const clean = String(entry.path || '').replace(/\\/g, '/');
    if (!clean || clean.startsWith('/') || clean.split('/').includes('..')) throw new Error('unsafe_backup_path');
    const destination = path.resolve(target, clean);
    if (!ensureInside(target, destination)) throw new Error('unsafe_backup_path');
    if (entry.type === 'Directory') fs.mkdirSync(destination, { recursive: true });
    else {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      await new Promise((resolve, reject) => entry.stream().pipe(fs.createWriteStream(destination)).on('finish', resolve).on('error', reject));
    }
  }
}

function validateDatabases(root) {
  const failures = [];
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (!/\.db$/i.test(entry.name)) return;
    try {
      const database = new Database(full, { readonly: true, fileMustExist: true });
      const integrity = database.pragma('integrity_check')[0];
      const value = integrity && (integrity.integrity_check || Object.values(integrity)[0]);
      const foreignKeys = database.pragma('foreign_key_check').length;
      database.close();
      if (value !== 'ok' || foreignKeys) failures.push(`${entry.name}: integrity=${value}, foreign_keys=${foreignKeys}`);
    } catch (error) { failures.push(`${entry.name}: ${error.message}`); }
  });
  walk(root);
  if (failures.length) throw new Error(`backup_database_invalid: ${failures.join('; ')}`);
}

async function scheduleRestore(zipPath, allowFull) {
  if (fs.existsSync(PENDING_FILE)) throw new Error('restore_already_pending');
  const id = crypto.randomBytes(8).toString('hex');
  const stage = path.join(APP_ROOT, 'restore-staging', id);
  fs.mkdirSync(stage, { recursive: true });
  try {
    await extractSafely(zipPath, stage);
    const manifestPath = path.join(stage, 'manifest.json');
    if (!fs.existsSync(manifestPath)) throw new Error('backup_manifest_missing');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.format !== 'sanad-backup-v1' || !['office', 'full'].includes(manifest.scope)) throw new Error('backup_format_invalid');
    if (manifest.scope === 'full' && !allowFull) throw new Error('full_restore_owner_only');
    if (!fs.existsSync(path.join(stage, 'office-data', 'sanad.db'))) throw new Error('office_database_missing');
    validateDatabases(stage);
    fs.writeFileSync(PENDING_FILE, JSON.stringify({ id, stage, scope: manifest.scope, requested_at: new Date().toISOString() }, null, 2));
    return manifest;
  } catch (error) {
    fs.rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { createBackup, scheduleRestore, PENDING_FILE };
