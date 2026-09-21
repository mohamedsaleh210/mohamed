const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { db, UPLOAD_DIR } = require('../../db');
const audit = require('../../lib/audit');
const me = (req) => req.session.user.display_name || req.session.user.username;
const pw = require('../../lib/password');
const profile = require('../../lib/profile');
const images = require('../../lib/images');
const csrf = require('../../lib/csrf');

const router = express.Router();

// Profile photos are small and go through the same private uploads folder as
// everything else — nothing user-supplied is ever served straight from disk.
const staffImages = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) =>
      cb(null, `${file.fieldname}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.jpg`),
  }),
  limits: { fileSize: 12 * 1024 * 1024, files: 3 },
  fileFilter: (req, file, cb) =>
    /^image\//i.test(file.mimetype)
      ? cb(null, true)
      : cb(new Error('الصورة لازم تكون ملف صورة')),
});

const meRow = (req) => db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);

// ---------------------------------------------------------------- profile
router.get('/profile', (req, res) => {
  const user = meRow(req);
  res.render('admin/profile', {
    me: user,
    missing: profile.missingFields(user),
    idRequired: profile.idCardRequired(),
    labels: profile.LABELS,
    force: req.query.force === '1' || !profile.isComplete(user),
    error: req.query.err ? decodeURIComponent(req.query.err) : null,
    saved: req.query.saved === '1',
    msg: req.query.msg || null,
  });
});

router.post(
  '/profile',
  (req, res, next) => {
    staffImages.fields([
      { name: 'photo', maxCount: 1 },
      { name: 'id_front', maxCount: 1 },
      { name: 'id_back', maxCount: 1 },
    ])(req, res, (err) => {
      if (err) {
        return res.redirect(
          `${req.adminPath}/account/profile?err=${encodeURIComponent(
            err.code === 'LIMIT_FILE_SIZE' ? 'الصورة أكبر من ٨ ميجا.' : err.message
          )}`
        );
      }
      next();
    });
  },
  csrf.verifyDeferred,
  async (req, res) => {
    const user = meRow(req);
    const fail = (msg) =>
      res.redirect(`${req.adminPath}/account/profile?err=${encodeURIComponent(msg)}`);

    const checked = profile.validate(req.body);
    if (checked.error) return fail(checked.error);

    const v = checked.values;
    if (profile.emailTaken(v.email, user.id)) return fail('البريد الإلكتروني ده مستخدم لحساب تاني.');

    // Each image is processed the same way and replaces the previous one,
    // deleting what it supersedes so old copies of an ID card do not linger.
    const takeImage = async (field, currentName) => {
      const file = req.files && req.files[field] && req.files[field][0];
      if (!file) return currentName;

      await images.normaliseImage(path.join(UPLOAD_DIR, file.filename), {
        mime: file.mimetype,
        originalName: file.originalname,
      });

      if (currentName && currentName !== file.filename) {
        const old = path.join(UPLOAD_DIR, currentName);
        if (old.startsWith(UPLOAD_DIR) && fs.existsSync(old)) {
          try {
            fs.unlinkSync(old);
          } catch (_) {
            /* an orphaned image is not worth failing the save over */
          }
        }
      }
      return file.filename;
    };

    const photoName = await takeImage('photo', user.photo);
    const idFront = await takeImage('id_front', user.id_front);
    const idBack = await takeImage('id_back', user.id_back);

    if (profile.idCardRequired() && (!idFront || !idBack)) {
      return fail('صوّر البطاقة من الوجهين — الوجه والظهر.');
    }

    db.prepare(
      `UPDATE users SET legal_name = ?, display_name = ?, email = ?, phone = ?,
                        national_id = ?, birth_date = ?, photo = ?, id_front = ?, id_back = ?,
                        profile_completed = 1
       WHERE id = ?`
    ).run(v.legal_name, v.display_name, v.email, v.phone, v.national_id, v.birth_date,
          photoName, idFront, idBack, user.id);

    req.session.user.photo = photoName;
    req.session.user.display_name = v.display_name;

    const changed = [];
    if (user.legal_name !== v.legal_name) changed.push('الاسم الرسمي');
    if (user.display_name !== v.display_name) changed.push('الاسم المختصر');
    if (user.email !== v.email) changed.push('البريد الإلكتروني');
    if (user.phone !== v.phone) changed.push('الموبايل');
    if (user.national_id !== v.national_id) changed.push('الرقم القومي');
    if (user.birth_date !== v.birth_date) changed.push('تاريخ الميلاد');
    if (req.files && req.files.photo) changed.push('الصورة الشخصية');
    if (req.files && req.files.id_front) changed.push('صورة البطاقة (وجه)');
    if (req.files && req.files.id_back) changed.push('صورة البطاقة (ظهر)');

    audit.log(req, 'user.profile', {
      type: 'user',
      id: user.id,
      label: user.display_name || user.username,
      details: changed.length ? `حدّث بياناته: ${changed.join('، ')}` : 'حفظ بياناته',
    });

    res.redirect(`${req.adminPath}/account/profile?saved=1`);
  }
);

// ---------------------------------------------------------------- avatar
/**
 * Serves a staff photo. Behind the panel's own auth, so avatars are not a way
 * to enumerate who works here.
 */
/**
 * ID card images, admins only.
 *
 * An avatar is a face; an ID card is a national number and an address. They do
 * not belong behind the same door.
 */
router.get('/id-card/:id/:side', (req, res) => {
  if (req.session.user.role !== 'admin' && String(req.session.user.id) !== req.params.id) {
    return res.status(403).end();
  }

  const side = req.params.side === 'back' ? 'id_back' : 'id_front';
  const row = db.prepare(`SELECT ${side} AS img FROM users WHERE id = ?`).get(req.params.id);
  if (!row || !row.img) return res.status(404).end();

  const full = path.join(UPLOAD_DIR, path.basename(row.img));
  if (!full.startsWith(UPLOAD_DIR) || !fs.existsSync(full)) return res.status(404).end();

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, no-store');
  fs.createReadStream(full).pipe(res);
});

router.get('/avatar/:id', (req, res) => {
  const row = db.prepare('SELECT photo FROM users WHERE id = ?').get(req.params.id);
  if (!row || !row.photo) return res.status(404).end();

  const full = path.join(UPLOAD_DIR, path.basename(row.photo));
  if (!full.startsWith(UPLOAD_DIR) || !fs.existsSync(full)) return res.status(404).end();

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=600');
  fs.createReadStream(full).pipe(res);
});

// ---------------------------------------------------------------- password
router.get('/', (req, res) => {
  const user = meRow(req);
  res.locals.user = { ...req.session.user, email: user.email };

  res.render('admin/account', {
    me: user,
    msg: req.query.msg,
    err: req.query.err ? decodeURIComponent(req.query.err) : null,
    force: req.query.force === '1' || req.session.user.must_change_password,
    minPassword: pw.MIN_LENGTH,
    rules: pw.describe('ar'),
  });
});

router.post('/password', (req, res) => {
  const user = meRow(req);
  const current = req.body.current || '';
  const next = req.body.next || '';
  const confirm = req.body.confirm || '';

  if (!bcrypt.compareSync(current, user.password_hash))
    return res.redirect(req.adminPath + '/account?msg=wrong');
  if (next !== confirm) return res.redirect(req.adminPath + '/account?msg=mismatch');
  if (next === current) return res.redirect(req.adminPath + '/account?msg=same');

  const problem = pw.firstMessage(next, { lang: 'ar', username: user.username });
  if (problem) {
    return res.redirect(`${req.adminPath}/account?err=${encodeURIComponent(problem)}`);
  }

  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(
    bcrypt.hashSync(next, 10),
    user.id
  );

  // Changing a password must end every other session for that account —
  // otherwise whoever knew the old one stays signed in.
  db.prepare('DELETE FROM sessions WHERE data LIKE ? AND sid != ?').run(
    `%"id":${user.id},%`,
    req.sessionID
  );

  req.session.user.must_change_password = false;
  audit.log(req, 'user.change_password', {
    type: 'user',
    id: user.id,
    label: user.display_name || user.username,
    details: 'غيّر كلمة السر بنفسه',
  });

  res.redirect(req.adminPath + '/account?msg=ok');
});

/**
 * "Do not assign me new work."
 *
 * A person on leave, travelling, or simply at capacity should be able to say so
 * without going through an admin — they are the one who knows. Supervisors can
 * set it for someone else, because somebody has to be able to close it when the
 * person is unreachable.
 *
 * The reason is required: a colleague looking at the assignment list needs to
 * know whether to wait a day or reassign the file. An open-ended lock is fine;
 * a silent one is not.
 */
router.post('/assign-lock', (req, res) => {
  const targetId = parseInt(req.body.user_id, 10) || req.session.user.id;
  const self = targetId === req.session.user.id;

  // Anyone may lock themselves; locking someone else needs the assign ability.
  if (!self && !req.userCan('requests.assign')) {
    return res.status(403).render('admin/denied');
  }

  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).render('errors/404');

  const back = req.body.next || `${req.adminPath}/account/profile`;
  const turningOn = !!req.body.lock;

  if (!turningOn) {
    db.prepare(
      `UPDATE users SET assign_locked = 0, assign_lock_reason = NULL,
                        assign_lock_until = NULL, assign_lock_by = NULL, assign_lock_at = NULL
       WHERE id = ?`
    ).run(target.id);

    audit.log(req, 'user.assign_unlock', {
      type: 'user',
      id: target.id,
      label: target.display_name || target.username,
      details: self ? 'فتح التعيين على نفسه' : `فتح التعيين على ${target.display_name}`,
    });

    return res.redirect(`${back}?msg=assign_open`);
  }

  const reason = (req.body.reason || '').trim();
  if (reason.length < 3) return res.redirect(`${back}?msg=need_lock_reason`);

  const until = (req.body.until || '').trim();
  const validUntil = /^\d{4}-\d{2}-\d{2}$/.test(until) ? until : null;

  db.prepare(
    `UPDATE users SET assign_locked = 1, assign_lock_reason = ?, assign_lock_until = ?,
                      assign_lock_by = ?, assign_lock_at = datetime('now')
     WHERE id = ?`
  ).run(reason.slice(0, 200), validUntil, me(req), target.id);

  audit.log(req, 'user.assign_lock', {
    type: 'user',
    id: target.id,
    label: target.display_name || target.username,
    details: `قفل التعيين${self ? ' على نفسه' : ` على ${target.display_name}`} — ${reason}` +
      (validUntil ? ` (لحد ${validUntil})` : ' (مفتوح)'),
  });

  res.redirect(`${back}?msg=assign_locked`);
});

module.exports = router;
