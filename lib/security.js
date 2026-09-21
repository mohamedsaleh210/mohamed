const { db } = require('../db');

/**
 * A deliberately small user-agent reader. It is not trying to be exhaustive —
 * the point is to let an admin glance at a row and tell whether a login looks
 * like the person's usual phone or something they have never used.
 */
function parseAgent(ua = '') {
  const s = String(ua);

  let os = 'غير معروف';
  if (/Windows NT 10/.test(s)) os = 'Windows 10/11';
  else if (/Windows/.test(s)) os = 'Windows';
  else if (/iPhone|iPad|iPod/.test(s)) os = /iPad/.test(s) ? 'iPadOS' : 'iOS';
  else if (/Android/.test(s)) os = (s.match(/Android [\d.]+/) || ['Android'])[0];
  else if (/Mac OS X/.test(s)) os = 'macOS';
  else if (/Linux/.test(s)) os = 'Linux';

  let browser = 'غير معروف';
  if (/Edg\//.test(s)) browser = 'Edge';
  else if (/OPR\//.test(s)) browser = 'Opera';
  else if (/Chrome\//.test(s) && !/Chromium/.test(s)) browser = 'Chrome';
  else if (/Firefox\//.test(s)) browser = 'Firefox';
  else if (/Safari\//.test(s)) browser = 'Safari';
  else if (/curl|wget|python|node/i.test(s)) browser = 'أداة آلية';

  const device = /iPhone|iPod|Android.*Mobile|Windows Phone/.test(s)
    ? 'موبايل'
    : /iPad|Tablet|Android/.test(s)
      ? 'تابلت'
      : 'كمبيوتر';

  return { os, browser, device };
}

/**
 * Behind a proxy Express already resolves req.ip from X-Forwarded-For because
 * trust proxy is set; this just normalises the IPv6-mapped IPv4 form.
 */
function ipOf(req) {
  const raw = req.ip || req.connection?.remoteAddress || '';
  return raw.replace(/^::ffff:/, '') || 'غير معروف';
}

const insert = db.prepare(`
  INSERT INTO login_history
    (user_id, username, ip, user_agent, device, browser, os, success,
     latitude, longitude, location_accuracy, location_status, location_captured_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
`);

/**
 * Recognises the device behind a sign-in.
 *
 * Deliberately coarse — device class, browser and operating system, not a
 * precise fingerprint. A browser update should not look like an intruder, but
 * a sign-in from a phone when somebody only ever uses a desktop should.
 *
 * Returns whether this combination is new for the account.
 */
function rememberDevice(userId, { device, browser, os, ip }) {
  const fingerprint = `${device}|${browser}|${os}`;
  const label = `${device} · ${browser} · ${os}`;

  const existing = db
    .prepare('SELECT * FROM known_devices WHERE user_id = ? AND fingerprint = ?')
    .get(userId, fingerprint);

  if (existing) {
    db.prepare(
      "UPDATE known_devices SET last_seen = datetime('now'), seen_count = seen_count + 1, ip = ? WHERE id = ?"
    ).run(ip, existing.id);
    return { isNew: false, label };
  }

  db.prepare(
    'INSERT INTO known_devices (user_id, fingerprint, label, ip) VALUES (?,?,?,?)'
  ).run(userId, fingerprint, label, ip);

  // The very first device on a brand-new account is not news — it is the
  // person signing in for the first time.
  const total = db
    .prepare('SELECT COUNT(*) c FROM known_devices WHERE user_id = ?')
    .get(userId).c;

  return { isNew: total > 1, label };
}

const devicesFor = (userId) =>
  db
    .prepare('SELECT * FROM known_devices WHERE user_id = ? ORDER BY last_seen DESC')
    .all(userId);

function record(req, { userId = null, username, success }) {
  const ua = req.get('user-agent') || '';
  const { os, browser, device } = parseAgent(ua);
  const ip = ipOf(req);

  const latitude = finiteCoordinate(req.body && req.body.latitude, -90, 90);
  const longitude = finiteCoordinate(req.body && req.body.longitude, -180, 180);
  const accuracyRaw = Number(req.body && req.body.location_accuracy);
  const accuracy = Number.isFinite(accuracyRaw) && accuracyRaw >= 0 && accuracyRaw <= 100000
    ? Math.round(accuracyRaw) : null;
  const allowedStatuses = ['captured', 'denied', 'unavailable', 'timeout', 'unsupported', 'not_requested'];
  let locationStatus = allowedStatuses.includes(req.body && req.body.location_status)
    ? req.body.location_status : 'not_requested';
  if (latitude !== null && longitude !== null) locationStatus = 'captured';
  if (locationStatus === 'captured' && (latitude === null || longitude === null)) locationStatus = 'unavailable';

  try {
    insert.run(userId, username, ip, ua.slice(0, 400), device, browser, os, success ? 1 : 0,
      latitude, longitude, accuracy, locationStatus,
      locationStatus === 'captured' ? new Date().toISOString() : null);
    if (success && userId) {
      db.prepare("UPDATE users SET last_login_at = datetime('now'), last_login_ip = ? WHERE id = ?")
        .run(ip, userId);
    }
  } catch (err) {
    console.error('login history failed:', err.message);
  }
}

function finiteCoordinate(raw, min, max) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max
    ? Math.round(value * 1000000) / 1000000 : null;
}

/** The last few successful sign-ins for one account. */
const recentFor = (userId, limit = 3) =>
  db
    .prepare(
      'SELECT * FROM login_history WHERE user_id = ? AND success = 1 ORDER BY id DESC LIMIT ?'
    )
    .all(userId, limit);

/** Failed attempts across all accounts — the thing worth actually looking at. */
const recentFailures = (limit = 40) =>
  db
    .prepare('SELECT * FROM login_history WHERE success = 0 ORDER BY id DESC LIMIT ?')
    .all(limit);

const allRecent = (limit = 100) =>
  db.prepare('SELECT * FROM login_history ORDER BY id DESC LIMIT ?').all(limit);

/**
 * An account signing in from more distinct addresses than usual is the cheapest
 * signal we have that a password has been shared or taken.
 */
function distinctIpCount(userId, days = 30) {
  return db
    .prepare(
      `SELECT COUNT(DISTINCT ip) c FROM login_history
       WHERE user_id = ? AND success = 1 AND created_at > datetime('now', ?)`
    )
    .get(userId, `-${days} days`).c;
}

/** How many sessions the account currently has open. */
function activeSessions(userId) {
  return db
    .prepare('SELECT COUNT(*) c FROM sessions WHERE expires_at > ? AND data LIKE ?')
    .get(Date.now(), `%"id":${userId},%`).c;
}

module.exports = {
  record,
  rememberDevice,
  devicesFor,
  recentFor,
  recentFailures,
  allRecent,
  distinctIpCount,
  activeSessions,
  parseAgent,
  ipOf,
};
