const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('../db');
const mailer = require('../lib/mailer');
const emails = require('../lib/emails');
const pw = require('../lib/password');
const devlinks = require('../lib/devlinks');
const resetFlow = require('../lib/password-reset');
const google = require('../lib/google');

const router = express.Router();
const MIN_PASSWORD = pw.MIN_LENGTH;

const RELATIONS = ['self', 'guardian', 'agent', 'relative', 'other'];

const T = {
  ar: {
    login: 'متابعة طلبي',
    loginSub: 'سجّل الدخول لمتابعة حالة طلباتك ومعرفة المستندات المطلوبة منك.',
    register: 'حساب جديد',
    registerSub: 'التسجيل هو الطريقة الوحيدة لمتابعة طلبك أونلاين.',
    email: 'الإيميل',
    password: 'كلمة السر',
    passwordAgain: 'تأكيد كلمة السر',
    fullName: 'الاسم ثلاثي',
    phone: 'رقم الموبايل (بمفتاح الدولة)',
    relation: 'إنت مين بالنسبة للطلب؟',
    submit: 'دخول',
    createBtn: 'إنشاء الحساب',
    noAccount: 'ليس لديك حساب؟',
    haveAccount: 'عندك حساب؟',
    createOne: 'أنشئ حساباً',
    signIn: 'سجّل دخول',
    wrong: 'الإيميل أو كلمة السر غير صحيحة.',
    exists: 'الإيميل ده مسجّل بالفعل. سجّل دخول بدل ما تعمل حساب جديد.',
    shortPw: `كلمة السر لازم تكون ${MIN_PASSWORD} حروف على الأقل.`,
    mismatch: 'كلمة السر والتأكيد مش متطابقين.',
    missing: 'كل الخانات مطلوبة.',
    linked: 'ربطنا طلباتك السابقة بحسابك.',
    myRequests: 'طلباتي',
    none: 'لسه مقدمتش أي طلب.',
    service: 'الخدمة',
    status: 'الحالة',
    date: 'تاريخ الطلب',
    deadline: 'موعد التسليم',
    needed: 'المطلوب منك',
    files: 'ملفاتك',
    logout: 'خروج',
    account: 'الأتعاب',
    paid: 'المدفوع',
    remaining: 'المتبقي',
    received: 'تم الاستلام',
    pending: 'مطلوب',
    unverified: 'لسه محتاجين نأكد إيميلك. هنبعتلك رسالة التأكيد أول ما الخدمة تتفعّل.',
    beneficiary: 'اسم صاحب الطلب',
    welcome: 'أهلاً',
    googleBtn: 'المتابعة بحساب Google',
    googleOr: 'أو',
    googleOff: 'الدخول بحساب Google غير مفعّل حالياً.',
    googleFailed: 'تعذّر إتمام الدخول بحساب Google. جرّب مرة أخرى أو استخدم بريدك وكلمة المرور.',
    googleCancelled: 'تم إلغاء الدخول بحساب Google.',
    googleLinked: 'تم ربط حساب Google بحسابك لدينا.',
    googleWelcome: 'أهلاً بك — تم إنشاء حسابك عبر Google.',
    forgot: 'نسيت كلمة المرور؟',
    forgotTitle: 'استعادة كلمة المرور',
    forgotSub: 'اكتب بريدك الإلكتروني وسنرسل إليك رابطاً لاختيار كلمة مرور جديدة.',
    forgotSent: 'إن كان هذا البريد مسجّلاً لدينا، فقد أرسلنا إليه رابط إعادة التعيين. يُرجى مراجعة بريدك.',
    send: 'إرسال الرابط',
    resetTitle: 'اختيار كلمة مرور جديدة',
    resetInvalid: 'الرابط غير صالح أو انتهت صلاحيته. يُرجى طلب رابط جديد.',
    resetDone: 'تم تغيير كلمة المرور. يمكنك تسجيل الدخول الآن.',
    newPassword: 'كلمة المرور الجديدة',
    save: 'حفظ كلمة المرور',
  },
  en: {
    login: 'Track my request',
    loginSub: 'Sign in to see your request status and what we need from you.',
    register: 'Create account',
    registerSub: 'An account is the only way to follow your request online.',
    email: 'Email',
    password: 'Password',
    passwordAgain: 'Confirm password',
    fullName: 'Full name (three parts)',
    phone: 'Mobile number (with country code)',
    relation: 'Who are you in this request?',
    submit: 'Sign in',
    createBtn: 'Create account',
    noAccount: "Don't have an account?",
    haveAccount: 'Already have an account?',
    createOne: 'Create one',
    signIn: 'Sign in',
    wrong: 'Wrong email or password.',
    exists: 'That email is already registered. Sign in instead.',
    shortPw: `Password must be at least ${MIN_PASSWORD} characters.`,
    mismatch: 'Password and confirmation do not match.',
    missing: 'All fields are required.',
    linked: 'We linked your earlier requests to this account.',
    myRequests: 'My requests',
    none: 'You have no requests yet.',
    service: 'Service',
    status: 'Status',
    date: 'Requested on',
    deadline: 'Delivery date',
    needed: 'Needed from you',
    files: 'Your files',
    logout: 'Sign out',
    account: 'Fees',
    paid: 'Paid',
    remaining: 'Remaining',
    received: 'Received',
    pending: 'Pending',
    unverified: 'We still need to verify your email. A confirmation message will be sent once email is enabled.',
    beneficiary: 'Name of the person the request is for',
    welcome: 'Welcome',
    googleBtn: 'Continue with Google',
    googleOr: 'or',
    googleOff: 'Google sign-in is not enabled at the moment.',
    googleFailed: 'We could not complete Google sign-in. Try again, or use your email and password.',
    googleCancelled: 'Google sign-in was cancelled.',
    googleLinked: 'Your Google account has been linked.',
    googleWelcome: 'Welcome — your account was created with Google.',
    forgot: 'Forgot your password?',
    forgotTitle: 'Reset your password',
    forgotSub: 'Enter your email and we will send you a link to choose a new password.',
    forgotSent: 'If that email is registered with us, we have sent a reset link. Please check your inbox.',
    send: 'Send the link',
    resetTitle: 'Choose a new password',
    resetInvalid: 'This link is invalid or has expired. Please request a new one.',
    resetDone: 'Your password has been changed. You can sign in now.',
    newPassword: 'New password',
    save: 'Save password',
  },
};

const tr = (res) => T[res.locals.lang];

function requireClient(req, res, next) {
  if (!req.session.client) {
    req.session.portalReturnTo = req.originalUrl;
    return res.redirect('/portal/login');
  }
  next();
}

/**
 * Guest requests carry only an email address. When somebody registers with the
 * same address we attach those requests to the new account, so a client who
 * ordered first and signed up afterwards still sees their history.
 */
function linkGuestRequests(clientId, email) {
  const result = db
    .prepare(
      'UPDATE requests SET client_id = ? WHERE client_id IS NULL AND lower(email) = lower(?)'
    )
    .run(clientId, email);
  return result.changes;
}

// ---------------------------------------------------------------- login
const safeNext = (value) => {
  // Only same-site paths, so this cannot be turned into an open redirect.
  const v = String(value || '');
  return /^\/[A-Za-z0-9\-_/?=&.%]*$/.test(v) && !v.startsWith('//') ? v : null;
};

router.get('/login', (req, res) => {
  if (req.session.client) return res.redirect('/portal');
  res.render('portal/login', {
    error: null,
    next: safeNext(req.query.next),
    googleOn: google.isEnabled(),
    err: req.query.err || null,
    T: tr(res),
  });
});

router.post('/login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const client = db.prepare('SELECT * FROM clients WHERE lower(email) = ?').get(email);

  const nextPath = safeNext(req.body.next);

  if (
    !client ||
    !client.password_hash ||
    !bcrypt.compareSync(req.body.password || '', client.password_hash)
  ) {
    return res.render('portal/login', { error: tr(res).wrong, next: nextPath, googleOn: google.isEnabled(), err: null, T: tr(res) });
  }

  const lang = req.session.lang;
  const back = req.session.portalReturnTo;
  req.session.regenerate((err) => {
    if (err) return res.render('portal/login', { error: tr(res).wrong, next: nextPath, googleOn: google.isEnabled(), err: null, T: tr(res) });
    req.session.lang = lang;
    req.session.client = {
      id: client.id,
      email: client.email,
      full_name: client.full_name,
      email_verified: !!client.email_verified,
    };
    // Catch requests placed as a guest between visits.
    linkGuestRequests(client.id, client.email);
    res.redirect(nextPath || back || '/portal');
  });
});

// ---------------------------------------------------------------- register
router.get('/register', (req, res) => {
  if (req.session.client) return res.redirect('/portal');
  res.render('portal/register', {
    error: null,
    form: { email: req.query.email || '' },
    next: safeNext(req.query.next),
    googleOn: google.isEnabled(),
    T: tr(res),
    RELATIONS,
    rules: pw.describe(res.locals.lang),
  });
});

router.post('/register', (req, res) => {
  const b = req.body;
  const email = (b.email || '').trim().toLowerCase();
  const fullName = (b.full_name || '').trim();
  const phone = (b.phone || '').trim();
  const relation = RELATIONS.includes(b.relation) ? b.relation : 'self';
  const beneficiary = (b.beneficiary_name || '').trim();
  const password = b.password || '';

  const fail = (msg) =>
    res.render('portal/register', {
      error: msg,
      form: { email, full_name: fullName, phone, relation, beneficiary_name: beneficiary },
      next: safeNext(b.next),
      googleOn: google.isEnabled(),
      T: tr(res),
      RELATIONS,
      rules: pw.describe(res.locals.lang),
    });

  if (!email || !fullName || !phone) return fail(tr(res).missing);
  if (password !== (b.password_confirm || '')) return fail(tr(res).mismatch);

  const weak = pw.firstMessage(password, { lang: res.locals.lang });
  if (weak) return fail(weak);
  if (db.prepare('SELECT 1 FROM clients WHERE lower(email) = ?').get(email)) {
    return fail(tr(res).exists);
  }

  const info = db
    .prepare(
      `INSERT INTO clients (email, password_hash, full_name, phone, relation, beneficiary_name,
                            email_verified, verify_token)
       VALUES (?,?,?,?,?,?,0,?)`
    )
    .run(
      email,
      bcrypt.hashSync(password, 10),
      fullName,
      phone,
      relation,
      relation === 'self' ? null : beneficiary || null,
      crypto.randomBytes(24).toString('hex')
    );

  const clientId = Number(info.lastInsertRowid);
  const linked = linkGuestRequests(clientId, email);

  const created = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);

  // With no mail provider configured there is nowhere to send a confirmation,
  // so asking the client to confirm would be asking for something impossible.
  if (mailer.isLive()) {
    mailer.send(emails.verifyEmail(created, created.verify_token, { lang: res.locals.lang }));
  } else {
    db.prepare('UPDATE clients SET verify_token = NULL WHERE id = ?').run(clientId);
  }
  devlinks.record(
    `تأكيد إيميل — ${created.full_name} (${created.email})`,
    `${mailer.baseUrl()}/portal/verify?token=${created.verify_token}`
  );

  const lang = req.session.lang;
  req.session.regenerate((err) => {
    if (err) return fail(tr(res).missing);
    req.session.lang = lang;
    req.session.client = { id: clientId, email, full_name: fullName, email_verified: false };
    res.redirect(safeNext(b.next) || '/portal' + (linked ? '?linked=' + linked : ''));
  });
});

/**
 * Confirms an address from the emailed link. Tokens are single-use: once
 * spent it is cleared, so a forwarded link cannot be replayed.
 */
router.get('/verify', (req, res) => {
  const token = (req.query.token || '').trim();
  const client = token
    ? db.prepare('SELECT * FROM clients WHERE verify_token = ?').get(token)
    : null;

  if (!client) return res.render('portal/verified', { ok: false, T: tr(res) });

  db.prepare('UPDATE clients SET email_verified = 1, verify_token = NULL WHERE id = ?')
    .run(client.id);

  if (req.session.client && req.session.client.id === client.id) {
    req.session.client.email_verified = true;
  }

  res.render('portal/verified', { ok: true, T: tr(res) });
});

router.post('/resend-verification', requireClient, (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.session.client.id);
  if (!client || client.email_verified) return res.redirect('/portal');

  let token = client.verify_token;
  if (!token) {
    token = crypto.randomBytes(24).toString('hex');
    db.prepare('UPDATE clients SET verify_token = ? WHERE id = ?').run(token, client.id);
  }

  mailer.send(emails.verifyEmail(client, token, { lang: res.locals.lang }));
  devlinks.record(
    `تأكيد إيميل (إعادة إرسال) — ${client.email}`,
    `${mailer.baseUrl()}/portal/verify?token=${token}`
  );
  res.redirect('/portal?resent=1');
});

// ---------------------------------------------------------------- google
router.get('/google', (req, res) => {
  if (!google.isEnabled()) return res.redirect('/portal/login?err=google_off');
  if (req.session.client) return res.redirect('/portal');

  res.redirect(google.authUrl(req, safeNext(req.query.next)));
});

router.get('/google/callback', async (req, res) => {
  const fail = (reason) => res.redirect('/portal/login?err=' + reason);

  if (!google.isEnabled()) return fail('google_off');

  // The state has to match the one this browser started with, and it is spent
  // either way so a returned URL cannot be replayed.
  const expected = req.session.googleState;
  const nextPath = req.session.googleNext;
  req.session.googleState = null;
  req.session.googleNext = null;

  if (!expected || req.query.state !== expected) return fail('google_state');
  if (req.query.error || !req.query.code) return fail('google_cancelled');

  let profile;
  try {
    profile = await google.exchange(req, String(req.query.code));
  } catch (err) {
    console.error('Google sign-in failed:', err.message);
    return fail('google_failed');
  }

  const { client, created, linked } = google.linkClient(profile);

  const lang = req.session.lang;
  req.session.regenerate((err) => {
    if (err) return fail('google_failed');

    req.session.lang = lang;
    req.session.client = {
      id: client.id,
      email: client.email,
      full_name: client.full_name,
      email_verified: true,
    };

    const attached = linkGuestRequests(client.id, client.email);

    const params = [];
    if (created) params.push('welcome=1');
    if (linked) params.push('linked_google=1');
    if (attached) params.push('linked=' + attached);

    res.redirect(nextPath || '/portal' + (params.length ? '?' + params.join('&') : ''));
  });
});

// ---------------------------------------------------------------- forgot
router.get('/forgot', (req, res) => {
  res.render('portal/forgot', { sent: req.query.sent === '1', T: tr(res) });
});

router.post('/forgot', (req, res) => {
  resetFlow.request('client', req.body.email, { ip: req.ip, lang: res.locals.lang });
  res.redirect('/portal/forgot?sent=1');
});

router.get('/reset', (req, res) => {
  const token = (req.query.token || '').trim();
  const found = resetFlow.verify('client', token);
  res.render('portal/reset', {
    token,
    valid: !!found,
    name: found ? found.person.full_name : '',
    error: null,
    T: tr(res),
  });
});

router.post('/reset', (req, res) => {
  const token = (req.body.token || '').trim();
  const result = resetFlow.complete('client', token, req.body.password, req.body.password_confirm, {
    lang: res.locals.lang,
  });

  if (result.ok) return res.redirect('/portal/login?msg=reset_done');

  const found = resetFlow.verify('client', token);
  const t = tr(res);
  const messages = { invalid: t.resetInvalid, mismatch: t.mismatch };

  res.render('portal/reset', {
    token,
    valid: !!found,
    name: found ? found.person.full_name : '',
    error: result.message || messages[result.reason] || t.missing,
    T: t,
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---------------------------------------------------------------- pages
router.get('/', requireClient, (req, res) => {
  const requests = db
    .prepare('SELECT * FROM requests WHERE client_id = ? ORDER BY id DESC')
    .all(req.session.client.id)
    .map((r) => ({
      ...r,
      pending_count: db
        .prepare("SELECT COUNT(*) c FROM requirements WHERE request_id = ? AND status = 'pending'")
        .get(r.id).c,
    }));

  res.render('portal/requests', {
    requests,
    linked: req.query.linked,
    resent: req.query.resent,
    mailLive: mailer.isLive(),
    T: tr(res),
  });
});

router.get('/requests/:id', requireClient, (req, res) => {
  const r = db
    .prepare('SELECT * FROM requests WHERE id = ? AND client_id = ?')
    .get(req.params.id, req.session.client.id);
  if (!r) return res.redirect('/portal');

  // Only the client-facing slices. Internal comments, todos and the audit
  // trail are never queried here at all.
  const requirements = db
    .prepare('SELECT * FROM requirements WHERE request_id = ? ORDER BY id')
    .all(r.id);

  const documents = db
    .prepare('SELECT * FROM documents WHERE request_id = ? ORDER BY id')
    .all(r.id)
    .map((d) => ({
      ...d,
      files: db
        .prepare('SELECT * FROM document_files WHERE document_id = ? ORDER BY page_no')
        .all(d.id),
    }));

  const legalCase = db.prepare(`SELECT c.*,cc.name category_name FROM legal_cases c
    LEFT JOIN case_categories cc ON cc.id=c.category_id WHERE c.request_id=?`).get(r.id);
  const caseHearings = legalCase ? db.prepare(`SELECT hearing_on,court,circuit,purpose,decision,next_hearing,status
    FROM case_hearings WHERE case_id=? AND client_visible=1 ORDER BY hearing_on DESC,id DESC`).all(legalCase.id) : [];
  const caseTasks = legalCase ? db.prepare(`SELECT title,due_on,status FROM case_tasks
    WHERE case_id=? AND client_visible=1 ORDER BY status,due_on,id`).all(legalCase.id) : [];
  const caseEvents = legalCase ? db.prepare(`SELECT title,details,event_on,event_type FROM case_events
    WHERE case_id=? AND client_visible=1 ORDER BY event_on DESC,id DESC`).all(legalCase.id) : [];

  res.render('portal/request_detail', { r, requirements, documents, legalCase, caseHearings, caseTasks, caseEvents,
    CASE_STATUS: require('../lib/cases').STATUS, T: tr(res) });
});

module.exports = router;
