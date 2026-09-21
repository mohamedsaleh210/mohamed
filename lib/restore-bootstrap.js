const fs = require('fs');
const path = require('path');

const APP_ROOT = path.resolve(__dirname, '..');
const PENDING_FILE = path.join(APP_ROOT, '.restore-ready.json');
const OFFICE_ROOT = path.resolve(process.env.DATA_DIR || path.join(APP_ROOT, 'data'));
const PLATFORM_ROOT = path.resolve(process.env.PLATFORM_DATA_DIR || path.join(APP_ROOT, 'platform-data'));

function replaceDirectory(source, target, label) {
  if (!fs.existsSync(source)) return;
  const rollbackRoot = path.join(APP_ROOT, 'backups', `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(rollbackRoot, { recursive: true });
  if (fs.existsSync(target)) fs.renameSync(target, path.join(rollbackRoot, label));
  fs.cpSync(source, target, { recursive: true });
  console.log(`  ✓ Restored ${label}; previous data kept in ${rollbackRoot}`);
}

function applyPendingRestore() {
  if (!fs.existsSync(PENDING_FILE)) return false;
  const pending = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
  if (!pending.stage || !fs.existsSync(pending.stage)) throw new Error('Pending restore files are missing');
  console.log('Sanad — applying validated backup restore…');
  replaceDirectory(path.join(pending.stage, 'office-data'), OFFICE_ROOT, 'office-data');
  if (pending.scope === 'full') replaceDirectory(path.join(pending.stage, 'platform-data'), PLATFORM_ROOT, 'platform-data');
  fs.rmSync(PENDING_FILE, { force: true });
  fs.rmSync(pending.stage, { recursive: true, force: true });
  return true;
}

module.exports = { applyPendingRestore };
