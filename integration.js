#!/usr/bin/env node
/**
 * Integration suite.
 *
 * The other three suites check pieces: a route answers, a value is rejected, a
 * permission holds. This one follows whole journeys — a client arrives, files a
 * request, is assigned, pays, and the file closes — because most real failures
 * are not in a single step but in what one step leaves behind for the next.
 *
 * Every scenario asserts on the state the office would actually see afterwards,
 * not on the response code of the last request.
 *
 *   node integration.js
 */
const { createHarness } = require('./test-harness');

const H = createHarness({ port: 4611, label: 'Integration', env: { SANAD_NO_THROTTLE: '1' } });
const { check, section, makeClient, loginStaff, loginClient, ADMIN, BASE, has } = H;

(async () => {
  console.log('\x1b[1mSanad — رحلات كاملة عبر النظام\x1b[0m\n');
  await H.start();

  const { db } = require('./db');
  const fsx = require('fs');
  const pathx = require('path');

  try {
    const adam = await loginStaff('adam', '1234');
    const nour = await loginStaff('nour', 'demo1234');

    // ================================================== journey one
    section('رحلة ١ — من موقع لطلب مقفول');

    /*
     * The path a real file takes, in order, checking what each step leaves for
     * the next. A step that "works" but writes nothing useful is the failure
     * this catches.
     */
    const visitor = makeClient();
    const vTok = await visitor.token('/request');
    const svc = db.prepare('SELECT * FROM services WHERE active = 1 LIMIT 1').get();

    const filed = await visitor.post('/request', {
      body: {
        _csrf: vTok,
        name: 'حسام الدين عبد المنعم',
        phone: '+201118887766',
        email: 'hossam.journey@example.test',
        service_ids: String(svc.id),
        message: 'محتاج أعرف الخطوات والمستندات المطلوبة، والملف عندي جاهز.',
      },
    });
    check('العميل قدّم طلبه', (filed.location || '').includes('/request/success'), filed.location);

    const req = db.prepare("SELECT * FROM requests WHERE phone = '+201118887766'").get();
    check('الطلب اتسجّل بمرجع', !!req && /^SND-\d{2}-[A-Z0-9]{5}$/.test(req.ref), req && req.ref);
    check('وحالته جديد', req.status === 'new');
    check('وخدمته متسجّلة',
      db.prepare('SELECT COUNT(*) c FROM request_services WHERE request_id = ?').get(req.id).c === 1);
    check('وصفحته اتحسبت لوحدها', !!req.page_id && !!req.page_label);
    check('والمكتب اتبلّغ',
      db.prepare("SELECT COUNT(*) c FROM notifications WHERE request_id = ? AND type = 'new_request'")
        .get(req.id).c > 0);

    // The client can follow it without an account.
    const tracker = makeClient();
    const tTok = await tracker.token('/track');
    const tracked = await tracker.post('/track', {
      body: { _csrf: tTok, ref: req.ref, phone: req.phone },
    });
    check('العميل بيتابعه من غير حساب',
      [200, 302].includes(tracked.status), `status ${tracked.status}`);

    // Assignment.
    const lawyer = db.prepare("SELECT * FROM users WHERE role = 'lawyer' AND active = 1 AND assign_locked = 0 LIMIT 1").get();
    const aTok = await adam.client.token(`${ADMIN}/requests/${req.id}`);
    await adam.client.post(`${ADMIN}/requests/${req.id}/assign`, {
      body: { _csrf: aTok, user_id: lawyer.id },
    });
    check('اتعيّن محامي',
      db.prepare('SELECT COUNT(*) c FROM request_assignees WHERE request_id = ?').get(req.id).c === 1);
    check('والمحامي اتبلّغ',
      db.prepare("SELECT COUNT(*) c FROM notifications WHERE request_id = ? AND user_id = ?")
        .get(req.id, lawyer.id).c > 0);

    // Requirements, then documents.
    await adam.client.post(`${ADMIN}/requests/${req.id}/requirements`, {
      body: { _csrf: aTok, title: 'صورة بطاقة الرقم القومي سارية' },
    });
    const afterReq = db.prepare('SELECT status FROM requests WHERE id = ?').get(req.id).status;
    check('طلب مستند غيّر الحالة تلقائياً', afterReq === 'awaiting_docs', afterReq);

    // Fees, then payment in two instalments.
    await adam.client.post(`${ADMIN}/requests/${req.id}/fees`, {
      body: { _csrf: aTok, label: 'أتعاب المكتب', amount: '12000' },
    });
    await adam.client.post(`${ADMIN}/requests/${req.id}/fees`, {
      body: { _csrf: aTok, label: 'رسوم حكومية', amount: '3000' },
    });
    check('الإجمالي اتحسب من البنود',
      db.prepare('SELECT total_amount t FROM requests WHERE id = ?').get(req.id).t === 15000);

    const today = new Date().toISOString().slice(0, 10);
    await adam.client.post(`${ADMIN}/revenue/request/${req.id}`, {
      body: { _csrf: aTok, amount: '10000', method: 'bank', paid_on: today, reference: 'TRX-J1' },
    });
    await adam.client.post(`${ADMIN}/revenue/request/${req.id}`, {
      body: { _csrf: aTok, amount: '5000', method: 'cash', paid_on: today },
    });

    const pay = require('./lib/payments');
    const bal = pay.balanceFor(req.id);
    check('المدفوع اتجمع من الدفعتين', bal.paid === 15000, String(bal.paid));
    check('والرصيد اتسدّد', bal.settled && Math.abs(bal.remaining) < 0.01, String(bal.remaining));

    // An expense against the file.
    await adam.client.post(`${ADMIN}/expenses/request/${req.id}`, {
      body: { _csrf: aTok, amount: '450', reason: 'رسوم استخراج مستخرج رسمي',
              category: 'government', spent_on: today },
    });
    const expensesLib = require('./lib/expenses');
    const cost = expensesLib.totalsFor(req.id);
    check('المصروف اتسجّل على الطلب', cost.total === 450, String(cost.total));
    check('وبينقص من صافي الطلب', bal.paid - cost.office === 14550);

    // Closing it.
    // Completion deliberately refuses files with unfinished steps, no received
    // document or no hand-off summary.  Satisfy those safeguards so this
    // journey exercises the real close path rather than the validation error.
    db.prepare('UPDATE todos SET done=1, done_at=datetime(\'now\') WHERE request_id=?').run(req.id);
    db.prepare(
      `INSERT INTO documents (request_id, name, kind, uploaded_by, source)
       VALUES (?, ?, 'pdf', ?, 'client')`
    ).run(req.id, 'صورة بطاقة الرقم القومي سارية', req.name);
    await adam.client.post(`${ADMIN}/requests/${req.id}/update`, {
      body: {
        _csrf: aTok,
        status: 'completed',
        completion_summary: 'اكتملت الخدمة وسُلّمت النتيجة النهائية للعميل.',
        completion_rating: '5',
      },
    });
    check('الطلب اتقفل',
      db.prepare('SELECT status FROM requests WHERE id = ?').get(req.id).status === 'completed');

    // The trail reads as a story afterwards.
    const trail = db
      .prepare("SELECT action FROM audit_log WHERE entity_type = 'request' AND entity_id = ?")
      .all(req.id)
      .map((r) => r.action);
    check('سجل النشاط فيه كل خطوة',
      ['request.assign', 'request.payment', 'request.expense'].every((a) => trail.includes(a)),
      trail.join(', '));

    check('والطلب بيظهر في الإيرادات',
      pay.report(pay.periodBounds('month')).totals.collected >= 15000);

    // ================================================== journey two
    section('رحلة ٢ — عميل مش عارف يحتاج إيه');

    const puzzled = makeClient();
    const pTok = await puzzled.token('/request');
    const described = await puzzled.post('/request', {
      body: {
        _csrf: pTok,
        name: 'سعاد رمضان',
        phone: '+201119996655',
        service_ids: '',
        message: 'عندي مشكلة في عداد الكهرباء والجيران بيقولوا لازم أنقل العداد، مش عارفة أبدأ منين.',
      },
    });
    check('الطلب اتقبل من غير خدمة',
      (described.location || '').includes('/request/success'), described.location);

    const custom = db.prepare("SELECT * FROM requests WHERE phone = '+201119996655'").get();
    check('واتعلّم كوصف حر', custom.is_custom === 1);
    check('ومن غير صفحة', custom.page_id === null);

    // The office reads it and attaches the right service.
    const cTok = await adam.client.token(`${ADMIN}/requests/${custom.id}`);
    const detail = await adam.client.get(`${ADMIN}/requests/${custom.id}`);
    check('اللوحة بتنبّه إنه وصف حر', has(detail.text, 'وصف طلبه'));

    await adam.client.post(`${ADMIN}/requests/${custom.id}/title`, {
      body: { _csrf: cTok, title: 'نقل عداد كهرباء' },
    });
    check('الموظف عدّل العنوان',
      db.prepare('SELECT title FROM requests WHERE id = ?').get(custom.id).title === 'نقل عداد كهرباء');

    // ================================================== journey three
    section('رحلة ٣ — طلب مركّب بأكتر من خدمة');

    const company = makeClient();
    const coTok = await company.token('/request');
    const bundle = db
      .prepare(
        `SELECT s.id FROM services s JOIN categories c ON c.id = s.category_id
         JOIN pages p ON p.id = c.page_id WHERE p.slug = 'companies' AND s.active = 1 LIMIT 3`
      )
      .all();

    await company.post('/request', {
      body: { _csrf: coTok, name: 'شركة النيل للتجارة', phone: '+201117775544',
              service_ids: bundle.map((b) => b.id).join(','),
              message: 'تأسيس كامل من الأول للآخر.' },
    });

    const bundled = db.prepare("SELECT * FROM requests WHERE phone = '+201117775544'").get();
    check('الطلب المركّب اتسجّل', !!bundled);
    check('وكل خدماته اتسجلت',
      db.prepare('SELECT COUNT(*) c FROM request_services WHERE request_id = ?').get(bundled.id).c
        === bundle.length);
    check('والأولى بقت الأساسية', bundled.service_id === bundle[0].id);
    check('وصفحته الشركات',
      (bundled.page_label || '').includes('شركات'), bundled.page_label);

    const bundleView = await adam.client.get(`${ADMIN}/requests/${bundled.id}`);
    check('اللوحة بتعرض الخدمات كلها', has(bundleView.text, 'الخدمات المطلوبة'));

    // ================================================== permissions in motion
    section('الصلاحيات وهي بتتغيّر');

    const probeName = 'perm_journey';
    db.prepare('DELETE FROM users WHERE username = ?').run(probeName);
    const bcrypt = require('bcryptjs');
    const probeId = Number(
      db
        .prepare(
          `INSERT INTO users (username, password_hash, role, display_name, email, active,
                              must_change_password, profile_completed, legal_name, phone,
                              national_id, birth_date)
           VALUES (?,?,'lawyer','محامي الرحلة','journey@sanad.com.eg',1,0,1,
                   'محامي الرحلة الكامل حسن','+201006665544','29505051234567','1995-05-05')`
        )
        .run(probeName, bcrypt.hashSync('Journey#123', 8)).lastInsertRowid
    );
    db.prepare('INSERT OR IGNORE INTO request_assignees (request_id, user_id, assigned_by) VALUES (?,?,?)')
      .run(req.id, probeId, 'اختبار');

    let probe = await loginStaff(probeName, 'Journey#123');
    check('المحامي بيفتح طلبه',
      (await probe.client.get(`${ADMIN}/requests/${req.id}`)).status === 200);
    check('ومش بيشوف الأتعاب',
      !has((await probe.client.get(`${ADMIN}/requests/${req.id}`)).text, 'fee-list'));
    check('ومش بيفتح الإيرادات',
      (await probe.client.get(`${ADMIN}/revenue`)).status === 403);

    // Grant one exception and watch it take effect without signing out.
    const permTok = await adam.client.token(`${ADMIN}/users/${probeId}/permissions`);
    await adam.client.post(`${ADMIN}/users/${probeId}/permissions`, {
      body: { _csrf: permTok,
              permission: ['requests.edit', 'documents.manage', 'money.view'] },
    });
    check('الاستثناء اتسجّل',
      db.prepare("SELECT COUNT(*) c FROM user_permissions WHERE user_id = ? AND permission = 'money.view'")
        .get(probeId).c === 1);
    check('وبقى يشوف الأتعاب في نفس الجلسة',
      has((await probe.client.get(`${ADMIN}/requests/${req.id}`)).text, 'fee-list'),
      'الاستثناء مااشتغلش من غير تسجيل خروج');
    check('لكن لسه مش بيفتح الإيرادات',
      (await probe.client.get(`${ADMIN}/revenue`)).status === 403);

    // Take it away again.
    await adam.client.post(`${ADMIN}/users/${probeId}/permissions`, {
      body: { _csrf: permTok, permission: ['requests.edit', 'documents.manage'] },
    });
    check('وشيله بيسري فوراً كمان',
      !has((await probe.client.get(`${ADMIN}/requests/${req.id}`)).text, 'fee-list'));

    // A role change lands on the open session too.
    db.prepare("UPDATE users SET role = 'accountant' WHERE id = ?").run(probeId);
    check('تغيير الدور بيسري على الجلسة',
      (await probe.client.get(`${ADMIN}/revenue`)).status === 200);
    db.prepare("UPDATE users SET role = 'lawyer' WHERE id = ?").run(probeId);

    // ================================================== availability
    section('قفل التعيين من الطرفين');

    probe = await loginStaff(probeName, 'Journey#123');
    const lockTok = await probe.client.token(`${ADMIN}/account/profile`);
    await probe.client.post(`${ADMIN}/account/assign-lock`, {
      body: { _csrf: lockTok, lock: '1', reason: 'إجازة سنوية',
              until: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) },
    });

    const locked = db.prepare('SELECT * FROM users WHERE id = ?').get(probeId);
    check('الموظف قفل نفسه', locked.assign_locked === 1);
    check('والسبب متسجّل', has(locked.assign_lock_reason, 'إجازة'));
    check('وتاريخ الرجوع كمان', !!locked.assign_lock_until);

    const blocked = await adam.client.post(`${ADMIN}/requests/${bundled.id}/assign`, {
      body: { _csrf: aTok, user_id: probeId },
    });
    check('التعيين اتمنع مع السبب',
      (blocked.location || '').includes('assignee_locked'), blocked.location);
    check('ومفيش تعيين اتكتب',
      db.prepare('SELECT COUNT(*) c FROM request_assignees WHERE request_id = ? AND user_id = ?')
        .get(bundled.id, probeId).c === 0);

    const forced = await adam.client.post(`${ADMIN}/requests/${bundled.id}/assign`, {
      body: { _csrf: aTok, user_id: probeId, override: '1' },
    });
    check('والتجاوز بيشتغل لما تصرّ',
      db.prepare('SELECT COUNT(*) c FROM request_assignees WHERE request_id = ? AND user_id = ?')
        .get(bundled.id, probeId).c === 1);

    // An expired lock releases itself.
    db.prepare("UPDATE users SET assign_lock_until = date('now','-1 day') WHERE id = ?").run(probeId);
    await adam.client.post(`${ADMIN}/requests/${custom.id}/assign`, {
      body: { _csrf: cTok, user_id: probeId },
    });
    check('القفل المنتهي بيفتح لوحده',
      db.prepare('SELECT assign_locked FROM users WHERE id = ?').get(probeId).assign_locked === 0);

    // ================================================== routes nothing covered
    section('مسارات مكانتش متغطية');

    const seenTok = await adam.client.token(`${ADMIN}/notifications`);
    await adam.client.post(`${ADMIN}/notifications/seen-all`, { body: { _csrf: seenTok } });
    check('«شوفت الكل» بيفضّي غير المقروء',
      db.prepare(
        `SELECT COUNT(*) c FROM notifications
         WHERE user_id = (SELECT id FROM users WHERE username = 'adam') AND seen_at IS NULL`
      ).get().c === 0);

    const hoursTok = await adam.client.token(`${ADMIN}/contacts`);
    await adam.client.post(`${ADMIN}/contacts/hours`, {
      body: { _csrf: hoursTok, office_hours_ar: 'من ٩ لـ ٦', office_address_ar: 'المعادي',
              office_map_url: 'javascript:alert(1)' },
    });
    const { getSetting } = require('./db');
    check('مواعيد المكتب اتحفظت', getSetting('office_hours_ar', '') === 'من ٩ لـ ٦');
    check('ولينك خريطة خطر اترفض', getSetting('office_map_url', '') === '',
      getSetting('office_map_url', ''));
    check('وبيظهروا للعميل',
      has((await makeClient().get('/contact')).text, 'من ٩ لـ ٦'));

    // Staff sign-out really ends the session.
    const bye = await loginStaff(probeName, 'Journey#123');
    const byeTok = await bye.client.token(`${ADMIN}/`);
    await bye.client.post(`${ADMIN}/logout`, { body: { _csrf: byeTok } });
    const afterBye = await bye.client.get(`${ADMIN}/requests`);
    check('تسجيل الخروج بينهي الجلسة',
      afterBye.status === 302 && (afterBye.location || '').includes('/login'),
      `${afterBye.status} → ${afterBye.location}`);

    // Client sign-out too.
    const portalUser = await loginClient('client@demo.sanad', 'demo1234');
    const outTok = await portalUser.client.token('/portal');
    await portalUser.client.post('/portal/logout', { body: { _csrf: outTok } });
    check('وخروج العميل كمان',
      ((await portalUser.client.get('/portal')).location || '').includes('/portal/login'));

    // ================================================== audit trail
    section('سجل النشاط بيقول الحقيقة');

    const auditRows = db
      .prepare("SELECT * FROM audit_log WHERE entity_type = 'request' AND entity_id = ?")
      .all(req.id);

    check('كل إجراء ليه صف', auditRows.length >= 5, `${auditRows.length}`);
    check('وكل صف عليه اسم مين عمله',
      auditRows.every((r) => !!r.user_label), 'فيه صف بدون فاعل');
    check('وكل صف عليه وقت', auditRows.every((r) => !!r.created_at));
    check('والتفاصيل مكتوبة',
      auditRows.filter((r) => r.details && r.details.length > 5).length >= 4);

    const moneyRows = auditRows.filter((r) => /payment|fee|expense/.test(r.action));
    check('حركات الفلوس متسجّلة', moneyRows.length >= 2, `${moneyRows.length}`);

    // A lawyer without money.view must not read money lines out of the trail.
    const audit = require('./lib/audit');
    const hidden = audit.forEntity('request', req.id, 40, { includeMoney: false });
    check('والمحامي مش بيقراها من السجل',
      hidden.every((r) => !/payment|fee|expense/.test(r.action)),
      'حركة مالية ظهرت لمحامي');

    // ================================================== permissions storage
    section('تخزين الصلاحيات');

    const permissions = require('./lib/permissions');
    const stored = db.prepare('SELECT * FROM user_permissions WHERE user_id = ?').all(probeId);
    check('الاستثناءات بس هي المتخزنة',
      stored.every((r) => permissions.ALL.includes(r.permission)),
      'فيه صلاحية مش في الكتالوج');

    const defaults = new Set(permissions.ROLE_DEFAULTS.lawyer);
    check('ومفيش صف بيكرر اللي الدور بيديه',
      stored.every((r) => (r.granted === 1) !== defaults.has(r.permission)),
      'فيه استثناء بيكرر الافتراضي');

    check('وكل صف عليه مين حطه', stored.every((r) => !!r.set_by));

    // Deleting an account takes its exceptions with it.
    const before = db.prepare('SELECT COUNT(*) c FROM user_permissions').get().c;
    db.prepare('DELETE FROM users WHERE id = ?').run(probeId);
    check('حذف الموظف بيشيل استثناءاته',
      db.prepare('SELECT COUNT(*) c FROM user_permissions WHERE user_id = ?').get(probeId).c === 0);
    check('ومفيش صف يتيم فاضل',
      db.prepare(
        'SELECT COUNT(*) c FROM user_permissions WHERE user_id NOT IN (SELECT id FROM users)'
      ).get().c === 0);

    // ================================================== notes and links
    section('ملاحظات الطلب وحسابات التواصل');

    const noteCols = db.prepare('PRAGMA table_info(request_notes)').all().map((c) => c.name);
    check('جدول الملاحظات موجود', noteCols.length > 0, noteCols.join(', '));

    const socialRows = db.prepare('SELECT * FROM social_links').all();
    check('حسابات التواصل متسجّلة', socialRows.length > 0, `${socialRows.length}`);
    const homeHtml = (await makeClient().get('/')).text;
    check('وبتظهر في الموقع',
      socialRows.some((l) => homeHtml.includes(l.url)),
      'مفيش حساب تواصل ظاهر في الصفحة');

    const socialPage = await adam.client.get(`${ADMIN}/social`);
    check('وصفحة إدارتها بتفتح', socialPage.status === 200);

    // ================================================== migrations
    section('الترحيلات');

    const applied = db.prepare('SELECT * FROM schema_migrations ORDER BY name').all();
    const onDisk = fsx
      .readdirSync(pathx.join(__dirname, 'db/migrations'))
      .filter((f) => f.endsWith('.js'))
      .sort();

    check('كل ترحيل على الديسك اتطبّق',
      onDisk.every((f) => applied.some((a) => a.name === f)),
      onDisk.filter((f) => !applied.some((a) => a.name === f)).join(', '));
    check('ومفيش ترحيل متطبّق مش موجود',
      applied.every((a) => onDisk.includes(a.name)),
      applied.filter((a) => !onDisk.includes(a.name)).map((a) => a.name).join(', '));
    check('وكل ترحيل عليه وقت تطبيقه',
      applied.every((a) => !!a.applied_at), 'فيه ترحيل بدون وقت');

    // ================================================== consistency
    section('تماسك النظام بعد كل ده');

    check('العلاقات سليمة', db.prepare('PRAGMA foreign_key_check').all().length === 0);
    check('قاعدة البيانات سليمة',
      db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok');

    check('كل إجمالي مطابق لبنوده',
      db.prepare(
        `SELECT COUNT(*) c FROM requests r
         WHERE ABS(COALESCE(r.total_amount,0) -
           (SELECT COALESCE(SUM(amount),0) FROM fee_items f WHERE f.request_id = r.id)) > 0.01`
      ).get().c === 0);

    check('وكل مدفوع مطابق لدفعاته',
      db.prepare(
        `SELECT COUNT(*) c FROM requests r
         WHERE ABS(COALESCE(r.paid_amount,0) -
           (SELECT COALESCE(SUM(amount),0) FROM payments p
             WHERE p.request_id = r.id AND p.voided_at IS NULL)) > 0.01`
      ).get().c === 0);

    check('وفهرس البحث متزامن',
      db.prepare('SELECT COUNT(*) c FROM requests_fts').get().c ===
        db.prepare('SELECT COUNT(*) c FROM requests').get().c);

    check('وكل طلب له صفحة أو وصف حر',
      db.prepare(
        `SELECT COUNT(*) c FROM requests
         WHERE service_id IS NOT NULL AND page_id IS NULL`
      ).get().c === 0);

    check('السيرفر مافيهوش استثناءات',
      !/UnhandledPromiseRejection|TypeError:|ReferenceError:/.test(H.state.serverOutput),
      H.state.serverOutput.slice(-200));
  } catch (err) {
    H.state.fail += 1;
    H.state.failures.push('استثناء غير متوقع: ' + err.message);
    console.error('\n\x1b[31mERROR:\x1b[0m', err);
  } finally {
    H.stop();
  }

  process.exit(H.report() ? 1 : 0);
})();
