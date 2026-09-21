const bcrypt = require('bcryptjs');
const { db } = require('../db');
const reset = require('./reset');
const mailer = require('./mailer');
const emails = require('./emails');
const devlinks = require('./devlinks');
const pw = require('./password');
const audit = require('./audit');

/**
 * Password reset, shared by the staff panel and the client portal.
 *
 * The two differ only in which table they look in and where they send people
 * afterwards, so the logic lives here once rather than being written twice and
 * drifting apart — which is exactly how one of them ends up less careful than
 * the other.
 */

// Requests are throttled per address: without that, this becomes a way to
// spam somebody's inbox, and a way to test which emails are registered.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 4;
const recent = new Map();

const sweeper = setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [k, v] of recent) if (v.last < cutoff) recent.delete(k);
}, 15 * 60 * 1000);
if (sweeper.unref) sweeper.unref();

function tooMany(key) {
  const rec = recent.get(key);
  if (!rec) return false;
  if (Date.now() - rec.last > WINDOW_MS) {
    recent.delete(key);
    return false;
  }
  return rec.count >= MAX_PER_WINDOW;
}

function record(key) {
  const rec = recent.get(key) || { count: 0, last: 0 };
  rec.count += 1;
  rec.last = Date.now();
  recent.set(key, rec);
}

const AUDIENCES = {
  staff: {
    find: (identifier) =>
      db
        .prepare(
          `SELECT id, username AS handle, display_name AS name, email, active
           FROM users WHERE active = 1 AND (lower(email) = lower(?) OR username = ?)`
        )
        .get(identifier, identifier),
    setPassword: (id, hashValue) =>
      db
        .prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
        .run(hashValue, id),
    revokeSessions: (id) =>
      db.prepare('DELETE FROM sessions WHERE data LIKE ?').run(`%"id":${id},%`),
  },
  client: {
    find: (identifier) =>
      db
        .prepare(
          `SELECT id, email AS handle, full_name AS name, email
           FROM clients WHERE lower(email) = lower(?)`
        )
        .get(identifier),
    setPassword: (id, hashValue) =>
      db.prepare('UPDATE clients SET password_hash = ? WHERE id = ?').run(hashValue, id),
    revokeSessions: (id) =>
      db.prepare('DELETE FROM sessions WHERE data LIKE ?').run(`%"client":{"id":${id},%`),
  },
};

/**
 * Starts a reset. Always reports success to the caller: telling someone that
 * an address is not registered hands them a way to enumerate accounts.
 */
function request(audience, identifier, { ip = null, lang = 'ar' } = {}) {
  const id = String(identifier || '').trim();
  if (!id) return { ok: true };

  const key = `${audience}:${id.toLowerCase()}`;
  if (tooMany(key)) return { ok: true, throttled: true };
  record(key);

  const person = AUDIENCES[audience].find(id);
  if (!person || !person.email) return { ok: true };

  const token = reset.create(audience, person.id, ip);

  mailer.send(emails.passwordReset(person, token, { lang, audience }));
  devlinks.record(
    `إعادة تعيين كلمة المرور — ${person.name || person.handle}`,
    `${mailer.baseUrl()}${
      audience === 'staff' ? (process.env.ADMIN_PATH || '/office-panel') + '/reset' : '/portal/reset'
    }?token=${token}`
  );

  return { ok: true, sent: true };
}

/** Checks a token without spending it, for rendering the form. */
function verify(audience, token) {
  const row = reset.consume(token, audience);
  if (!row) return null;

  const table = audience === 'staff' ? 'users' : 'clients';
  const person = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(row.subject_id);
  return person ? { row, person } : null;
}

/** Applies the new password and closes every other session for that account. */
function complete(audience, token, password, confirmation, { lang = 'ar', req = null } = {}) {
  const found = verify(audience, token);
  if (!found) return { ok: false, reason: 'invalid' };

  if (password !== confirmation) return { ok: false, reason: 'mismatch' };

  const username = audience === 'staff' ? found.person.username : '';
  const weak = pw.firstMessage(password, { lang, username });
  if (weak) return { ok: false, reason: 'weak', message: weak };

  AUDIENCES[audience].setPassword(found.person.id, bcrypt.hashSync(password, 10));
  reset.markUsed(found.row.id);

  // Whoever knew the old password — including whoever forced this reset — is
  // signed out everywhere.
  AUDIENCES[audience].revokeSessions(found.person.id);

  if (audience === 'staff' && req) {
    audit.log(req, 'user.password_reset_self', {
      type: 'user',
      id: found.person.id,
      label: found.person.display_name || found.person.username,
      details: 'أعاد تعيين كلمة السر عن طريق رابط «نسيت كلمة المرور»',
    });
  }

  return { ok: true, person: found.person };
}

module.exports = { request, verify, complete };
