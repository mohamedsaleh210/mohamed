const fs = require('fs');
const path = require('path');
const { db, DATA_DIR } = require('../db');

const LICENSE_FILE = path.join(DATA_DIR, 'tenant-license.json');

function license() {
  try { return JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8')); } catch (_) { return null; }
}

function isManaged() { return !!license(); }

function state() {
  const value = license();
  if (!value) return { managed: false, allowed: true, status: 'standalone', expired: false, license: null };
  const status = String(value.status || 'trial').toLowerCase();
  const end = value.subscription_ends_at || value.trial_ends_at || null;
  const expired = !!end && Number.isFinite(new Date(end).getTime()) && Date.now() > new Date(end).getTime();
  return {
    managed: true,
    allowed: !expired && ['trial', 'active'].includes(status),
    status,
    expired,
    end,
    license: value,
  };
}

function numericLimit(key) {
  const value = license();
  if (!value) return null;
  const number = Number(value[key]);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function usage(kind) {
  if (kind === 'users') return db.prepare('SELECT COUNT(*) c FROM users WHERE active=1').get().c;
  if (kind === 'requests') return db.prepare('SELECT COUNT(*) c FROM requests WHERE COALESCE(is_demo,0)=0').get().c;
  if (kind === 'branches') return db.prepare('SELECT COUNT(*) c FROM company_branches WHERE active=1').get().c;
  if (kind === 'storage') {
    const walk = (directory) => {
      if (!fs.existsSync(directory)) return 0;
      return fs.readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return total + walk(full);
        // Databases, journals and the licence itself are operational state,
        // not customer file storage charged against the subscription.
        if (/\.db(?:-(?:wal|shm))?$/.test(entry.name) || full === LICENSE_FILE) return total;
        try { return total + fs.statSync(full).size; } catch (_) { return total; }
      }, 0);
    };
    // Count every physical customer file once, including uploads introduced by
    // future modules which may not yet have a row in document_files.
    return walk(DATA_DIR);
  }
  throw new Error(`unknown_usage_kind:${kind}`);
}

const LIMIT_KEYS = { users: 'max_users', requests: 'max_requests', branches: 'max_branches', storage: 'storage_mb' };

function allowance(kind, adding = 1) {
  const key = LIMIT_KEYS[kind];
  if (!key) throw new Error(`unknown_limit_kind:${kind}`);
  let limit = numericLimit(key);
  if (limit == null) return { allowed: true, managed: false, kind, used: usage(kind), limit: null, adding };
  if (kind === 'storage') limit *= 1024 * 1024;
  const used = usage(kind);
  return { allowed: used + Math.max(0, Number(adding) || 0) <= limit, managed: true, kind, used, limit, adding };
}

function fileBytes(files) {
  return (Array.isArray(files) ? files : Object.values(files || {}).flat())
    .reduce((total, file) => total + (Number(file && file.size) || 0), 0);
}

function removeUploaded(files) {
  (Array.isArray(files) ? files : Object.values(files || {}).flat()).forEach((file) => {
    if (!file || !file.path) return;
    try { fs.unlinkSync(file.path); } catch (_) { /* already absent */ }
  });
}

function storageAllowance(files) { return allowance('storage', fileBytes(files)); }

module.exports = { LICENSE_FILE, license, isManaged, state, numericLimit, usage, allowance, fileBytes, removeUploaded, storageAllowance };
