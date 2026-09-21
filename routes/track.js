const express = require('express');
const { db } = require('../db');
const refLib = require('../lib/ref');

const router = express.Router();

/**
 * Tracking without an account.
 *
 * A reference alone is not enough — it can be overheard, forwarded or found on
 * a printout. Pairing it with the phone number on the request means the person
 * asking has to know something only the client and the office know.
 *
 * References are random (see lib/ref), so guessing one is impractical; the
 * throttle below closes the remaining gap.
 */
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 12;
const attempts = new Map();

const cleanup = setInterval(() => {
  const cutoff = Date.now() - ATTEMPT_WINDOW_MS;
  for (const [key, rec] of attempts) if (rec.last < cutoff) attempts.delete(key);
}, 5 * 60 * 1000);
if (cleanup.unref) cleanup.unref();

function throttleState(req) {
  const key = req.ip || 'unknown';
  const rec = attempts.get(key);
  if (!rec || rec.count < MAX_ATTEMPTS) return { blocked: false };
  if (Date.now() - rec.last > ATTEMPT_WINDOW_MS) {
    attempts.delete(key);
    return { blocked: false };
  }
  return { blocked: true, minutes: Math.ceil((ATTEMPT_WINDOW_MS - (Date.now() - rec.last)) / 60000) };
}

function recordFailure(req) {
  const key = req.ip || 'unknown';
  const rec = attempts.get(key) || { count: 0, last: 0 };
  rec.count += 1;
  rec.last = Date.now();
  attempts.set(key, rec);
}

const T = {
  ar: {
    title: 'تتبّع طلبك',
    sub: 'أدخل رقم الطلب ورقم الهاتف الذي سجّلته، لتتابع حالة طلبك والمستندات المطلوبة منك.',
    ref: 'رقم الطلب',
    phone: 'رقم الهاتف',
    submit: 'عرض حالة الطلب',
    notFound: 'لم نتمكّن من العثور على طلب بهذه البيانات. تأكّد من رقم الطلب ورقم الهاتف.',
    blocked: 'محاولات كثيرة. يُرجى المحاولة بعد %d دقيقة.',
    missing: 'يُرجى إدخال رقم الطلب ورقم الهاتف.',
    hint: 'رقم الطلب وصلك في رسالة تأكيد الطلب، ويبدأ بـ SND.',
    haveAccount: 'لديك حساب؟',
    signIn: 'تسجيل الدخول',
    betterWithAccount: 'بحساب مجاني تتابع كل طلباتك في مكان واحد وترفع مستنداتك في أي وقت.',
    createAccount: 'إنشاء حساب',
  },
  en: {
    title: 'Track your request',
    sub: 'Enter your reference number and the phone number you registered, to see your status and what we need from you.',
    ref: 'Reference number',
    phone: 'Phone number',
    submit: 'Show my request',
    notFound: 'We could not find a request with those details. Please check the reference and phone number.',
    blocked: 'Too many attempts. Please try again in %d minutes.',
    missing: 'Please enter both the reference number and the phone number.',
    hint: 'Your reference number was in your confirmation email and begins with SND.',
    haveAccount: 'Have an account?',
    signIn: 'Sign in',
    betterWithAccount: 'With a free account you can follow all your requests in one place and upload documents any time.',
    createAccount: 'Create an account',
  },
};

const tr = (res) => T[res.locals.lang] || T.ar;

router.get('/', (req, res) => {
  res.render('public/track', { error: null, form: {}, T: tr(res) });
});

router.post('/', (req, res) => {
  const t = tr(res);
  const blocked = throttleState(req);
  if (blocked.blocked) {
    return res.render('public/track', {
      error: t.blocked.replace('%d', blocked.minutes),
      form: {},
      T: t,
    });
  }

  const ref = refLib.normalise(req.body.ref);
  const phone = (req.body.phone || '').trim();

  if (!ref || !phone) {
    return res.render('public/track', { error: t.missing, form: { ref, phone }, T: t });
  }

  const request = db.prepare('SELECT * FROM requests WHERE ref = ?').get(ref);

  // One message for a wrong reference and a wrong phone, so the form cannot be
  // used to discover which references exist.
  if (!request || !refLib.phoneMatches(request.phone, phone)) {
    recordFailure(req);
    return res.render('public/track', { error: t.notFound, form: { ref, phone }, T: t });
  }

  // A short-lived pass, so the result page can be reloaded without retyping
  // and links inside it keep working.
  req.session.trackedRequests = req.session.trackedRequests || [];
  if (!req.session.trackedRequests.includes(request.id)) {
    req.session.trackedRequests.push(request.id);
  }

  res.redirect('/track/' + request.id);
});

router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const allowed =
    (req.session.trackedRequests || []).includes(id) ||
    (req.session.client &&
      db.prepare('SELECT 1 FROM requests WHERE id = ? AND client_id = ?').get(id, req.session.client.id));

  if (!allowed) return res.redirect('/track');

  const r = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
  if (!r) return res.redirect('/track');

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

  res.render('public/track_result', { r, requirements, documents, T: tr(res) });
});

module.exports = router;
