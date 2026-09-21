const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const throttle = require('../lib/throttle');
const security = require('../lib/security');
const audit = require('../lib/audit');
const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect(res.locals.adminPath);
  if (req.session.client) return res.redirect('/portal');
  res.render('public/unified_login', { error: null });
});

// This screen authenticates against the same `users` table as the admin
// panel login — including the admin account itself — so it needs the same
// per-IP throttle and the same trail in the security log. It previously had
// neither, which meant password guessing here had no limit and left no trace.
router.post('/login', (req, res) => {
  const wait = throttle.retryAfter(req);
  if (wait) {
    const mins = Math.ceil(wait / 60);
    return res.status(429).render('public/unified_login', {
      error: `محاولات كتيرة. حاول تاني بعد ${mins} دقيقة.`,
    });
  }

  const identifier = String(req.body.identifier || '').trim();
  const password = String(req.body.password || '');
  const staff = db.prepare(`SELECT * FROM users WHERE active=1 AND
    (lower(username)=lower(?) OR lower(COALESCE(email,''))=lower(?) OR phone=?) LIMIT 1`)
    .get(identifier, identifier, identifier);

  if (staff && bcrypt.compareSync(password, staff.password_hash)) {
    throttle.clear(req);
    security.record(req, { userId: staff.id, username: staff.username, success: true });
    const lang = req.session.lang;
    return req.session.regenerate(err => {
      if (err) return res.render('public/unified_login', { error: 'تعذر تسجيل الدخول. حاول مرة أخرى.' });
      req.session.lang = lang;
      req.session.user = { id: staff.id, username: staff.username, role: staff.role,
        display_name: staff.display_name, must_change_password: !!staff.must_change_password };
      audit.log(req, 'auth.login', { type: 'user', id: staff.id, label: staff.display_name || staff.username });
      res.redirect(staff.must_change_password ? `${res.locals.adminPath}/account?force=1` : res.locals.adminPath);
    });
  }

  const client = db.prepare(`SELECT * FROM clients WHERE
    lower(email)=lower(?) OR phone=? LIMIT 1`).get(identifier, identifier);
  if (client && client.password_hash && bcrypt.compareSync(password, client.password_hash)) {
    throttle.clear(req);
    const lang = req.session.lang;
    return req.session.regenerate(err => {
      if (err) return res.render('public/unified_login', { error: 'تعذر تسجيل الدخول. حاول مرة أخرى.' });
      req.session.lang = lang;
      req.session.client = { id: client.id, email: client.email, full_name: client.full_name,
        email_verified: !!client.email_verified };
      res.redirect('/portal');
    });
  }

  throttle.recordFailure(req);
  if (staff) security.record(req, { userId: staff.id, username: staff.username, success: false });
  res.status(401).render('public/unified_login', { error: 'بيانات الدخول غير صحيحة أو الحساب موقوف.' });
});

module.exports = router;
