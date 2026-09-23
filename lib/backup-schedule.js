const fs = require('fs');
const path = require('path');
const { db, getSetting, setSetting, getBool } = require('../db');
const backup = require('./backup');
const audit = require('./audit');

const APP_ROOT = path.resolve(__dirname, '..');
const SCHEDULED_DIR = path.join(APP_ROOT, 'backups', 'scheduled');

const DEFAULTS = { frequency: 'daily', weekday: '0', time: '02:00', retention: '7' };

function config() {
  return {
    enabled: getBool('backup_schedule_enabled', false),
    frequency: getSetting('backup_schedule_frequency', DEFAULTS.frequency),
    weekday: getSetting('backup_schedule_weekday', DEFAULTS.weekday),
    time: getSetting('backup_schedule_time', DEFAULTS.time),
    retention: Math.max(1, parseInt(getSetting('backup_schedule_retention', DEFAULTS.retention), 10) || 7),
  };
}

/**
 * The next instant this schedule fires, strictly after `now`.
 *
 * A pure function of the config and the clock — no lookup of when it last
 * ran — so a server that was off through the scheduled time does not try to
 * "catch up" a missed run; it just resumes the regular cadence, which is the
 * only sane meaning of "every day at 2am" once you accept the server keeps
 * office hours too.
 */
function computeNextRun(now, { frequency, weekday, time }) {
  const [hh, mm] = String(time || DEFAULTS.time).split(':').map(Number);
  const candidate = new Date(now.getTime());
  candidate.setHours(hh || 0, mm || 0, 0, 0);

  if (frequency === 'weekly') {
    const targetDay = Number(weekday || 0);
    const diff = (targetDay - candidate.getDay() + 7) % 7;
    candidate.setDate(candidate.getDate() + diff);
    if (candidate <= now) candidate.setDate(candidate.getDate() + 7);
  } else if (candidate <= now) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

/** Keeps the newest `retention` scheduled backups, deleting the rest. */
function applyRetention(retention) {
  if (!fs.existsSync(SCHEDULED_DIR)) return;
  const files = fs
    .readdirSync(SCHEDULED_DIR)
    .filter((f) => f.endsWith('.zip'))
    .map((f) => ({ f, t: fs.statSync(path.join(SCHEDULED_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  files.slice(retention).forEach(({ f }) => fs.rmSync(path.join(SCHEDULED_DIR, f), { force: true }));
}

/** Runs one office-scope backup into the scheduled folder, rotating old ones out. */
async function runScheduledBackup() {
  const { retention } = config();
  fs.mkdirSync(SCHEDULED_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(SCHEDULED_DIR, `sanad-office-backup-${stamp}.zip`);

  try {
    const result = await backup.createBackup('office', { outputPath });
    result.cleanup();
    applyRetention(retention);
    setSetting('backup_schedule_last_run_at', new Date().toISOString());
    setSetting('backup_schedule_last_run_status', 'ok');
    setSetting('backup_schedule_last_run_error', '');
    audit.log(null, 'backup.scheduled_run', {
      type: 'settings',
      details: `نسخة احتياطية مجدولة للمكتب: ${path.basename(outputPath)}`,
    });
    return { ok: true, path: outputPath };
  } catch (error) {
    setSetting('backup_schedule_last_run_at', new Date().toISOString());
    setSetting('backup_schedule_last_run_status', 'error');
    setSetting('backup_schedule_last_run_error', error.message);
    console.error('scheduled backup failed:', error.message);
    return { ok: false, error: error.message };
  }
}

let timer = null;

/** Cancels any pending timer and, if enabled, arms one for the next run. */
function reschedule() {
  if (timer) { clearTimeout(timer); timer = null; }
  const cfg = config();
  if (!cfg.enabled) return;

  const next = computeNextRun(new Date(), cfg);
  // setTimeout's delay is a 32-bit signed int (~24.8 days); weekly schedules
  // never exceed 7 days, but the cap keeps this safe against any future
  // frequency that might.
  const delay = Math.min(next.getTime() - Date.now(), 2 ** 31 - 1);

  timer = setTimeout(async () => {
    await runScheduledBackup();
    reschedule();
  }, Math.max(delay, 0));
  if (timer.unref) timer.unref();
}

function start() { reschedule(); }

function status() {
  const cfg = config();
  const files = fs.existsSync(SCHEDULED_DIR)
    ? fs
        .readdirSync(SCHEDULED_DIR)
        .filter((f) => f.endsWith('.zip'))
        .map((f) => {
          const st = fs.statSync(path.join(SCHEDULED_DIR, f));
          return { name: f, size: st.size, created_at: st.mtime.toISOString() };
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    : [];

  return {
    ...cfg,
    lastRunAt: getSetting('backup_schedule_last_run_at', ''),
    lastRunStatus: getSetting('backup_schedule_last_run_status', ''),
    lastRunError: getSetting('backup_schedule_last_run_error', ''),
    nextRunAt: cfg.enabled ? computeNextRun(new Date(), cfg).toISOString() : null,
    files,
  };
}

module.exports = { config, computeNextRun, applyRetention, runScheduledBackup, reschedule, start, status, SCHEDULED_DIR };
