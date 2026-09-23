#!/usr/bin/env node
/**
 * Backup system regression suite.
 *
 * Covers three things added on top of the existing manual backup/restore
 * flow: scheduling (computeNextRun's pure math, the settings form, run-now,
 * retention rotation), the office-branch export/archive (an intentionally
 * non-restorable alternative to a branch-level restore, which the schema
 * cannot support safely), and the platform-owner session flag that gates
 * full-scope (cross-tenant) backups — fixed in this same change from being
 * hardcoded false regardless of the actual session.
 *
 *   node backup-test.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createHarness } = require('./test-harness');

const SESSION_SECRET = 'backup-test-secret';
const TENANT_ID = 'test-tenant';
const H = createHarness({ port: 4580, label: 'Backup suite', env: { SESSION_SECRET, TENANT_ID } });
const { check, section, loginStaff, ADMIN, BASE } = H;

(async () => {
  console.log('\x1b[1mSanad — Backup system regression suite\x1b[0m\n');

  // db/index.js opens its sqlite connection at require-time against
  // process.env.DATA_DIR, so nothing that transitively requires it can load
  // before H.start() has spawned demo.js to create and migrate that database.
  await H.start();
  const backupSchedule = require('./lib/backup-schedule');

  // ================================================== 1. pure scheduling math
  section('١. حساب موعد التشغيل القادم (computeNextRun)');

  const mon10am = new Date('2026-01-05T10:00:00'); // a Monday
  const daily9 = backupSchedule.computeNextRun(mon10am, { frequency: 'daily', time: '09:00' });
  check('يومي الساعة 9ص وإحنا بعد الـ9 — يترحّل لبكرة', daily9.getDate() === 6 && daily9.getHours() === 9);

  const daily11 = backupSchedule.computeNextRun(mon10am, { frequency: 'daily', time: '11:00' });
  check('يومي الساعة 11ص وإحنا لسه قبلها — نفس اليوم', daily11.getDate() === 5 && daily11.getHours() === 11);

  const weeklySameDayLater = backupSchedule.computeNextRun(mon10am, { frequency: 'weekly', weekday: '1', time: '11:00' });
  check('أسبوعي يوم الاثنين الساعة 11ص وإحنا الاثنين الساعة 10ص — نفس اليوم', weeklySameDayLater.getDate() === 5);

  const weeklySameDayPast = backupSchedule.computeNextRun(mon10am, { frequency: 'weekly', weekday: '1', time: '09:00' });
  check('أسبوعي يوم الاثنين الساعة 9ص وإحنا الاثنين الساعة 10ص — يترحّل للاثنين اللي بعده', weeklySameDayPast.getDate() === 12);

  const weeklyOtherDay = backupSchedule.computeNextRun(mon10am, { frequency: 'weekly', weekday: '4', time: '09:00' }); // Thursday
  check('أسبوعي يوم الخميس — بيوقع يوم 8', weeklyOtherDay.getDate() === 8);

  // ================================================== 2. retention rotation (no server needed)
  section('٢. الاحتفاظ بعدد محدود من النسخ المجدولة (applyRetention)');
  fs.rmSync(backupSchedule.SCHEDULED_DIR, { recursive: true, force: true });
  fs.mkdirSync(backupSchedule.SCHEDULED_DIR, { recursive: true });
  try {
    ['a', 'b', 'c', 'd', 'e'].forEach((name, i) => {
      fs.writeFileSync(path.join(backupSchedule.SCHEDULED_DIR, `sanad-office-backup-${name}.zip`), 'x');
      fs.utimesSync(path.join(backupSchedule.SCHEDULED_DIR, `sanad-office-backup-${name}.zip`), new Date(2026, 0, i + 1), new Date(2026, 0, i + 1));
    });
    backupSchedule.applyRetention(2);
    const left = fs.readdirSync(backupSchedule.SCHEDULED_DIR).sort();
    check('من 5 نسخ مع الاحتفاظ بـ 2 — اتبقى 2 بالظبط', left.length === 2, JSON.stringify(left));
    check('اللي اتبقوا هما الأحدث (d, e)', left.includes('sanad-office-backup-d.zip') && left.includes('sanad-office-backup-e.zip'), JSON.stringify(left));
  } finally {
    fs.rmSync(backupSchedule.SCHEDULED_DIR, { recursive: true, force: true });
  }

  try {
    const adamLogin = await loginStaff('adam', '1234');
    check('تسجيل دخول أدم نجح', adamLogin.status === 302, `status=${adamLogin.status}`);
    const adam = adamLogin.client;

    // ================================================== 3. scheduling: save + run-now over HTTP
    section('٣. حفظ الجدولة وتشغيلها يدويًا عبر الإعدادات');
    fs.rmSync(backupSchedule.SCHEDULED_DIR, { recursive: true, force: true });

    const csrfSave = await adam.token(`${ADMIN}/settings?tab=backup`);
    const saveResp = await adam.post(`${ADMIN}/settings/backup-schedule`, {
      body: {
        _csrf: csrfSave, backup_schedule_enabled: '1', backup_schedule_frequency: 'daily',
        backup_schedule_weekday: '0', backup_schedule_time: '03:30', backup_schedule_retention: '3',
      },
    });
    check('حفظ إعدادات الجدولة بينجح (302)', saveResp.status === 302, `status=${saveResp.status}`);

    const afterSave = backupSchedule.status();
    check('الجدولة اتسجلت مفعّلة', afterSave.enabled === true);
    check('الميعاد والاحتفاظ اتسجلوا صح', afterSave.time === '03:30' && afterSave.retention === 3);
    check('في ميعاد تشغيل قادم محسوب', !!afterSave.nextRunAt);

    const csrfRun = await adam.token(`${ADMIN}/settings?tab=backup`);
    const runResp = await adam.post(`${ADMIN}/settings/backup-schedule/run`, { body: { _csrf: csrfRun } });
    check('تشغيل النسخة الاحتياطية يدويًا بينجح (302)', runResp.status === 302, `status=${runResp.status}`);
    check('الرجوع فيه إشارة نجاح', (runResp.location || '').includes('backup_run=ok'), runResp.location);

    const files = fs.existsSync(backupSchedule.SCHEDULED_DIR) ? fs.readdirSync(backupSchedule.SCHEDULED_DIR) : [];
    check('اتحفظت نسخة زيب فعلية في مجلد الجدولة', files.some((f) => f.endsWith('.zip')), JSON.stringify(files));

    const afterRun = backupSchedule.status();
    check('حالة آخر تشغيل اتسجلت ناجحة', afterRun.lastRunStatus === 'ok');
    check('توقيت آخر تشغيل اتسجل', !!afterRun.lastRunAt);

    // turn scheduling back off so the harness process exits cleanly without a live timer
    const csrfOff = await adam.token(`${ADMIN}/settings?tab=backup`);
    await adam.post(`${ADMIN}/settings/backup-schedule`, {
      body: { _csrf: csrfOff, backup_schedule_frequency: 'daily', backup_schedule_weekday: '0', backup_schedule_time: '03:30', backup_schedule_retention: '3' },
    });
    check('إيقاف الجدولة بعد الاختبار', backupSchedule.status().enabled === false);

    // ================================================== 4. branch archive
    section('٤. أرشيف بيانات الفرع (تصدير، مش استعادة)');
    const mainBranch = require('./db').db.prepare("SELECT id FROM office_branches WHERE is_main=1").get();

    const archiveResp = await adam.get(`${ADMIN}/settings/backup/branch/${mainBranch.id}`);
    check('تنزيل أرشيف الفرع الرئيسي بينجح (200)', archiveResp.status === 200, `status=${archiveResp.status}`);
    check('نوع الملف زيب', (archiveResp.headers.get('content-type') || '').includes('zip'));

    const missingResp = await adam.get(`${ADMIN}/settings/backup/branch/999999`);
    check('أرشيف فرع مش موجود بيرجّع 404', missingResp.status === 404, `status=${missingResp.status}`);

    // A request explicitly tagged to the main branch proves the archive's
    // own SQL actually pulls real rows, not just an empty, well-formed zip.
    const dbLib = require('./db');
    const taggedRequest = dbLib.db.prepare('SELECT id FROM requests LIMIT 1').get();
    dbLib.db.prepare('UPDATE requests SET office_branch_id = ? WHERE id = ?').run(mainBranch.id, taggedRequest.id);

    const branchArchive = require('./lib/branch-archive');
    const built = await branchArchive.createBranchArchive(mainBranch.id);
    check('الأرشيف بعد ربط طلب بالفرع فيه الطلب فعلًا', built.manifest.counts.requests >= 1, JSON.stringify(built.manifest.counts));
    check('المانفست موسوم إنه تصدير مش نسخة قابلة للاستعادة', built.manifest.kind === 'export');
    built.cleanup();

    // ================================================== 5. platform-owner session flag now reflects the real flag
    section('٥. علم مالك سند بيعكس الجلسة الحقيقية بدل ما يكون ثابت false');

    // Without the one-time platform-owner token, an ordinary tenant admin
    // must never reach the full (cross-tenant) backup scope.
    const fullDenied = await adam.get(`${ADMIN}/settings/backup/full`);
    check('أدمن عادي من غير جلسة مالك سند ممنوع من النسخة الكاملة — 403', fullDenied.status === 403, `status=${fullDenied.status}`);

    const backupTabBefore = await adam.get(`${ADMIN}/settings?tab=backup`);
    check('قبل دخول مالك سند: زر النسخة الكاملة مش ظاهر', !backupTabBefore.text.includes('تنزيل النسخة الكاملة للمنصة'));

    const nonce = crypto.randomBytes(8).toString('hex');
    const payload = { tenant_id: TENANT_ID, exp: Date.now() + 60000, nonce, to: 'imports' };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
    const token = `${payloadB64}.${sig}`;

    const owner = H.makeClient();
    const ownerEntry = await owner.get(`/platform-owner-access?token=${token}`);
    check('دخول مالك سند بتوكن صحيح بينجح (302 لصفحة الاستيراد)', ownerEntry.status === 302, `status=${ownerEntry.status} loc=${ownerEntry.location}`);

    const backupTabAfter = await owner.get(`${ADMIN}/settings?tab=backup`);
    check('بعد دخول مالك سند: زر النسخة الكاملة ظاهر دلوقتي', backupTabAfter.text.includes('تنزيل النسخة الكاملة للمنصة'));

    const fullAllowed = await owner.get(`${ADMIN}/settings/backup/full`);
    check('مالك سند بجلسته الحقيقية يقدر ينزّل النسخة الكاملة — 200', fullAllowed.status === 200, `status=${fullAllowed.status}`);

    // The same one-time token cannot be replayed — the nonce is spent.
    const replay = await H.makeClient().get(`/platform-owner-access?token=${token}`);
    check('نفس رمز الدخول ما بيشتغلش تاني — استخدام واحد بس', replay.status === 403, `status=${replay.status}`);

    section('سلامة السيرفر');
    check('مفيش أخطاء في السيرفر', !/Error|error:/i.test(H.state.serverOutput), H.state.serverOutput.slice(0, 300));
  } catch (err) {
    H.state.fail += 1;
    H.state.failures.push('استثناء غير متوقع: ' + err.message);
    console.error('\n\x1b[31mERROR:\x1b[0m', err);
  } finally {
    fs.rmSync(backupSchedule.SCHEDULED_DIR, { recursive: true, force: true });
    H.stop();
  }

  const failCount = H.report();
  process.exit(failCount ? 1 : 0);
})();
