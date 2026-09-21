#!/usr/bin/env node
/**
 * Security scan.
 *
 * Attacks the running application the way somebody trying to get in would,
 * rather than checking that the code contains the right words. Grouped by the
 * failure it is looking for:
 *
 *   A. Injection            SQL, template, path traversal, header injection
 *   B. Authentication       brute force, session handling, tokens
 *   C. Access control       horizontal and vertical privilege escalation
 *   D. Cross-site           CSRF, XSS, open redirect, clickjacking
 *   E. File handling        upload types, traversal, serving rules
 *   F. Data exposure        error leakage, enumeration, sensitive fields
 *   G. Transport & headers  cookie flags, security headers
 *   H. Denial of service    payload sizes, rate limits
 *
 *   node security.js
 */
const fs = require('fs');
const fsx = fs;
const pathx = require('path');
const { spawn } = require('child_process');
const path = require('path');
const { createHarness } = require('./test-harness');

const H = createHarness({ port: 4577, label: 'Security scan', env: { SANAD_NO_THROTTLE: '1' } });
const { check, section, makeClient, loginStaff, loginClient, ADMIN, BASE, has } = H;

// Payloads reused across the injection tests.
const SQLI = [
  "' OR '1'='1",
  "'; DROP TABLE requests; --",
  "1' UNION SELECT null,null,null--",
  "admin'--",
  "' OR 1=1 LIMIT 1 --",
  "\\'; DELETE FROM users WHERE '1'='1",
];

const XSS = [
  '<script>alert(1)</script>',
  '"><script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  'javascript:alert(1)',
  '<svg/onload=alert(1)>',
  '{{constructor.constructor("alert(1)")()}}',
  '<%= 7*7 %>',
];

const TRAVERSAL = [
  '../../../etc/passwd',
  '..%2f..%2f..%2fetc%2fpasswd',
  '....//....//etc/passwd',
  '/etc/passwd',
  '..\\..\\windows\\system32\\config\\sam',
];

(async () => {
  console.log('\x1b[1mSanad — security scan\x1b[0m\n');
  await H.start();

  const { db } = require('./db');

  try {
    const adam = await loginStaff('adam', '1234');
    const nour = await loginStaff('nour', 'demo1234');
    const mona = await loginStaff('mona', 'demo1234');
    const khaled = await loginStaff('khaled', 'demo1234');
    const client = await loginClient('client@demo.sanad', 'demo1234');

    const before = {
      requests: db.prepare('SELECT COUNT(*) c FROM requests').get().c,
      users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
      clients: db.prepare('SELECT COUNT(*) c FROM clients').get().c,
    };

    // ================================================== A. injection
    section('أ — حقن SQL');

    for (const payload of SQLI) {
      const r = await adam.client.get(`${ADMIN}/requests?q=${encodeURIComponent(payload)}`);
      check(`بحث الطلبات يصمد أمام: ${payload.slice(0, 22)}`, r.status === 200, `status ${r.status}`);
    }

    for (const payload of SQLI.slice(0, 3)) {
      const c = makeClient();
      const t = await c.token(`${ADMIN}/login`);
      const r = await c.post(`${ADMIN}/login`, {
        body: { _csrf: t, username: payload, password: payload },
      });
      check(`تسجيل الدخول يصمد أمام: ${payload.slice(0, 22)}`, !r.location, r.location || 'رُفض');
    }

    for (const payload of SQLI.slice(0, 3)) {
      const c = makeClient();
      const t = await c.token('/track');
      const r = await c.post('/track', { body: { _csrf: t, ref: payload, phone: payload } });
      check(`التتبّع يصمد أمام: ${payload.slice(0, 22)}`, r.status === 200 && !r.location);
    }

    const after = {
      requests: db.prepare('SELECT COUNT(*) c FROM requests').get().c,
      users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
      clients: db.prepare('SELECT COUNT(*) c FROM clients').get().c,
    };
    check('لا صفوف اتمسحت أو اتضافت من الحقن',
      JSON.stringify(before) === JSON.stringify(after),
      `${JSON.stringify(before)} → ${JSON.stringify(after)}`);

    check('كل الجداول لسه موجودة',
      db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='table'").get().c > 15);

    section('أ — حقن في القوالب');
    const tplTok = await adam.client.token(`${ADMIN}/requests/1`);
    for (const payload of ['<%= 7*7 %>', '${7*7}', '{{7*7}}']) {
      await adam.client.post(`${ADMIN}/requests/1/comments`, {
        body: { _csrf: tplTok, body: payload },
      });
    }
    const rendered = (await adam.client.get(`${ADMIN}/requests/1`)).text;
    // Look at the comment bubbles specifically: "49" appears elsewhere on the
    // page legitimately (ids, sizes), so scanning the whole document would
    // flag a problem that is not there.
    const bubbles = (rendered.match(/<div class="tx">([\s\S]*?)<\/div>/g) || []).join('');
    check('تعبيرات القوالب مش بتتنفّذ',
      !bubbles.includes('49') && bubbles.includes('&lt;%='),
      bubbles.includes('49') ? 'ظهر ناتج 7*7' : 'التعبير مش مهروب');

    section('أ — حقن في الترويسات');
    const headerInjection = await adam.client.get(
      `${ADMIN}/requests?q=${encodeURIComponent('test\r\nX-Injected: yes')}`
    );
    check('مفيش ترويسة محقونة', !headerInjection.headers.get('x-injected'));

    // ================================================== B. authentication
    section('ب — كلمات السر والدخول');

    check('كلمات السر متخزّنة كهاش مش نص',
      db.prepare('SELECT password_hash FROM users LIMIT 1').get().password_hash.startsWith('$2'));
    check('كلمات سر العملاء كمان',
      db.prepare('SELECT password_hash FROM clients WHERE password_hash IS NOT NULL LIMIT 1')
        .get().password_hash.startsWith('$2'));

    section('ب — الجلسات');
    const loginRes = await (async () => {
      const c = makeClient();
      const t = await c.token(`${ADMIN}/login`);
      return c.post(`${ADMIN}/login`, { body: { _csrf: t, username: 'nour', password: 'demo1234' } });
    })();
    const setCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [];
    check('الكوكي HttpOnly', setCookies.some((c) => /httponly/i.test(c)), setCookies.join(' | ').slice(0, 80));
    check('الكوكي SameSite', setCookies.some((c) => /samesite/i.test(c)));

    // A session id must not survive the privilege change.
    // Session fixation: the id handed out before signing in must not be the
    // id that carries the new privileges. Read from the response headers,
    // because the jar only shows the latest value.
    // Session fixation, checked without a cookie jar in the way: take the id
    // the server issues to an anonymous visitor, sign in carrying exactly that
    // id, and confirm the server replies with a different one.
    const anon = await fetch(BASE + ADMIN + '/login', { redirect: 'manual' });
    const anonBody = await anon.text();
    const anonCookie = (anon.headers.getSetCookie() || []).find((c) => c.startsWith('sanad.sid='));
    const anonSid = anonCookie ? anonCookie.split(';')[0] : '';
    const anonTok = (anonBody.match(/name="_csrf" value="([^"]+)"/) || [])[1];

    const afterLogin = await fetch(BASE + ADMIN + '/login', {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: anonSid },
      body: new URLSearchParams({ _csrf: anonTok, username: 'nour', password: 'demo1234' }).toString(),
    });
    const rotated = (afterLogin.headers.getSetCookie() || [])
      .find((c) => c.startsWith('sanad.sid='));
    const rotatedSid = rotated ? rotated.split(';')[0] : '';

    check('معرّف الجلسة بيتجدّد بعد الدخول',
      !!rotatedSid && rotatedSid !== anonSid,
      `${anonSid.slice(0, 26)}… → ${rotatedSid.slice(0, 26)}…`);

    // And the old id must be worthless afterwards.
    const oldSession = await fetch(BASE + ADMIN + '/requests', {
      redirect: 'manual',
      headers: { cookie: anonSid },
    });
    check('المعرّف القديم مبقاش يشتغل', oldSession.status === 302, `status ${oldSession.status}`);

    // A forged cookie must not be accepted.
    const forged = await fetch(BASE + ADMIN + '/requests', {
      headers: { cookie: 'sanad.sid=s%3Aforged-session-id.fakesignature' },
      redirect: 'manual',
    });
    check('كوكي مزوّر مرفوض', forged.status === 302, `status ${forged.status}`);

    section('ب — توكنات إعادة التعيين والتتبّع');
    check('توكنات إعادة التعيين متخزّنة كهاش',
      (() => {
        const row = db.prepare('SELECT token_hash FROM password_resets LIMIT 1').get();
        return !row || /^[a-f0-9]{64}$/.test(row.token_hash);
      })());

    const uploadTokens = db
      .prepare('SELECT upload_token FROM requests WHERE upload_token IS NOT NULL LIMIT 5')
      .all();
    check('توكنات الرفع طويلة وعشوائية',
      uploadTokens.every((t) => t.upload_token.length >= 40));
    check('كل توكن رفع مختلف',
      new Set(uploadTokens.map((t) => t.upload_token)).size === uploadTokens.length);

    const refs = db.prepare('SELECT ref FROM requests').all().map((r) => r.ref);
    check('أرقام الطلبات مش متسلسلة',
      refs.every((r) => /^SND-\d{2}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/.test(r)),
      refs.slice(0, 2).join(', '));

    // ================================================== C. access control
    section('ب — الحماية من التخمين');
    /*
     * Run against a server of its own, with the limiter armed.
     *
     * The throttle is per address and this whole suite runs from one, so
     * exhausting it here would block every sign-in that follows — the rest of
     * the scan would then be testing our own test rather than the application.
     * A separate process keeps the counters isolated.
     */
    const bruteResult = await new Promise((resolve) => {
      const dir = fsx.mkdtempSync(pathx.join(require('os').tmpdir(), 'sanad-brute-'));
      const port = 4588;

      const seed = spawn('node', ['demo.js'], {
        env: { ...process.env, DATA_DIR: dir, NODE_ENV: 'test' },
        cwd: __dirname,
      });

      seed.on('close', () => {
        const srv = spawn('node', ['server.js'], {
          env: {
            ...process.env,
            DATA_DIR: dir,
            PORT: String(port),
            ADMIN_PATH: ADMIN,
            NODE_ENV: 'test',
            SESSION_SECRET: 'brute-probe-secret',
            SANAD_NO_THROTTLE: '',
          },
          cwd: __dirname,
        });

        const finish = async () => {
          const base = `http://127.0.0.1:${port}`;
          const attempt = async () => {
            const page = await fetch(base + ADMIN + '/login');
            const cookie = (page.headers.getSetCookie() || [])
              .map((c) => c.split(';')[0]).join('; ');
            const token = ((await page.text()).match(/name="_csrf" value="([^"]+)"/) || [])[1];

            const res = await fetch(base + ADMIN + '/login', {
              method: 'POST',
              redirect: 'manual',
              headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
              body: new URLSearchParams({ _csrf: token, username: 'adam', password: 'wrong' }).toString(),
            });
            return { status: res.status, text: await res.text() };
          };

          const seen = [];
          for (let i = 0; i < 12; i += 1) seen.push(await attempt());

          srv.kill('SIGKILL');
          fsx.rmSync(dir, { recursive: true, force: true });

          resolve({
            allRejected: seen.every((r) => r.status !== 302),
            throttled: seen.some((r) => r.status === 429),
            correctStillBlocked: seen[seen.length - 1].status === 429,
          });
        };

        // Wait for the port, then run.
        (async () => {
          for (let i = 0; i < 60; i += 1) {
            try {
              await fetch(`http://127.0.0.1:${port}/`);
              return finish();
            } catch {
              await new Promise((r) => setTimeout(r, 300));
            }
          }
          srv.kill('SIGKILL');
          resolve({ allRejected: false, throttled: false, correctStillBlocked: false });
        })();
      });

      setTimeout(() => resolve({ allRejected: false, throttled: false, correctStillBlocked: false }), 180000);
    });

    check('محاولات التخمين كلها مرفوضة', bruteResult.allRejected);
    check('التخمين بيتوقف بعد عدد محاولات', bruteResult.throttled,
      'مفيش 429 — الحد مش شغّال');
    check('والحظر بيفضل شغّال بعد ما يتفعّل', bruteResult.correctStillBlocked);

    section('ج — تجاوز الصلاحيات أفقياً');

    // A client must not reach another client's request by changing the id.
    const otherRequest = db
      .prepare('SELECT id FROM requests WHERE client_id IS NOT NULL AND client_id != 1 LIMIT 1')
      .get();
    const crossClient = await client.client.get(`/portal/requests/${otherRequest.id}`);
    check('العميل مش بيفتح طلب عميل تاني', crossClient.status === 302, `status ${crossClient.status}`);

    const crossUpload = await client.client.get(`/upload/${otherRequest.id}`);
    check('ولا صفحة رفعه', crossUpload.status === 403, `status ${crossUpload.status}`);

    // Guessing an upload token must fail.
    const guessed = await makeClient().get(`/upload/1?t=${'a'.repeat(48)}`);
    check('توكن رفع مخمّن مرفوض', guessed.status === 403);

    // Tracking one request must not unlock another.
    const sample = db.prepare('SELECT id, ref, phone FROM requests LIMIT 1').get();
    const tracker = makeClient();
    const trTok = await tracker.token('/track');
    await tracker.post('/track', { body: { _csrf: trTok, ref: sample.ref, phone: sample.phone } });
    const otherTrack = await tracker.get(`/track/${otherRequest.id}`);
    check('التتبّع مش بيفتح طلبات تانية', otherTrack.status === 302);

    section('ج — تجاوز الصلاحيات رأسياً');
    /*
     * Stated as a matrix rather than a loop with conditions inside it.
     *
     * The previous version had the expectation tangled up in the assertion, so
     * it was hard to tell what it actually required — and a check nobody can
     * read is a check nobody maintains.
     */
    const expected = [
      ['/users',                'users.view'],
      ['/settings',             'settings.manage'],
      ['/content',              'content.manage'],
      ['/consultations-admin',  'content.manage'],
      ['/security',             'security.view'],
      ['/activity',             'activity.view'],
      ['/revenue',              'revenue.view'],
      ['/clients',              'clients.directory'],
      ['/expenses',             'expenses.view_all'],
    ];

    const perms = require('./lib/permissions');
    const people = [
      ['nour', nour, 'supervisor'],
      ['mona', mona, 'lawyer'],
    ];

    // Writing to a staff account still needs the stricter permission, checked
    // separately below.
    for (const [path, needed] of expected) {
      for (const [name, session, role] of people) {
        const row = db.prepare('SELECT * FROM users WHERE username = ?').get(name);
        const allowed = perms.resolve(db, row).has(needed);
        const status = (await session.client.get(ADMIN + path)).status;

        check(
          `${name} ${allowed ? 'بيوصل' : 'محجوب عن'} ${path}`,
          allowed ? status === 200 : status === 403,
          `status ${status} · ${needed} = ${allowed}`
        );
      }
    }

    /*
     * Reading a staff file is now separate from changing one, so the write
     * endpoints are checked on their own — a supervisor who can look somebody
     * up must still not be able to edit their account or erase records.
     */
    const nourRow = db.prepare("SELECT * FROM users WHERE username = 'nour'").get();
    const nourPerms = perms.resolve(db, nourRow);

    check('المشرف بيقرا ملفات الموظفين', nourPerms.has('users.view'));
    check('بس مش بيدير الحسابات', !nourPerms.has('users.manage'));
    check('ومفيش عنده حذف نهائي',
      !nourPerms.has('clients.erase') && !nourPerms.has('requests.erase'));

    const nourWriteTok = await nour.client.token(`${ADMIN}/users`);
    const staffTarget = db
      .prepare("SELECT id FROM users WHERE username = 'mona'")
      .get().id;

    for (const [url, body] of [
      [`${ADMIN}/users/new`, { username: 'sneak', password: 'Sneak#12345',
                               password_confirm: 'Sneak#12345', role: 'admin' }],
      [`${ADMIN}/users/${staffTarget}/toggle`, {}],
      [`${ADMIN}/users/${staffTarget}/permissions`, { permission: 'users.manage' }],
    ]) {
      const r = await nour.client.post(url, { body: { _csrf: nourWriteTok, ...body } });
      check(`المشرف مش بيكتب على ${url.replace(ADMIN, '')}`,
        r.status === 403, `status ${r.status}`);
    }

    check('ومفيش حساب أدمن اتزاد',
      !db.prepare("SELECT 1 FROM users WHERE username = 'sneak'").get());

    // Write endpoints, not just the pages that link to them.
    const monaTok = await mona.client.token(`${ADMIN}/requests/1`);
    const writeAttempts = [
      [`${ADMIN}/users/new`, { display_name: 'x', username: 'hacker', email: 'h@h.com',
                               password: 'Hack#12345', password_confirm: 'Hack#12345', role: 'admin' }],
      [`${ADMIN}/settings/site`, { site_name_ar: 'اختراق' }],
      [`${ADMIN}/content/categories/new`, { name_ar: 'قسم مخترق' }],
      [`${ADMIN}/requests/1/fees`, { label: 'اختراق', amount: '1' }],
    ];
    for (const [url, body] of writeAttempts) {
      const r = await mona.client.post(url, { body: { _csrf: monaTok, ...body } });
      // A refusal is a 403 or a redirect that changes nothing — both are safe,
      // and which one depends on where the gate sits.
      check(`المحامي مش بيكتب على ${url.replace(ADMIN, '')}`,
        [302, 403].includes(r.status), `status ${r.status}`);
    }
    check('ومفيش بند أتعاب اتزاد',
      db.prepare("SELECT COUNT(*) c FROM fee_items WHERE label = 'اختراق'").get().c === 0);
    check('مفيش حساب أدمن جديد اتعمل',
      db.prepare("SELECT COUNT(*) c FROM users WHERE username = 'hacker'").get().c === 0);

    // The client portal must not accept staff-only actions.
    const clientTok = await client.client.token('/portal');
    const portalAbuse = await client.client.post(`${ADMIN}/requests/1/update`, {
      body: { _csrf: clientTok, status: 'completed' },
    });
    check('العميل مش بيغيّر حالة الطلب',
      [302, 403].includes(portalAbuse.status) &&
        db.prepare('SELECT status FROM requests WHERE id = 1').get().status !== 'completed');

    section('ج — إخفاء الأرقام المالية');
    /*
     * Isolation is tested with a lawyer holding no exceptions.
     *
     * The demo grants mona `money.view` on purpose, so she is the wrong subject
     * here — she would fail the check by design, and "fixing" that would hide
     * the real question, which is what a lawyer sees by default.
     */
    /*
     * A dedicated account, created here.
     *
     * Reusing a seeded one made these checks depend on whether an earlier
     * section had changed its password or revoked its sessions — which is real
     * behaviour this suite deliberately triggers, and a poor foundation for an
     * unrelated assertion.
     */
    const bcryptLib = require('bcryptjs');
    db.prepare("DELETE FROM users WHERE username = 'perm_probe'").run();

    const plainId = Number(
      db
        .prepare(
          `INSERT INTO users (username, password_hash, role, display_name, email, active,
                              must_change_password, profile_completed, legal_name, phone,
                              national_id, birth_date)
           VALUES ('perm_probe', ?, 'lawyer', 'محامي الفحص', 'probe@sanad.com.eg', 1, 0, 1,
                   'محامي الفحص الأمني حسن', '+201009998877', '29001011234567', '1990-01-01')`
        )
        .run(bcryptLib.hashSync('Probe#12345', 8)).lastInsertRowid
    );

    db.prepare('INSERT OR IGNORE INTO request_assignees (request_id, user_id, assigned_by) VALUES (1,?,?)')
      .run(plainId, 'اختبار أمني');

    const freshPlain = await loginStaff('perm_probe', 'Probe#12345');
    check('حساب الفحص دخل من غير حواجز',
      !!freshPlain.redirect && !(freshPlain.redirect || '').includes('/login'),
      `redirect=${freshPlain.redirect}`);

    const assigned = db
      .prepare('SELECT COUNT(*) c FROM request_assignees WHERE request_id = 1 AND user_id = ?')
      .get(plainId).c;
    check('التعيين اتسجّل', assigned === 1, `${assigned} تعيين`);

    const plainView = await freshPlain.client.get(`${ADMIN}/requests/1`);
    check('المحامي بيفتح الطلب المعيّن عليه', plainView.status === 200,
      `status ${plainView.status} → ${plainView.location || ''}`);
    check('المحامي مش بيشوف بنود الأتعاب',
      plainView.status === 200 && !has(plainView.text, 'fee-list'));
    check('ولا خانة المدفوع', !has(plainView.text, 'name="paid_amount"'));

    const feeLabels = db.prepare('SELECT label FROM fee_items LIMIT 3').all().map((f) => f.label);
    check('ولا أسماء البنود في أي مكان',
      feeLabels.every((l) => !plainView.text.includes(l)), feeLabels.join(', '));

    const plainPrint = await freshPlain.client.get(`${ADMIN}/requests/1/print`);
    check('ولا في نسخة الطباعة',
      plainPrint.status === 200 && !has(plainPrint.text, 'الإجمالي'));

    // The exception is the other half of the same rule.
    check('واللي معاه استثناء بيشوفها',
      has((await mona.client.get(`${ADMIN}/requests/1`)).text, 'fee-list'));

    // ================================================== D. cross-site
    section('د — CSRF');
    const csrfTargets = [
      [`${ADMIN}/requests/1/comments`, { body: 'بدون توكن' }],
      [`${ADMIN}/requests/1/update`, { status: 'cancelled' }],
      ['/request', { name: 'x', phone: '1' }],
      ['/portal/login', { email: 'a@b.c', password: 'x' }],
      ['/track', { ref: 'X', phone: '1' }],
    ];
    for (const [url, body] of csrfTargets) {
      const r = await adam.client.post(url, { body });
      check(`POST بدون توكن مرفوض: ${url}`, r.status === 403, `status ${r.status}`);
    }

    const wrongToken = await adam.client.post(`${ADMIN}/requests/1/comments`, {
      body: { _csrf: 'x'.repeat(48), body: 'توكن غلط' },
    });
    check('توكن CSRF غلط مرفوض', wrongToken.status === 403);

    // A token from one session must not work in another.
    const stolen = await nour.client.token(`${ADMIN}/requests/1`);
    const reused = await mona.client.post(`${ADMIN}/requests/1/comments`, {
      body: { _csrf: stolen, body: 'توكن مسروق' },
    });
    check('توكن جلسة تانية مرفوض', reused.status === 403, `status ${reused.status}`);

    section('د — XSS');
    const xssTok = await adam.client.token(`${ADMIN}/requests/1`);
    for (const payload of XSS) {
      await adam.client.post(`${ADMIN}/requests/1/comments`, {
        body: { _csrf: xssTok, body: payload },
      });
    }
    const page = (await adam.client.get(`${ADMIN}/requests/1`)).text;
    check('مفيش <script> منفّذ', !/<script>alert\(1\)<\/script>/.test(page));
    check('مفيش onerror منفّذ', !/<img src=x onerror=/.test(page));
    check('مفيش svg onload', !/<svg\/onload=/.test(page));
    check('المحتوى مهروب بشكل صحيح', page.includes('&lt;script&gt;'));

    // Reflected in a search box.
    const reflected = await adam.client.get(
      `${ADMIN}/requests?q=${encodeURIComponent('<script>alert(1)</script>')}`
    );
    check('البحث مش بيعكس سكريبت', !/<script>alert\(1\)<\/script>/.test(reflected.text));

    // Stored through the public form, then viewed by staff.
    const evil = makeClient();
    const evilTok = await evil.token('/request');
    await evil.post('/request', {
      body: {
        _csrf: evilTok,
        name: '<script>alert("name")</script>',
        phone: '+201000000123',
        email: 'xss@test.local',
        message: '<img src=x onerror=alert("msg")>',
      },
    });
    const staffList = await adam.client.get(`${ADMIN}/requests`);
    check('اسم خبيث من الموقع العام مهروب',
      !/<script>alert\("name"\)<\/script>/.test(staffList.text));

    const outbox = require('./lib/mailer').OUTBOX;
    if (fs.existsSync(outbox)) {
      const mails = fs.readdirSync(outbox).filter((f) => f.includes('xss'));
      if (mails.length) {
        const body = fs.readFileSync(path.join(outbox, mails[0]), 'utf8');
        check('الإيميل كمان مهروب', !/<script>alert\("name"\)<\/script>/.test(body));
      }
    }

    section('د — إعادة توجيه مفتوحة');
    const redirects = [
      '/portal/login?next=https://evil.example.com',
      '/portal/login?next=//evil.example.com',
      '/portal/login?next=javascript:alert(1)',
      '/portal/register?next=https://evil.example.com',
    ];
    for (const url of redirects) {
      const r = await makeClient().get(url);
      check(`مفيش تحويل خارجي: ${url.split('next=')[1].slice(0, 26)}`,
        !r.text.includes('value="https://evil.example.com"') &&
          !r.text.includes('value="//evil.example.com"') &&
          !r.text.includes('value="javascript:alert(1)"'));
    }

    const loginNext = makeClient();
    const lnTok = await loginNext.token('/portal/login?next=https://evil.example.com');
    const lnRes = await loginNext.post('/portal/login', {
      body: { _csrf: lnTok, email: 'client@demo.sanad', password: 'demo1234',
              next: 'https://evil.example.com' },
    });
    check('الدخول مش بيحوّل لموقع خارجي',
      !(lnRes.location || '').startsWith('http') ||
        (lnRes.location || '').startsWith(BASE), lnRes.location);

    // ================================================== E. files
    section('هـ — رفع الملفات');
    const sharp = require('sharp');
    const img = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#ccc' } })
      .jpeg().toBuffer();

    const upTok = await client.client.token('/upload/2');
    const dangerous = [
      ['shell.php', 'application/x-httpd-php', Buffer.from('<?php system($_GET["c"]); ?>')],
      ['run.exe', 'application/x-msdownload', Buffer.from('MZ\x90\x00')],
      ['script.js', 'text/javascript', Buffer.from('alert(1)')],
      ['page.html', 'text/html', Buffer.from('<script>alert(1)</script>')],
      ['app.svg', 'image/svg+xml', Buffer.from('<svg onload="alert(1)"/>')],
    ];

    for (const [filename, mime, buf] of dangerous) {
      const fd = new FormData();
      fd.append('_csrf', upTok);
      fd.append('name', 'محاولة رفع');
      fd.append('front', new Blob([buf], { type: mime }), filename);
      const r = await fetch(BASE + '/upload/2', {
        method: 'POST', body: fd, redirect: 'manual',
        headers: { cookie: client.client.cookieHeader() },
      });
      check(`رفع ${filename} مرفوض`,
        (r.headers.get('location') || '').includes('err='), r.headers.get('location'));
    }

    // A filename cannot escape the uploads folder.
    const fdTraverse = new FormData();
    fdTraverse.append('_csrf', upTok);
    fdTraverse.append('name', 'اسم خبيث');
    fdTraverse.append('front', new Blob([img], { type: 'image/jpeg' }), '../../../evil.jpg');
    const traverseRes = await fetch(BASE + '/upload/2', {
      method: 'POST', body: fdTraverse, redirect: 'manual',
      headers: { cookie: client.client.cookieHeader() },
    });
    check('اسم ملف فيه ../ مش بيخرج من المجلد',
      (traverseRes.headers.get('location') || '').includes('msg=uploaded') &&
        !fs.existsSync('/evil.jpg') && !fs.existsSync(path.join(__dirname, 'evil.jpg')));

    section('هـ — الوصول للملفات');
    const fileIds = db
      .prepare('SELECT f.id FROM document_files f JOIN documents d ON d.id = f.document_id LIMIT 5')
      .all().map((f) => f.id);

    check('زائر مش بيوصل لأي ملف',
      (await Promise.all(fileIds.map((id) => makeClient().get(`/files/${id}`))))
        .every((r) => r.status === 403));

    for (const p of TRAVERSAL) {
      const r = await adam.client.get(`/files/${encodeURIComponent(p)}`);
      check(`اجتياز مسار مرفوض: ${p.slice(0, 24)}`,
        [400, 403, 404].includes(r.status), `status ${r.status}`);
    }

    const avatarTraverse = await adam.client.get(
      `${ADMIN}/account/avatar/${encodeURIComponent('../../../etc/passwd')}`
    );
    check('الصور الشخصية محمية من الاجتياز',
      [400, 404].includes(avatarTraverse.status), `status ${avatarTraverse.status}`);

    check('مجلد الرفع مش مخدوم كملفات ثابتة',
      (await makeClient().get('/uploads/')).status === 404);
    check('قاعدة البيانات مش قابلة للتحميل',
      [403, 404].includes((await makeClient().get('/sanad.db')).status));
    check('ملف الحسابات مش قابل للتحميل',
      [403, 404].includes((await makeClient().get('/TEST-ACCOUNTS.txt')).status));
    check('صندوق البريد مش مكشوف',
      [403, 404].includes((await makeClient().get('/mail-outbox/')).status));

    // ================================================== F. exposure
    section('و — تسريب المعلومات');
    const notFound = await makeClient().get('/definitely-not-here');
    check('صفحة 404 مفيهاش مسارات السيرفر',
      !notFound.text.includes('/home/') && !notFound.text.includes('at Object'));

    const badId = await adam.client.get(`${ADMIN}/requests/999999`);
    check('رقم طلب مش موجود مبيكشفش خطأ',
      [302, 403, 404].includes(badId.status), `status ${badId.status}`);

    check('مفيش X-Powered-By',
      !(await makeClient().get('/')).headers.get('x-powered-by'));

    // A wrong email and a wrong password must look identical.
    const wrongEmail = makeClient();
    const we = await wrongEmail.token('/portal/login');
    const r1 = await wrongEmail.post('/portal/login',
      { body: { _csrf: we, email: 'nobody@nowhere.test', password: 'x' } });
    const wrongPass = makeClient();
    const wp = await wrongPass.token('/portal/login');
    const r2 = await wrongPass.post('/portal/login',
      { body: { _csrf: wp, email: 'client@demo.sanad', password: 'wrong' } });
    check('مفيش فرق بين إيميل غلط وكلمة سر غلط',
      r1.status === r2.status && (r1.text.length - r2.text.length) ** 2 < 400);

    const forgotUnknown = makeClient();
    const fu = await forgotUnknown.token('/portal/forgot');
    const fr = await forgotUnknown.post('/portal/forgot',
      { body: { _csrf: fu, email: 'nobody@nowhere.test' } });
    check('استعادة كلمة السر مبتكشفش الإيميلات المسجّلة',
      (fr.location || '').includes('sent=1'));

    check('المسار القديم /admin بيرجّع 404 عادي',
      (await makeClient().get('/admin')).status === 404);
    check('و/admin/login كمان',
      (await makeClient().get('/admin/login')).status === 404);
    check('مفيش تلميح للمسار الحقيقي في 404',
      !(await makeClient().get('/admin')).text.includes(ADMIN));

    const publicHome = (await makeClient().get('/')).text;
    check('مفيش أي إشارة للوحة في الموقع العام', !publicHome.includes(ADMIN));

    section('و — مفاتيح مقدّمي الخدمة');
    // A settings page that renders a secret leaks it into the HTML, the browser
    // cache and any screen share. Storing one and showing one are different
    // things.
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('mail_api_key', 're_probe_secret_value')").run();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('google_client_secret', 'GOCSPX-probe-secret')").run();

    const mailTab = await adam.client.get(`${ADMIN}/settings?tab=mail`);
    check('مفتاح الإيميل مش بيترسم في الصفحة',
      !mailTab.text.includes('re_probe_secret_value'));

    const googleTab = await adam.client.get(`${ADMIN}/settings?tab=google`);
    check('ومفتاح جوجل كمان', !googleTab.text.includes('GOCSPX-probe-secret'));

    check('بس الصفحة بتقول إنهم محفوظين',
      mailTab.text.includes('محفوظ') || googleTab.text.includes('محفوظ'));

    // Saving the page without retyping them must not wipe them.
    const keepTok = await adam.client.token(`${ADMIN}/settings`);
    await adam.client.post(`${ADMIN}/settings`, {
      body: { _csrf: keepTok, site_name_ar: 'سند', mail_api_key: '' },
    });
    check('الحفظ من غير إعادة كتابتهم مش بيمسحهم',
      (db.prepare("SELECT value v FROM settings WHERE key = 'mail_api_key'").get() || {}).v ===
        're_probe_secret_value');

    db.prepare("UPDATE settings SET value = '' WHERE key IN ('mail_api_key','google_client_secret')").run();

    section('و — البيانات الحسّاسة');
    check('الرقم القومي مش بيظهر في صفحات الطلبات',
      (() => {
        const nid = db.prepare('SELECT national_id FROM users WHERE national_id IS NOT NULL LIMIT 1').get();
        return !nid || !page.includes(nid.national_id);
      })());

    check('كلمات السر مش بتظهر في أي صفحة',
      !page.includes('$2a$') && !page.includes('$2b$'));

    check('توكنات الرفع مش بتظهر للموظفين',
      (() => {
        const t = db.prepare('SELECT upload_token FROM requests WHERE id = 1').get();
        return !t.upload_token || !page.includes(t.upload_token);
      })());

    // ================================================== G. headers
    section('ز — الترويسات والنقل');
    const home = await makeClient().get('/');
    const headerChecks = [
      ['x-content-type-options', 'nosniff'],
      ['x-frame-options', null],
      ['referrer-policy', null],
    ];
    for (const [name, expected] of headerChecks) {
      const value = home.headers.get(name);
      check(`ترويسة ${name}`, expected ? value === expected : !!value, value || 'ناقصة');
    }

    check('صفحة المعاينة معزولة في sandbox', await (async () => {
      const row = db.prepare("SELECT id FROM mail_log WHERE outbox_file IS NOT NULL LIMIT 1").get();
      if (!row) return true;
      const r = await adam.client.get(`${ADMIN}/settings/mail/${row.id}/view`);
      return (r.headers.get('content-security-policy') || '').includes('sandbox');
    })());

    // ================================================== H. denial of service
    section('ح — الحمل والحجم');
    const huge = 'أ'.repeat(200000);
    const hugeTok = await adam.client.token(`${ADMIN}/requests/1`);
    const hugeRes = await adam.client.post(`${ADMIN}/requests/1/comments`, {
      body: { _csrf: hugeTok, body: huge },
    });
    check('تعليق ضخم مش بيكسّر السيرفر', [302, 400, 413].includes(hugeRes.status),
      `status ${hugeRes.status}`);
    check('السيرفر لسه شغّال', (await makeClient().get('/')).status === 200);

    const manyFields = {};
    for (let i = 0; i < 2000; i++) manyFields['f' + i] = 'x'.repeat(50);
    const floodRes = await adam.client.post(`${ADMIN}/requests/1/comments`, {
      body: { _csrf: hugeTok, body: 'ok', ...manyFields },
    });
    check('عدد حقول ضخم مش بيكسّر', [302, 400, 413].includes(floodRes.status),
      `status ${floodRes.status}`);

    const t0 = Date.now();
    await Promise.all(Array.from({ length: 60 }, () => makeClient().get('/')));
    check(`٦٠ طلب متوازي أقل من ٥ ثواني (${Date.now() - t0}ms)`, Date.now() - t0 < 5000);

    check('حد محاولات التتبّع شغّال', await (async () => {
      const c = makeClient();
      let blocked = false;
      for (let i = 0; i < 16; i++) {
        const t = await c.token('/track');
        const r = await c.post('/track', { body: { _csrf: t, ref: 'SND-26-XXXXX', phone: '111111111' } });
        if (r.text.includes('محاولات كثيرة')) { blocked = true; break; }
      }
      return blocked;
    })());

    section('سلامة السيرفر بعد الفحص');
    check('مفيش استثناءات غير معالَجة',
      !/UnhandledPromiseRejection|TypeError|ReferenceError/.test(H.state.serverOutput),
      H.state.serverOutput.slice(-200));
    check('قاعدة البيانات سليمة',
      db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok');
    check('مفاتيح العلاقات لسه مفعّلة',
      db.prepare('PRAGMA foreign_keys').get().foreign_keys === 1);
  } catch (err) {
    H.state.fail += 1;
    H.state.failures.push('استثناء غير متوقع: ' + err.message);
    console.error('\n\x1b[31mERROR:\x1b[0m', err);
  } finally {
    H.stop();
  }

  process.exit(H.report() ? 1 : 0);
})();
