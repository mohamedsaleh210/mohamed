const crypto = require('crypto');
const { db, getSetting } = require('../db');

/**
 * Google sign-in, for clients only.
 *
 * Written against the endpoints directly rather than pulling in an OAuth
 * library: the authorisation-code flow is three requests, and a dependency here
 * would be more code to audit than the code it replaces — on the one path where
 * a mistake hands over someone's account.
 *
 * Staff deliberately do not get this. Their accounts are created by the office
 * and tied to an identity the office verified; letting a Google account open a
 * staff session would move that decision to whoever controls the mailbox.
 */
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

const clientId = () => (getSetting('google_client_id', '') || '').trim();
const clientSecret = () => (getSetting('google_client_secret', '') || '').trim();

/** Configured means both halves are present; one alone is a half-finished setup. */
const isEnabled = () => !!clientId() && !!clientSecret();

/**
 * The address Google will send the visitor back to.
 *
 * Must match a redirect URI registered in the Google console exactly, which is
 * why it is derived from the configured domain rather than from the incoming
 * request — a host header is attacker-controlled.
 */
function redirectUri(req) {
  const configured = (getSetting('site_domain', '') || '').trim().replace(/\/+$/, '');
  const base = configured || `${req.protocol}://${req.get('host')}`;
  return `${base}/portal/google/callback`;
}

/**
 * Starts the flow.
 *
 * `state` is a random value kept in the session and checked on return: without
 * it, an attacker can complete a sign-in in someone else's browser and end up
 * with their session pointing at the attacker's account.
 */
function authUrl(req, next = null) {
  const state = crypto.randomBytes(24).toString('hex');
  req.session.googleState = state;
  req.session.googleNext = next || null;

  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    // Google should ask which account to use, rather than silently reusing
    // whichever one the browser happens to be signed into.
    prompt: 'select_account',
  });

  return `${AUTH_URL}?${params.toString()}`;
}

/** Exchanges the one-time code for the profile behind it. */
async function exchange(req, code) {
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(req),
      grant_type: 'authorization_code',
    }).toString(),
  });

  if (!tokenRes.ok) {
    throw new Error(`token exchange failed (${tokenRes.status})`);
  }

  const tokens = await tokenRes.json();
  if (!tokens.access_token) throw new Error('no access token returned');

  const profileRes = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });

  if (!profileRes.ok) throw new Error(`userinfo failed (${profileRes.status})`);

  const profile = await profileRes.json();
  if (!profile.sub) throw new Error('no subject in profile');

  // An unverified address proves nothing: anyone can put any email on a Google
  // account. Matching on it would let a stranger take over a client's file.
  if (!profile.email || profile.email_verified === false) {
    throw new Error('unverified email');
  }

  return {
    googleId: String(profile.sub),
    email: String(profile.email).toLowerCase(),
    name: profile.name || '',
  };
}

/**
 * Finds or creates the client behind a Google profile.
 *
 * Matching by Google id first, then by verified email — so a client who
 * registered with a password can later sign in with Google and land in the same
 * file rather than a duplicate one.
 */
function linkClient({ googleId, email, name }) {
  const byGoogle = db.prepare('SELECT * FROM clients WHERE google_id = ?').get(googleId);
  if (byGoogle) return { client: byGoogle, created: false, linked: false };

  const byEmail = db.prepare('SELECT * FROM clients WHERE lower(email) = ?').get(email);
  if (byEmail) {
    db.prepare('UPDATE clients SET google_id = ?, email_verified = 1 WHERE id = ?').run(
      googleId,
      byEmail.id
    );
    return {
      client: db.prepare('SELECT * FROM clients WHERE id = ?').get(byEmail.id),
      created: false,
      linked: true,
    };
  }

  // Brand new: no password is set, because there is nothing to set it from.
  // The client can add one later from the portal if they want both ways in.
  const info = db
    .prepare(
      `INSERT INTO clients (email, google_id, full_name, email_verified, relation)
       VALUES (?,?,?,1,'self')`
    )
    .run(email, googleId, name || email.split('@')[0]);

  return {
    client: db.prepare('SELECT * FROM clients WHERE id = ?').get(Number(info.lastInsertRowid)),
    created: true,
    linked: false,
  };
}

module.exports = { isEnabled, authUrl, exchange, linkClient, redirectUri, clientId };
