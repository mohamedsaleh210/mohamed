const crypto = require('crypto');
const { db } = require('../db');

/**
 * Password reset tokens.
 *
 * Only a hash is stored: a leaked database still cannot be used to take over
 * accounts. Tokens expire in an hour and are single-use, and creating a new one
 * cancels any earlier request for the same account.
 */
const TTL_MINUTES = 60;

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

function create(audience, subjectId, ip = null) {
  const token = crypto.randomBytes(32).toString('hex');

  db.prepare(
    `UPDATE password_resets SET used_at = datetime('now')
     WHERE audience = ? AND subject_id = ? AND used_at IS NULL`
  ).run(audience, subjectId);

  db.prepare(
    `INSERT INTO password_resets (audience, subject_id, token_hash, expires_at, requested_ip)
     VALUES (?,?,?, datetime('now', ?), ?)`
  ).run(audience, subjectId, hash(token), `+${TTL_MINUTES} minutes`, ip);

  return token;
}

/** Returns the pending reset for a token, or null if it is spent or expired. */
function consume(token, audience) {
  if (!token || token.length < 32) return null;

  const row = db
    .prepare(
      `SELECT * FROM password_resets
       WHERE token_hash = ? AND audience = ? AND used_at IS NULL
         AND expires_at > datetime('now')`
    )
    .get(hash(token), audience);

  return row || null;
}

const markUsed = (id) =>
  db.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE id = ?").run(id);

/** Housekeeping so the table does not accumulate dead rows. */
function purge() {
  db.prepare(
    "DELETE FROM password_resets WHERE expires_at < datetime('now', '-7 days')"
  ).run();
}

module.exports = { create, consume, markUsed, purge, TTL_MINUTES };
