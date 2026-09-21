const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../../db');
const throttle = require('../../lib/throttle');
const audit = require('../../lib/audit');
const security = require('../../lib/security');
const notify = require('../../lib/notify');
const resetFlow = require('../../lib/password-reset');
const pw = require('../../lib/password');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect(req.adminPath + '');
  res.render('admin/login', { error: null, msg: req.query.msg });
});

router.post('/login', (req, res) => {
  const wait = throttle.retryAfter(req);
  if (wait) {
    const mins = Math.ceil(wait / 60);
    return res.status(429).render('admin/login', {
      error: `محاولات كتيرة. حاول تاني بعد ${mins} دقيقة.`,
      msg: null,
    });
  }

  const username = (req.body.username || '').trim();
  const password = req.body.password || '';
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  // One message for both cases, so the form cannot be used to discover
  // which usernames exist.
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    throttle.recordFailure(req);
    security.record(req, { userId: user ? user.id : null, username, success: false });
    return res.render('admin/login', {
      error: 'اسم المستخدم أو كلمة السر غير صحيحة.',
      msg: null,
    });
  }

  if (!user.active) {
    throttle.recordFailure(req);
    security.record(req, { userId: user.id, username, success: false });
    return res.render('admin/login', {
      error: 'الحساب موقوف. كلّم الأدمن.',
      msg: null,
    });
  }

  throttle.clear(req);

  // Rotate the session id on login so a token captured beforehand is useless.
  const returnTo = req.session.returnTo;
  const lang = req.session.lang;
  req.session.regenerate((err) => {
    if (err) return res.render('admin/login', { error: 'حصل خطأ. حاول تاني.', msg: null });

    req.session.lang = lang;
    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      display_name: user.display_name,
      must_change_password: !!user.must_change_password,
    };

    security.record(req, { userId: user.id, username: user.username, success: true });

    // A sign-in from a device this account has never used is the earliest
    // visible sign of a shared or stolen password, so the admins hear about it
    // straight away rather than finding it in a log later.
    const agent = security.parseAgent(req.get('user-agent') || '');
    const seen = security.rememberDevice(user.id, { ...agent, ip: security.ipOf(req) });

    if (seen.isNew) {
      const admins = db
        .prepare("SELECT id FROM users WHERE role = 'admin' AND active = 1 AND id != ?")
        .all(user.id)
        .map((a) => a.id);

      if (admins.length) {
        notify.notifyUsers(admins, null, {
          type: 'new_device',
          priority: 'critical',
          text: `🔐 ${user.display_name || user.username} دخل من جهاز جديد: ${seen.label} — ${security.ipOf(req)}`,
        });
      }
    }
    audit.log(req, 'auth.login', {
      type: 'user',
      id: user.id,
      label: user.display_name || user.username,
    });

    res.redirect(
      user.must_change_password ? req.adminPath + '/account?force=1' : returnTo || req.adminPath
    );
  });
});

// ---------------------------------------------------------------- forgot
router.get('/forgot', (req, res) => {
  res.render('admin/forgot', { sent: req.query.sent === '1', error: null });
});

router.post('/forgot', (req, res) => {
  resetFlow.request('staff', req.body.identifier, { ip: req.ip, lang: 'ar' });
  // The same answer either way, so this cannot be used to find out which
  // usernames or addresses exist.
  res.redirect(req.adminPath + '/forgot?sent=1');
});

router.get('/reset', (req, res) => {
  const token = (req.query.token || '').trim();
  const found = resetFlow.verify('staff', token);
  res.render('admin/reset', {
    token,
    valid: !!found,
    name: found ? found.person.display_name || found.person.username : '',
    error: null,
    rules: pw.describe('ar'),
  });
});

router.post('/reset', (req, res) => {
  const token = (req.body.token || '').trim();
  const result = resetFlow.complete('staff', token, req.body.password, req.body.password_confirm, {
    lang: 'ar',
    req,
  });

  if (result.ok) return res.redirect(req.adminPath + '/login?msg=reset_done');

  const found = resetFlow.verify('staff', token);
  const messages = {
    invalid: 'الرابط غير صالح أو انتهت صلاحيته.',
    mismatch: 'الكلمتان غير متطابقتين.',
  };

  res.render('admin/reset', {
    token,
    valid: !!found,
    name: found ? found.person.display_name || found.person.username : '',
    error: result.message || messages[result.reason] || 'حصل خطأ.',
    rules: pw.describe('ar'),
  });
});

router.post('/logout', (req, res) => {
  audit.log(req, 'auth.logout');
  req.session.destroy(() => res.redirect(req.adminPath + '/login'));
});

module.exports = router;
