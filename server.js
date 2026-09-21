require('./lib/restore-bootstrap').applyPendingRestore();
const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');

const { migrate } = require('./db/migrate');

// Schema first: the rest of the app assumes its tables exist.
console.log('Sanad — checking database…');
migrate();

const seed = require('./db/seed');
seed();

/**
 * Demo data, on demand.
 *
 * Managed hosts often do not let you run a command against a deployed app, so
 * "just run npm run demo on the server" is not an option there. Setting
 * SEED_DEMO=1 fills the database on the next boot instead.
 *
 * It only runs when there are no requests yet, so a restart never touches a
 * database that has real work in it.
 */
if (process.env.SEED_DEMO === '1') {
  const { db } = require('./db');
  const existing = db.prepare('SELECT COUNT(*) c FROM requests').get().c;

  if (existing > 0) {
    console.log(`  SEED_DEMO: ${existing} requests already exist — skipping demo data.`);
  } else {
    console.log('  SEED_DEMO=1 — seeding demo data…');
    try {
      require('./db/demo-data')({ quiet: true, writeAccountsFile: false });
      console.log('  ✓ Demo data ready. Unset SEED_DEMO before going live.');
    } catch (err) {
      // A failed demo seed must never stop the real application from starting.
      console.error('  ✗ Demo seeding failed:', err.message);
    }
  }
}

const SqliteStore = require('./lib/session-store');
const csrf = require('./lib/csrf');
const { locals } = require('./middleware/locals');

const app = express();

// Exposed so the test suites can forget the login counters after deliberately
// exhausting them; nothing reachable over HTTP touches this.
app.locals.throttle = require('./lib/throttle');
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1); // behind Railway/Render/nginx, so req.ip is the real client

/**
 * Security headers.
 *
 * Set by hand rather than pulling in helmet: six headers is not worth a
 * dependency, and writing them out makes it obvious what is and is not set.
 */
app.disable('x-powered-by');

app.use((req, res, next) => {
  // Stops a browser from guessing a different content type than we sent —
  // the trick behind turning an uploaded image into a script.
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // No framing at all: nothing here is meant to be embedded, and this closes
  // clickjacking on the admin panel.
  res.setHeader('X-Frame-Options', 'DENY');

  // Client names and reference numbers must not leak into other sites' logs
  // through the referrer.
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // The app needs none of these, so nothing can quietly ask for them.
  // Login may request the staff member's location for the security log.
  // Browsers still require an explicit permission prompt from the employee.
  res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(), payment=(), usb=()');

  // Only the upload page uses the camera, and only through a file input.
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join('; ')
  );

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
});

// 1MB is generous for a form and small enough that a flood of oversized posts
// cannot occupy memory. File uploads go through multer with their own limits.
app.use(express.urlencoded({ extended: true, limit: '256kb', parameterLimit: 200 }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));
// Moved below (after csrf/locals): the authenticated /support-files route
// renders the app's own error templates, which need res.locals.lang/dir —
// see routes/support-files.js for why this replaced a plain static mount.

const sessionCookieSecure = process.env.SESSION_COOKIE_SECURE === 'true' ||
  (process.env.SESSION_COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production' && !process.env.TENANT_ID);
const sessionCookieName = process.env.TENANT_ID
  ? `sanad.tenant.${String(process.env.TENANT_ID).replace(/[^0-9]/g, '')}.sid`
  : 'sanad.sid';

app.use(
  session({
    store: new SqliteStore(),
    secret: process.env.SESSION_SECRET || 'sanad-secret-change-me',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    name: sessionCookieName,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
      httpOnly: true,
      sameSite: 'lax',
      secure: sessionCookieSecure,
    },
  })
);

// The admin panel does not sit on a guessable path. Change ADMIN_PATH in the
// environment and the whole panel moves with it — every internal link is built
// from this one value.
const ADMIN_PATH = (process.env.ADMIN_PATH || '/office-panel').replace(/\/+$/, '');

// One-use, short-lived access from the central Sanad owner screen into the
// selected tenant. The signature uses this tenant's private session secret;
// tokens for another office cannot be reused here.
app.get('/platform-owner-access',(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!process.env.TENANT_ID)return res.status(404).end();
  try{
    const token=String(req.query.token||''),parts=token.split('.');if(parts.length!==2)throw new Error('token');
    const expected=crypto.createHmac('sha256',process.env.SESSION_SECRET||'').update(parts[0]).digest('base64url');
    if(parts[1].length!==expected.length||!crypto.timingSafeEqual(Buffer.from(parts[1]),Buffer.from(expected)))throw new Error('signature');
    const payload=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
    if(String(payload.tenant_id)!==String(process.env.TENANT_ID)||Date.now()>Number(payload.exp)||!payload.nonce)throw new Error('expired');
    const {db}=require('./db');
    try{db.prepare('INSERT INTO platform_access_nonces(nonce) VALUES(?)').run(payload.nonce)}catch(_){throw new Error('used')}
    const user=db.prepare("SELECT * FROM users WHERE role='admin' AND active=1 ORDER BY id LIMIT 1").get();if(!user)throw new Error('admin');
    req.session.regenerate(err=>{if(err)return res.status(500).end();req.session.user={id:user.id,username:user.username,role:user.role,display_name:user.display_name,must_change_password:false};req.session.platformOwnerAccess=true;const to=payload.to==='reports'?'/report-profiles':'/imports';res.redirect(ADMIN_PATH+to)});
  }catch(_){res.status(403).send('الرابط غير صالح أو انتهت مدته. ارجع إلى لوحة مالك سند وافتحه من جديد.')}
});

app.use((req, res, next) => {
  res.locals.adminPath = ADMIN_PATH;
  next();
});

app.use(csrf);
app.use(locals);
app.use(require('./lib/license').middleware);
app.use(require('./lib/entitlements').middleware);

app.use(ADMIN_PATH, require('./routes/admin'));

// Anyone poking at the old path gets the ordinary 404, not a hint that a panel
// exists somewhere else.
app.use('/admin', (req, res) => res.status(404).render('errors/404'));

app.use(require('./lib/entitlements').publicAccess);
app.use('/support-files', require('./routes/support-files'));
app.use('/portal', require('./routes/portal'));
app.use('/appointments', require('./routes/bookings'));
app.use('/support', require('./routes/support'));
app.use('/', require('./routes/unified_login'));
app.use('/upload', require('./routes/upload'));
app.use('/track', require('./routes/track'));
app.use('/', require('./routes/files'));
app.use('/', require('./routes/public'));

// ---------------------------------------------------------------- errors
app.use((req, res) => {
  res.status(404).render('errors/404');
});

app.use((err, req, res, next) => {
  // Body parser rejections are ordinary client mistakes (or probing), not
  // server faults — they get a plain 413 rather than the 500 page.
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).render('errors/413', { layout: false });
  }
  if (err && (err.type === 'parameters.too.many' || err.type === 'entity.parse.failed')) {
    return res.status(400).render('errors/400', { layout: false });
  }

  console.error(err);
  res.status(500).render('errors/500');
});

// Refusing to boot is safer than running a live site whose session cookies
// anyone could forge from a secret that ships in the source.
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.error(
    '\n  ✗ SESSION_SECRET مش متظبط، والوضع production.\n' +
      '    ولّد واحد وحطه في متغيرات البيئة:\n' +
      '    node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n'
  );
  process.exit(1);
}

// Read notifications older than a month, and expired reset tokens, are cleared
// once a day so the tables do not grow without bound.
require('./lib/notify').startHousekeeping();
require('./lib/deadlines').start();
require('./lib/reset').purge();

app.listen(PORT, () => {
  console.log(`Sanad running on http://localhost:${PORT}`);
  console.log(`  admin: ${ADMIN_PATH}/login`);
  if (!process.env.SESSION_SECRET) {
    console.warn('  ⚠ SESSION_SECRET is not set — using the built-in fallback.');
  }
  if (ADMIN_PATH === '/office-panel' && process.env.NODE_ENV === 'production') {
    console.warn('  ⚠ ADMIN_PATH is still the default — change it.');
  }
  if (process.env.SEED_DEMO === '1' && process.env.NODE_ENV === 'production') {
    // Passwords are no longer the risk: every demo account is forced to change
    // its own on first sign-in here. What remains is fake clients and fake
    // requests sitting in the same database as the real ones.
    console.warn('  ⚠ SEED_DEMO is on — demo clients and requests are mixed into this database.');
  }
});
