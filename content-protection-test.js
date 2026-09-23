#!/usr/bin/env node
/**
 * Public content-protection regression suite (12A).
 *
 * Covers: the office-wide toggles actually gate what's sent to the browser,
 * the deterrence markup only ever reaches the public marketing pages (never
 * the admin panel, the client portal, or a page with a form), the watermark
 * carries the configured text, the feature has its own catalogue permission
 * distinct from the general settings.manage gate, and none of this weakens
 * the private-file authorization or security headers that were already in
 * place.
 *
 *   node content-protection-test.js
 */
const { createHarness } = require('./test-harness');

const H = createHarness({ port: 4590, label: 'Content protection suite' });
const { check, section, loginStaff, loginClient, ADMIN } = H;

(async () => {
  console.log('\x1b[1mSanad — public content-protection suite\x1b[0m\n');
  await H.start();

  try {
    const adamLogin = await loginStaff('adam', '1234');
    check('تسجيل دخول السوبر أدمن نجح', adamLogin.status === 302, `status=${adamLogin.status}`);
    const adam = adamLogin.client;

    // ================================================== 1. off by default
    section('١. الحماية متوقفة افتراضيًا');
    const homeBefore = await fetch('http://127.0.0.1:4590/').then((r) => r.text());
    check('الصفحة الرئيسية من غير رابط CSS الحماية قبل التفعيل', !homeBefore.includes('content-protection.css'));
    check('الصفحة الرئيسية من غير سكريبت الحماية قبل التفعيل', !homeBefore.includes('content-protection.js'));

    // ================================================== 2. save settings via the real form/route
    section('٢. حفظ إعدادات الحماية عبر الإعدادات');
    const csrfProt = await adam.token(`${ADMIN}/settings?tab=protection`);
    const saveResp = await adam.post(`${ADMIN}/settings/content-protection`, {
      body: {
        _csrf: csrfProt,
        content_protection_enabled: '1',
        content_protection_block_select: '1',
        content_protection_block_drag: '1',
        content_protection_block_contextmenu: '1',
        content_protection_watermark_enabled: '1',
        content_protection_watermark_text: 'Sanad | سند — تجربة',
        content_protection_watermark_opacity: '12',
      },
    });
    check('حفظ الإعدادات بينجح (302)', saveResp.status === 302, `status=${saveResp.status}`);
    const settingsPage = await adam.get(`${ADMIN}/settings?tab=protection`);
    check('الشيك بوكس "حماية المحتوى العام" اتسجل مفعّل', /name="content_protection_enabled"[^>]*checked/.test(settingsPage.text));
    check('نص العلامة المائية المحفوظ بيظهر في الفورم', settingsPage.text.includes('Sanad | سند — تجربة'));

    // ================================================== 3. public informational pages get the markup
    section('٣. صفحات الموقع العام المعلوماتية بتاخد علامة الحماية');
    const publicPages = ['/', '/about', '/services', '/faq', '/guides'];
    for (const url of publicPages) {
      const body = await fetch('http://127.0.0.1:4590' + url).then((r) => r.text());
      check(`${url}: فيها رابط content-protection.css`, body.includes('content-protection.css'));
      check(`${url}: فيها كلاس protected-content`, body.includes('protected-content'));
      check(`${url}: مفيش حظر على الفورمات جوّاها (fields مسموحة)`, !/protected-content[^>]*cp-select-off[^>]*>[\s\S]*<input[^>]*disabled/.test(body));
    }

    // ================================================== 4. a page with a form is never wrapped
    section('٤. صفحة فيها فورم (تواصل معنا) ما بتاخدش كلاس الحماية');
    const contactBody = await fetch('http://127.0.0.1:4590/contact').then((r) => r.text());
    check('صفحة /contact من غير كلاس protected-content', !contactBody.includes('protected-content'));

    // ================================================== 5. admin panel never gets it, regardless
    section('٥. لوحة الإدارة ما بتوصلهاش الحماية أبدًا');
    const dashboardBody = await adam.get(`${ADMIN}`);
    check('لوحة التحكم من غير رابط content-protection.css', !dashboardBody.text.includes('content-protection.css'));
    check('لوحة التحكم من غير سكريبت content-protection.js', !dashboardBody.text.includes('content-protection.js'));

    // ================================================== 6. client portal never gets it, regardless
    section('٦. بوابة العملاء ما بتوصلهاش الحماية أبدًا');
    const portalLoginBody = await fetch('http://127.0.0.1:4590/portal/login').then((r) => r.text());
    check('صفحة دخول العملاء من غير رابط content-protection.css', !portalLoginBody.includes('content-protection.css'));
    const clientLogin = await loginClient('client@demo.sanad', 'demo1234');
    if (clientLogin.status === 302) {
      const portalHome = await clientLogin.client.get('/portal');
      check('صفحة طلبات العميل من غير رابط الحماية', !portalHome.text.includes('content-protection.css'));
    } else {
      check('تسجيل دخول العميل التجريبي نجح (لازم عشان يتفحص /portal)', false, `status=${clientLogin.status}`);
    }

    // ================================================== 7. watermark carries the configured text
    section('٧. العلامة المائية بتحمل النص المُعدّ');
    const homeAfter = await fetch('http://127.0.0.1:4590/').then((r) => r.text());
    check('كلاس cp-watermark-on موجود على صورة الغلاف', homeAfter.includes('cp-watermark-on'));
    check('الـ SVG بتاع العلامة المائية فيه النص (مُرمّز URI)', homeAfter.includes(encodeURIComponent('Sanad | سند — تجربة')));

    // ================================================== 8. permission is real and distinct from settings.manage
    section('٨. صلاحية حماية المحتوى صلاحية حقيقية مستقلة');
    const csrfNewAdmin = await adam.token(`${ADMIN}/users`);
    const newAdminResp = await adam.post(`${ADMIN}/users/new`, {
      body: { _csrf: csrfNewAdmin, username: 'cpadmin', password: 'Sanad@2026', password_confirm: 'Sanad@2026', role: 'admin' },
    });
    check('إنشاء أدمن عادي جديد بينجح', newAdminResp.status === 302, `status=${newAdminResp.status}`);

    const db = new (require('better-sqlite3'))(require('path').join(H.DATA_DIR, 'sanad.db'));
    const newAdminId = db.prepare("SELECT id FROM users WHERE username='cpadmin'").get().id;
    // Skip the forced password-change gate — irrelevant to what this section
    // tests and would otherwise redirect every request here to /account.
    db.prepare('UPDATE users SET must_change_password=0 WHERE id=?').run(newAdminId);
    db.prepare("INSERT INTO user_permissions (user_id, permission, granted, reason, set_by, created_at) VALUES (?,?,0,?,?,datetime('now'))")
      .run(newAdminId, 'content_protection.manage', 'اختبار: نزع صلاحية حماية المحتوى فقط', 'Adam');
    db.close();

    const restrictedLogin = await loginStaff('cpadmin', 'Sanad@2026');
    check('تسجيل دخول الأدمن المقيّد نجح', restrictedLogin.status === 302, `status=${restrictedLogin.status}`);
    const restrictedAdmin = restrictedLogin.client;

    const stillCanSettings = await restrictedAdmin.get(`${ADMIN}/settings?tab=site`);
    check('الأدمن المقيّد لسه يقدر يوصل لتبويبات إعدادات تانية (settings.manage لسه معاه)', stillCanSettings.status === 200);

    const csrfBlocked = await restrictedAdmin.token(`${ADMIN}/settings?tab=protection`);
    const blockedSave = await restrictedAdmin.post(`${ADMIN}/settings/content-protection`, {
      body: { _csrf: csrfBlocked, content_protection_enabled: '0' },
    });
    check('الأدمن المقيّد (من غير content_protection.manage) بيتمنع فعليًا (403) — مش مجرد مخفي', blockedSave.status === 403, `status=${blockedSave.status}`);

    // ================================================== 9. disabling turns it off everywhere again
    section('٩. إيقاف الحماية بيشيلها فعليًا من الصفحات');
    // An unchecked checkbox is never sent by a real browser — the field is
    // absent from the body entirely, not "0" (a non-empty string, which the
    // route's `req.body.x ? '1' : '0'` would read as checked).
    const csrfOff = await adam.token(`${ADMIN}/settings?tab=protection`);
    await adam.post(`${ADMIN}/settings/content-protection`, { body: { _csrf: csrfOff } });
    const homeOff = await fetch('http://127.0.0.1:4590/').then((r) => r.text());
    check('بعد الإيقاف: مفيش رابط content-protection.css في الصفحة الرئيسية', !homeOff.includes('content-protection.css'));
    check('بعد الإيقاف: مفيش كلاس protected-content في الصفحة الرئيسية', !homeOff.includes('protected-content'));

    // ================================================== 10. unrelated protections stay intact
    section('١٠. حماية الملفات الخاصة وheaders الأمان لسه سليمة');
    const anonFile = await fetch('http://127.0.0.1:4590/files/1', { redirect: 'manual' });
    check('ملف خاص من غير تسجيل دخول لسه ممنوع (مش 200)', anonFile.status !== 200, `status=${anonFile.status}`);
    const headersResp = await fetch('http://127.0.0.1:4590/');
    check('Content-Security-Policy لسه موجود', !!headersResp.headers.get('content-security-policy'));
    check('X-Frame-Options لسه موجود', headersResp.headers.get('x-frame-options') === 'DENY');

    section('سلامة السيرفر');
    check('مفيش أخطاء في السيرفر', !/Error|error:/i.test(H.state.serverOutput), H.state.serverOutput.slice(0, 300));
  } catch (err) {
    H.state.fail += 1;
    H.state.failures.push('استثناء غير متوقع: ' + err.message);
    console.error('\n\x1b[31mERROR:\x1b[0m', err);
  } finally {
    H.stop();
  }

  const failCount = H.report();
  process.exit(failCount ? 1 : 0);
})();
