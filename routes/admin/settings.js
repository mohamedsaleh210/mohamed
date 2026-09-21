const express = require('express');
const fs = require('fs');
const path = require('path');
const { db, getSetting, setSetting, getBool } = require('../../db');
const audit = require('../../lib/audit');
const notify = require('../../lib/notify');
const mailer = require('../../lib/mailer');
const purge = require('../../lib/purge');
const emails = require('../../lib/emails');
const { can } = require('../../middleware/auth');
const multer = require('multer');
const backup = require('../../lib/backup');

const router = express.Router();
router.use(can('settings.manage'));
const restoreDir = path.join(process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data'), 'restore-incoming');
fs.mkdirSync(restoreDir, { recursive: true });
const restoreUpload = multer({
  dest: restoreDir,
  limits: { fileSize: 1024 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, /\.zip$/i.test(file.originalname || '')),
});

// Keys the settings form owns. Anything not listed here cannot be written
// through this page, so a crafted form post cannot reach unrelated settings.
const TEXT_KEYS = [
  'site_name_ar',
  'site_name_en',
  'tagline_ar',
  'tagline_en',
  'whatsapp',
  'currency',
  'site_domain',
  'mail_provider',
  'mail_from_name',
  'mail_from_email',
  'mail_reply_to',
  'office_emails',
  'google_client_id',
];

const BOOL_KEYS = ['notify_email_enabled', 'scope_services_by_page'];

/**
 * Credentials that are written but never read back.
 *
 * A settings page that renders a secret is a page that leaks it — into the
 * HTML, into the browser cache, into a screen share. The admin who set it has
 * it at the provider; the app only needs to know whether one exists.
 */
const SECRET_KEYS = ['google_client_secret', 'mail_api_key'];

router.get('/', (req, res) => {
  const s = {};
  TEXT_KEYS.forEach((k) => (s[k] = getSetting(k, '')));
  BOOL_KEYS.forEach((k) => (s[k] = getBool(k, false)));

  // Present as a yes/no, never as the value itself.
  SECRET_KEYS.forEach((k) => (s[k + '_set'] = !!(getSetting(k, '') || '').trim()));

  res.render('admin/settings', {
    s,
    saved: req.query.saved,
    tab: req.query.tab || 'site',
    staffIdRequired: getSetting('staff_id_required', '1') === '1',
    googleOn: require('../../lib/google').isEnabled(),
    googleRedirect: require('../../lib/google').redirectUri(req),
    googleClientId: getSetting('google_client_id', ''),
    googleSecretSet: !!(getSetting('google_client_secret', '') || '').trim(),
    storage: purge.storageUsage(),
    purgeWindow: purge.MIN_DAYS,
    purgeCandidates: req.query.tab === 'files' ? purge.candidates(req.query.days) : null,
    humanSize: purge.humanSize,
    purged: req.query.purged ? parseInt(req.query.purged, 10) : null,
    freed: req.query.freed || null,
    mailProvider: mailer.currentProvider(),
    mailLive: mailer.isLive(),
    mailLog: mailer.recentLog(25),
    mailFailed: mailer.pendingCount(),
    outboxPath: mailer.OUTBOX,
    testResult: req.query.test || null,
    testError: req.query.terr ? decodeURIComponent(req.query.terr) : null,
    restorePending: fs.existsSync(backup.PENDING_FILE),
    officeBranches: db.prepare('SELECT * FROM office_branches ORDER BY is_main DESC,name').all(),
  });
});

router.post('/office-branches', (req,res)=>{
  const name=String(req.body.name||'').trim(),code=String(req.body.code||'').trim().toUpperCase();
  if(name.length<2)return res.redirect(req.adminPath+'/settings?tab=branches&branch_error=name');
  try{
    const info=db.prepare('INSERT INTO office_branches(name,code,active,is_main) VALUES(?,?,1,0)').run(name,code||null);
    audit.log(req,'office_branch.create',{type:'office_branch',id:Number(info.lastInsertRowid),label:name,details:`إضافة فرع مكتب: ${name}`});
    res.redirect(req.adminPath+'/settings?tab=branches&saved=1');
  }catch(_){res.redirect(req.adminPath+'/settings?tab=branches&branch_error=duplicate')}
});

router.post('/office-branches/:id/toggle',(req,res)=>{
  const row=db.prepare('SELECT * FROM office_branches WHERE id=?').get(Number(req.params.id));
  if(!row||row.is_main)return res.redirect(req.adminPath+'/settings?tab=branches&branch_error=main');
  const active=row.active?0:1;db.prepare('UPDATE office_branches SET active=? WHERE id=?').run(active,row.id);
  audit.log(req,'office_branch.status',{type:'office_branch',id:row.id,label:row.name,details:`${active?'تفعيل':'إيقاف'} فرع المكتب: ${row.name}`});
  res.redirect(req.adminPath+'/settings?tab=branches&saved=1');
});

router.get('/backup/:scope', async (req, res, next) => {
  const scope = req.params.scope === 'full' ? 'full' : 'office';
  if (scope === 'full') return res.sendStatus(403);
  let result;
  try {
    result = await backup.createBackup(scope);
    audit.log(req, 'backup.download', { type: 'settings', details: scope === 'full' ? 'أنشأ نسخة احتياطية كاملة للمنصة والمكاتب' : 'أنشأ نسخة احتياطية كاملة للمكتب وملفاته' });
    res.download(result.path, path.basename(result.path), error => { result.cleanup(); if (error && !res.headersSent) next(error); });
  } catch (error) {
    if (result) result.cleanup();
    next(error);
  }
});

router.post('/restore', restoreUpload.single('backup_file'), async (req, res) => {
  const back = `${req.adminPath}/settings?tab=backup`;
  const uploaded = req.file && req.file.path;
  try {
    if (!uploaded) return res.redirect(`${back}&backup_error=file`);
    if (String(req.body.confirm || '').trim() !== 'استعادة') return res.redirect(`${back}&backup_error=confirm`);
    const reason = String(req.body.reason || '').trim();
    if (reason.length < 5) return res.redirect(`${back}&backup_error=reason`);
    const manifest = await backup.scheduleRestore(uploaded, false);
    audit.log(req, 'backup.restore_scheduled', { type: 'settings', details: `فحص وجدول استعادة نسخة ${manifest.scope}. السبب: ${reason.slice(0, 200)}` });
    return res.redirect(`${back}&restore_ready=1`);
  } catch (error) {
    console.error('backup restore rejected:', error.message);
    return res.redirect(`${back}&backup_error=invalid`);
  } finally {
    if (uploaded) try { fs.unlinkSync(uploaded); } catch (_) { /* already absent */ }
  }
});

router.post('/', (req, res) => {
  // Secrets are write-only: an empty box means the admin did not retype it,
  // not that they want sending switched off.
  SECRET_KEYS.forEach((k) => {
    const value = (req.body[k] || '').trim();
    if (value) setSetting(k, value);
  });

  const tab = req.body._tab || 'site';
  const changed = [];

  TEXT_KEYS.forEach((k) => {
    if (!(k in req.body)) return; // only touch fields the submitted tab contains
    const next = (req.body[k] || '').trim();
    if (getSetting(k, '') !== next) changed.push(k);
    setSetting(k, next);
  });

  BOOL_KEYS.forEach((k) => {
    if (!(`_has_${k}` in req.body)) return;
    const next = req.body[k] ? '1' : '0';
    if (getSetting(k, '0') !== next) changed.push(k);
    setSetting(k, next);
  });

  if (changed.length) {
    // Never write a secret into the audit trail — record that it changed only.
    const safe = changed.map((k) =>
      /api_key|client_secret/.test(k) ? `${k} (قيمة سرية)` : k
    );
    audit.log(req, 'settings.update', {
      type: 'settings',
      details: `عدّل: ${safe.join('، ')}`,
    });
  }

  res.redirect(`${req.adminPath}/settings?tab=${encodeURIComponent(tab)}&saved=1`);
});

/**
 * Proves the configuration end to end. With no provider key this still
 * succeeds — the message lands in the on-disk outbox — so the templates and
 * links can be checked long before the office has an account.
 */
/** Whether staff must photograph their ID card, which some offices skip. */
/**
 * Google credentials.
 *
 * The secret is only ever written, never sent back to the browser — an admin
 * who wants to check it has it in the Google console, and a page that renders
 * it is a page that can leak it.
 */
router.post('/google', (req, res) => {
  const id = (req.body.google_client_id || '').trim();
  const secret = (req.body.google_client_secret || '').trim();

  setSetting('google_client_id', id);
  // An empty field means "leave it alone", not "clear it" — otherwise saving
  // the page for any other reason would silently switch sign-in off.
  if (secret) setSetting('google_client_secret', secret);
  if (req.body.clear_secret === '1') setSetting('google_client_secret', '');

  audit.log(req, 'settings.update', {
    type: 'settings',
    details: id
      ? 'حدّث بيانات الدخول بحساب Google'
      : 'ألغى الدخول بحساب Google',
  });

  res.redirect(req.adminPath + '/settings?tab=google&saved=1');
});

router.post('/staff', (req, res) => {
  const required = req.body.staff_id_required ? '1' : '0';
  setSetting('staff_id_required', required);

  audit.log(req, 'settings.update', {
    type: 'settings',
    details: required === '1'
      ? 'فعّل طلب صورة البطاقة من الموظفين'
      : 'ألغى طلب صورة البطاقة من الموظفين',
  });
  res.redirect(req.adminPath + '/settings?tab=staff&saved=1');
});

/**
 * Deletes old client documents.
 *
 * Requires an explicit confirmation phrase rather than a checkbox: this is not
 * undoable, and a misclick would destroy paperwork the office cannot get back.
 */
router.post('/purge-files', (req, res) => {
  if ((req.body.confirm || '').trim() !== 'احذف') {
    return res.redirect(req.adminPath + '/settings?tab=files&err=confirm');
  }

  /*
   * A reason, like every other irreversible action.
   *
   * This erased client documents from disk with nothing recorded but a count.
   * Months later a client asks for their contract back and the office has no
   * way to tell whether it was cleared under a retention policy, cleared to
   * free space, or cleared by mistake — and no way to say who decided.
   */
  const reason = (req.body.reason || '').trim();
  if (reason.length < 5) {
    return res.redirect(req.adminPath + '/settings?tab=files&err=purge_reason');
  }

  const days = Math.max(purge.MIN_DAYS, parseInt(req.body.days, 10) || purge.MIN_DAYS);
  const ids = Array.isArray(req.body.request_ids)
    ? req.body.request_ids
    : req.body.request_ids
      ? [req.body.request_ids]
      : null;

  const result = purge.purge({
    days,
    requestIds: ids,
    by: req.session.user.display_name || req.session.user.username,
  });

  notify.notifyAdmins({
    type: 'erased',
    byUserId: req.session.user.id,
    text:
      `🗑 ${req.session.user.display_name || req.session.user.username} مسح ` +
      `${result.removed} ملف من ${result.requests} طلب مقفول ` +
      `(${purge.humanSize(result.freed)}). السبب: ${reason.slice(0, 90)}`,
  });

  audit.log(req, 'files.purge', {
    type: 'settings',
    details:
      `حذف ${result.removed} ملف من ${result.requests} طلب مقفول — ` +
      `وفّر ${purge.humanSize(result.freed)}. السبب: ${reason.slice(0, 200)}`,
  });

  res.redirect(
    `${req.adminPath}/settings?tab=files&purged=${result.removed}&freed=${encodeURIComponent(purge.humanSize(result.freed))}`
  );
});

router.post('/test-email', async (req, res) => {
  const to = (req.body.to || '').trim();
  if (!to) return res.redirect(req.adminPath + '/settings?tab=mail&test=noaddr');

  const result = await mailer.sendNow(emails.testEmail(to));

  audit.log(req, 'settings.test_email', {
    type: 'settings',
    details: `أرسل رسالة تجريبية إلى ${to} (${result.provider}) — ${result.ok ? 'نجحت' : 'فشلت'}`,
  });

  if (result.ok) {
    const kind = result.provider === 'outbox' ? 'outbox' : 'sent';
    return res.redirect(`${req.adminPath}/settings?tab=mail&test=${kind}`);
  }
  res.redirect(
    `${req.adminPath}/settings?tab=mail&test=failed&terr=${encodeURIComponent(result.error || '')}`
  );
});

/**
 * Renders a message from the on-disk outbox.
 *
 * The outbox lives outside the web root on purpose — these are real messages
 * to real clients. This route is the only way in, and only for an admin.
 *
 * Served inside a sandbox so the preview cannot run scripts or make requests
 * even if a template ever emitted something it should not have.
 */
router.get('/mail/:id/view', (req, res) => {
  const row = db.prepare('SELECT * FROM mail_log WHERE id = ?').get(req.params.id);
  if (!row || !row.outbox_file) return res.status(404).render('errors/404');

  // The stored name is ours, but never trust a filename with a path in it.
  const safeName = path.basename(row.outbox_file);
  const full = path.join(mailer.OUTBOX, safeName);
  if (!full.startsWith(mailer.OUTBOX) || !fs.existsSync(full)) {
    return res.status(404).render('errors/404');
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader(
    'Content-Security-Policy',
    "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(fs.readFileSync(full, 'utf8'));
});

module.exports = router;
