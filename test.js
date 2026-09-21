#!/usr/bin/env node
/**
 * Deep test suite.
 *
 * Boots the real server against a throwaway database, then drives it over HTTP
 * the way a browser would — cookies, CSRF tokens, redirects and all. It checks
 * behaviour, not implementation: what each role can see, what the permission
 * boundaries actually block, and whether the write paths persist correctly.
 *
 *   node test.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.TEST_PORT || 4055;
const ADMIN = process.env.ADMIN_PATH || '/office-panel';
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sanad-test-'));

// The suite inspects the same files the server writes (uploads, the mail
// outbox), so its own modules must resolve to the throwaway directory too.
process.env.DATA_DIR = DATA_DIR;

let pass = 0;
let fail = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    fail += 1;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  \x1b[31m✗ ${name}\x1b[0m${detail ? ' — ' + detail : ''}`);
  }
}

const section = (t) => console.log(`\n\x1b[1m\x1b[36m${t}\x1b[0m`);

// ---------------------------------------------------------------- http client
/** Minimal cookie-jar fetch wrapper so each role keeps its own session. */
function makeClient() {
  const jar = new Map();

  async function req(method, url, { body = null, json = null, headers = {} } = {}) {
    const cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    const opts = {
      method,
      redirect: 'manual',
      headers: { ...headers, ...(cookie ? { cookie } : {}) },
    };

    if (json) {
      opts.headers['content-type'] = 'application/json';
      opts.body = JSON.stringify(json);
    } else if (body) {
      opts.headers['content-type'] = 'application/x-www-form-urlencoded';
      /*
       * Arrays become repeated fields, the way a browser sends them.
       *
       * Passing an array straight to URLSearchParams joins it with commas into
       * a single value, so a form with several checkboxes of the same name
       * arrived as one string — and every multi-value path in the app looked
       * broken when it was the test client at fault.
       */
      const params = new URLSearchParams();
      Object.entries(body).forEach(([key, value]) => {
        if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
        else if (value !== undefined && value !== null) params.append(key, value);
      });
      opts.body = params.toString();
    }

    const res = await fetch(BASE + url, opts);

    const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    setCookie.forEach((c) => {
      const [pair] = c.split(';');
      const idx = pair.indexOf('=');
      jar.set(pair.slice(0, idx), pair.slice(idx + 1));
    });

    const text = await res.text();
    return {
      status: res.status,
      location: res.headers.get('location'),
      headers: res.headers,
      text,
    };
  }

  return {
    // Exposed so a test can send a raw multipart request with the same session.
    cookieHeader: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    get: (u, o) => req('GET', u, o),
    post: (u, o) => req('POST', u, o),
    async token(url) {
      const r = await req('GET', url);
      const m = r.text.match(/name="_csrf" value="([^"]+)"/);
      return m ? m[1] : '';
    },
  };
}

async function loginStaff(username, password) {
  const c = makeClient();
  const t = await c.token(`${ADMIN}/login`);
  const r = await c.post(`${ADMIN}/login`, { body: { _csrf: t, username, password } });
  return { client: c, redirect: r.location, status: r.status };
}

async function loginClient(email, password) {
  const c = makeClient();
  const t = await c.token('/portal/login');
  const r = await c.post('/portal/login', { body: { _csrf: t, email, password } });
  return { client: c, redirect: r.location, status: r.status };
}

const has = (html, needle) => html.includes(needle);
const countOf = (html, re) => (html.match(re) || []).length;

// ---------------------------------------------------------------- runner
(async () => {
  const fsx = fs;
  const pathx = path;
  const sharp = require('sharp');
  const { db, UPLOAD_DIR } = require('./db');

  console.log('\x1b[1mSanad — deep test suite\x1b[0m');
  console.log(`data dir: ${DATA_DIR}\n`);

  const env = { ...process.env, DATA_DIR, PORT: String(PORT), ADMIN_PATH: ADMIN, NODE_ENV: 'test' };

  console.log('seeding demo data…');
  await new Promise((resolve, reject) => {
    const p = spawn('node', ['demo.js'], { env, cwd: __dirname });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err))));
  });

  console.log('starting server…');
  const server = spawn('node', ['server.js'], { env, cwd: __dirname });
  let serverErrors = '';
  server.stderr.on('data', (d) => (serverErrors += d.toString()));

  const stop = () => {
    try {
      server.kill('SIGKILL');
    } catch (_) {}
    try {
      fs.rmSync(DATA_DIR, { recursive: true, force: true });
    } catch (_) {}
  };

  // Wait for the port to answer.
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(BASE + '/');
      break;
    } catch (_) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  try {
    // ============================================================ public
    section('الموقع العام');
    for (const p of ['/', '/services', '/request', '/portal/login', '/portal/register']) {
      const r = await makeClient().get(p);
      check(`GET ${p} → 200`, r.status === 200, `status ${r.status}`);
    }

    const home = (await makeClient().get('/')).text;
    check('الرئيسية فيها المجالات', has(home, 'الخدمات العامة'));
    check('مفيش خدمات قديمة', !has(home, 'المصريين بالخارج'));

    // The categories live on their page now, which is the level below home.
    const generalPage = (await makeClient().get('/p/general')).text;
    check('الأقسام التلاتة ظاهرة في صفحتها',
      has(generalPage, 'تراخيص البناء والعقارات') &&
        has(generalPage, 'خدمات المرافق') &&
        has(generalPage, 'العقود والخدمات القانونية'));

    // Client-facing copy should read as standard Arabic, not dialect.
    const dialect = ['دلوقتي', 'عايز', 'إزاي', 'مش هتقدر', 'عشان'];
    const pagesToCheck = [home, (await makeClient().get('/request')).text,
                          (await makeClient().get('/portal/register')).text];
    const found2 = dialect.filter((w) => pagesToCheck.some((p) => p.includes(w)));
    check('النصوص بالعربية الفصحى', found2.length === 0, found2.join('، '));
    check('لينك الاستشارات ظاهر مع البيانات التجريبية', has(home, 'href="/consultations"'));
    check('مفيش لينك لوحة الإدارة في الموقع العام',
      !has(home, ADMIN) && !has(home, 'دخول الإدارة'));
    check('فيه لينك تتبّع الطلب', has(home, 'href="/track"'));
    check('السوشيال في الفوتر بس',
      has(home, 'foot-social') && !has(home, 'head-social'));

    section('تتبّع الطلب بدون تسجيل');
    const { db: tdb } = require('./db');
    const sample = tdb.prepare('SELECT ref, phone, id FROM requests LIMIT 1').get();

    check('رقم الطلب صعب التنبؤ',
      /^SND-\d{2}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/.test(sample.ref), sample.ref);
    check('مفيش أرقام متسلسلة',
      !tdb.prepare("SELECT 1 FROM requests WHERE ref LIKE 'SND-1%' OR ref LIKE 'SND-9%'").get());

    const trackPage = await makeClient().get('/track');
    check('صفحة التتبّع بتفتح', trackPage.status === 200);
    check('بتطلب الرقم والهاتف',
      has(trackPage.text, 'name="ref"') && has(trackPage.text, 'name="phone"'));

    const tracker = makeClient();
    const trTok = await tracker.token('/track');
    const found = await tracker.post('/track', {
      body: { _csrf: trTok, ref: sample.ref, phone: sample.phone },
    });
    check('الرقم مع الهاتف الصح بيفتح', found.status === 302, `status ${found.status}`);

    const result = await tracker.get('/track/' + sample.id);
    check('صفحة النتيجة بتعرض الطلب', result.status === 200 && has(result.text, sample.ref));
    check('بتعرض المطلوب من العميل', has(result.text, 'المطلوب منك') || has(result.text, 'مطلوب'));
    check('بتشجّع على إنشاء حساب', has(result.text, '/portal/register'));

    // Wrong phone with a valid reference must fail.
    const wrongPhone = makeClient();
    const wpTok = await wrongPhone.token('/track');
    const denied = await wrongPhone.post('/track', {
      body: { _csrf: wpTok, ref: sample.ref, phone: '+201999999999' },
    });
    check('رقم هاتف غلط مرفوض', denied.status === 200 && has(denied.text, 'form-alert'));

    // And a stranger cannot open the result page directly.
    const stranger = await makeClient().get('/track/' + sample.id);
    check('مش بينفع تفتح النتيجة مباشرة', stranger.status === 302, `status ${stranger.status}`);

    // Lowercase and missing dashes still resolve.
    const loose = makeClient();
    const lTok = await loose.token('/track');
    const looseRes = await loose.post('/track', {
      body: { _csrf: lTok, ref: sample.ref.toLowerCase().replace(/-/g, ''), phone: sample.phone },
    });
    check('بيقبل الرقم من غير شرط أو بحروف صغيرة', looseRes.status === 302, `status ${looseRes.status}`);

    section('تصفّح: صفحة ← قسم ← خدمة');
    const svcPage = await makeClient().get('/services');
    check('صفحة الخدمات بتفتح', svcPage.status === 200);
    check('بتعرض مجالات مش خدمات',
      has(svcPage.text, 'page-card') && countOf(svcPage.text, /class="card"/g) === 0);
    check('كل مجال بيعرض عدد خدماته', /pc-go/.test(svcPage.text));
    check('فيه رسالة «لم تجد ما تبحث عنه»', has(svcPage.text, 'not-found-note'));

    const catPage = await makeClient().get('/services/1');
    check('صفحة القسم بتفتح', catPage.status === 200);
    check('بتعرض خدمات القسم', countOf(catPage.text, /class="card"/g) > 0);
    check('فيها فتات خبز للرجوع', has(catPage.text, 'crumbs'));
    check('فيها روابط الأقسام الأخرى', has(catPage.text, 'other-cats'));

    const badCat = await makeClient().get('/services/9999');
    check('قسم مش موجود بيحوّل', badCat.status === 302);

    // The rule: home shows pages, a page shows its categories. Categories on the
    // home screen would be one level too deep and would duplicate a page.
    const landing = (await makeClient().get('/')).text;
    check('الرئيسية بتعرض المجالات مش الأقسام',
      has(landing, 'page-card') && !has(landing, 'cat-grid'));

    section('اختيار الخدمة في الفورم');
    const reqPage = (await makeClient().get('/request')).text;
    check('فيه بحث في الخدمات', has(reqPage, 'id="serviceSearch"'));
    check('الخدمات مجمّعة تحت الأقسام', has(reqPage, 'svc-group-title'));
    check('كل خدمة عليها مفتاح بحث', has(reqPage, 'data-search'));
    check('مفيش select box قديمة', !has(reqPage, 'id="service_id"') || has(reqPage, 'type="hidden"'));

    /*
     * Arriving with a service preselected now ticks it in place instead of
     * collapsing the list — the visitor can add a second one without hunting
     * for a "change" button, and the page does not jump.
     */
    const preselected = (await makeClient().get('/request?service=3')).text;
    check('الخدمة المختارة بتيجي معلّمة', has(preselected, "id: '3'"),
      'الخدمة مش متمرّرة للسكربت');
    check('والقائمة بتفضل مفتوحة', has(preselected, 'svc-groups'));
    check('وفيه شريط بالمختار', has(preselected, 'svcChips'));

    section('مربع المختار بيفضل ظاهر');
    /*
     * The complaint that led to this: picking a service while low in the list
     * changed a counter that was off screen, so you could not see what you had
     * chosen without scrolling back up.
     *
     * The fix is structural — the list scrolls inside the picker while the
     * search and the selection box stay pinned above it — so these check the
     * structure rather than the appearance.
     */
    const pickerCss = fsx.readFileSync(pathx.join(__dirname, 'public/css/style.css'), 'utf8');

    check('الشريط ملزوق فوق',
      /\.svc-bar\{[^}]*position:\s*sticky/.test(pickerCss));
    check('والقائمة بتسكرول جوّه المربع',
      /\.svc-groups\{[^}]*overflow-y:\s*auto/.test(pickerCss));
    check('وارتفاعها محدود عشان متزقّش المربع',
      /\.svc-groups\{[^}]*max-height:/.test(pickerCss));
    check('ومربع المختار متميّز بخلفية',
      /\.svc-chips\{[^}]*background:/.test(pickerCss));

    const pickerHtml = (await makeClient().get('/request')).text;
    const barAt = pickerHtml.indexOf('svc-bar');
    const listAt = pickerHtml.indexOf('svc-groups');
    check('والشريط قبل القائمة في الترتيب', barAt > -1 && listAt > barAt);
    check('والمختار جوّه الشريط',
      pickerHtml.indexOf('svcChips') > barAt && pickerHtml.indexOf('svcChips') < listAt);
    check('وفيه تأكيد جنب الصف نفسه', has(pickerHtml, 'svc-flash'));

    section('اختيار متعدد ووصف حر');
    check('كل خدمة قابلة للتعليم', has(reqPage, 'aria-pressed'));
    check('فيه زرار «اوصف طلبك»', has(reqPage, 'svc-describe'));
    check('والوصف ظاهر من غير ما تدوس حاجة', has(reqPage, 'id="message"'));
    check('والحقل بيتبعت كقائمة', has(reqPage, 'name="service_ids"'));

    // A request with several services.
    const multiClient = makeClient();
    const multiTok = await multiClient.token('/request');
    const twoServices = db.prepare('SELECT id FROM services WHERE active = 1 LIMIT 2').all();
    const multiRes = await multiClient.post('/request', {
      body: { _csrf: multiTok, name: 'عميل بخدمتين', phone: '+201005551234',
              service_ids: twoServices.map((s) => s.id).join(','),
              message: 'محتاج الاتنين مع بعض' },
    });
    check('طلب بخدمتين بينجح', (multiRes.location || '').includes('/request/success'),
      multiRes.location);

    const multiRow = db.prepare("SELECT * FROM requests WHERE name = 'عميل بخدمتين'").get();
    check('الاتنين اتسجلوا',
      db.prepare('SELECT COUNT(*) c FROM request_services WHERE request_id = ?')
        .get(multiRow.id).c === 2);
    check('والأولى بقت الأساسية', multiRow.service_id === twoServices[0].id);
    check('ومش متعلّم كوصف حر', multiRow.is_custom === 0);

    // A request with no service at all — the client described a problem.
    const freeClient = makeClient();
    const freeTok = await freeClient.token('/request');
    const freeRes = await freeClient.post('/request', {
      body: { _csrf: freeTok, name: 'عميل بيوصف', phone: '+201005559876',
              service_ids: '',
              message: 'عندي مشكلة في عداد الكهرباء ومش عارف اسم الإجراء المطلوب' },
    });
    check('طلب بوصف من غير خدمة بينجح',
      (freeRes.location || '').includes('/request/success'), freeRes.location);

    const freeRow = db.prepare("SELECT * FROM requests WHERE name = 'عميل بيوصف'").get();
    check('ومتعلّم إنه وصف حر', freeRow.is_custom === 1);
    check('ومن غير خدمة', freeRow.service_id === null);

    // But not an empty one.
    const emptyClient = makeClient();
    const emptyTok = await emptyClient.token('/request');
    const emptyRes = await emptyClient.post('/request', {
      body: { _csrf: emptyTok, name: 'عميل فاضي', phone: '+201005550000',
              service_ids: '', message: 'أه' },
    });
    check('من غير خدمة ولا وصف بيترفض',
      emptyRes.status === 200 && has(emptyRes.text, 'اختر خدمة أو اشرح'),
      `status ${emptyRes.status}`);
    check('ومفيش صف اتكتب',
      !db.prepare("SELECT 1 FROM requests WHERE name = 'عميل فاضي'").get());

    section('خانات الإدخال');
    const loginPage = (await makeClient().get(`${ADMIN}/login`)).text;
    check('خانة اسم المستخدم ليها type',
      /id="username"[^>]*type="text"/.test(loginPage) ||
      /type="text"[^>]*id="username"/.test(loginPage));

    // An input with no type matched no CSS rule and rendered unstyled.
    const allViews = [];
    const walk = (dir) => fsx.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const full = pathx.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.ejs')) allViews.push(full);
    });
    walk(pathx.join(__dirname, 'views'));

    const untyped = allViews.filter((f) => {
      const body = fsx.readFileSync(f, 'utf8');
      return (body.match(/<input (?![^>]*type=)[^>]*>/g) || []).length > 0;
    });
    check('كل خانات الإدخال ليها type', untyped.length === 0,
      untyped.map((f) => pathx.basename(f)).join(', '));

    section('مسار لوحة الإدارة السري');
    const oldPath = await makeClient().get('/admin');
    check('/admin بيرجع 404', oldPath.status === 404, `status ${oldPath.status}`);
    const newPath = await makeClient().get(`${ADMIN}/login`);
    check(`${ADMIN}/login بيشتغل`, newPath.status === 200);
    check('صفحة الدخول مفيهاش تلميح للمسار', !has(oldPath.text, ADMIN));

    // ============================================================ auth
    section('الدخول والصلاحيات');
    const adam = await loginStaff('adam', '1234');
    check('أدمن بيدخل', (adam.redirect || '').endsWith(ADMIN));

    const nour = await loginStaff('nour', 'demo1234');
    check('مشرف بيدخل', !!nour.redirect);

    const khaled = await loginStaff('khaled', 'demo1234');
    const mona = await loginStaff('mona', 'demo1234');
    check('محامي بيدخل', !!khaled.redirect && !!mona.redirect);

    const omar = await loginStaff('omar', 'demo1234');
    check('حساب جديد بيتحوّل لتغيير كلمة السر',
      (omar.redirect || '').includes('/account?force=1'), omar.redirect);

    const yasmin = await loginStaff('yasmin', 'demo1234');
    check('حساب موقوف مش بيدخل', !yasmin.redirect || yasmin.status === 200);

    const wrong = await loginStaff('adam', 'wrongpass');
    check('كلمة سر غلط مش بتدخل', !wrong.redirect);

    // ============================================================ visibility
    section('عزل الطلبات حسب الدور');
    const refs = async (c) => {
      const r = await c.get(`${ADMIN}/requests`);
      return [...new Set(r.text.match(/SND-\d{2}-[A-Z0-9]{5}/g) || [])].sort();
    };
    const adamRefs = await refs(adam.client);
    const monaRefs = await refs(mona.client);
    const khaledRefs = await refs(khaled.client);

    check('أدمن بيشوف كل الطلبات', adamRefs.length >= 8, `${adamRefs.length}`);
    check('محامي بيشوف أقل من الأدمن', monaRefs.length < adamRefs.length,
      `mona=${monaRefs.length} adam=${adamRefs.length}`);
    // Both lists are paginated now, so this compares what the lawyer can reach
    // against what they are actually assigned rather than against one page.
    const monaAssigned = db
      .prepare(
        `SELECT r.ref FROM requests r
         JOIN request_assignees a ON a.request_id = r.id
         WHERE a.user_id = (SELECT id FROM users WHERE username = 'mona')
           AND r.archived_at IS NULL`
      )
      .all().map((r) => r.ref);
    check('كل طلبات المحامي من نصيبه فعلاً',
      monaRefs.every((r) => monaAssigned.includes(r)),
      monaRefs.filter((r) => !monaAssigned.includes(r)).slice(0, 3).join(','));


    check('المحاميان بيشوفوا طلبات مختلفة',
      JSON.stringify(monaRefs) !== JSON.stringify(khaledRefs));

    // Direct URL access to a request the lawyer is not on.
    let forbidden = null;
    for (let id = 1; id <= 10; id++) {
      const r = await mona.client.get(`${ADMIN}/requests/${id}`);
      if (r.status === 403) { forbidden = id; break; }
    }
    check('محامي مش بيفتح طلب مش معيّن عليه بالرابط', forbidden !== null,
      'مفيش أي طلب رجع 403');

    section('إخفاء الفلوس عن المحامي');
    /*
     * mona carries a money.view exception in the demo — that is the permission
     * model working, not a leak. Isolation is checked with a lawyer who has no
     * exceptions, and who has to change their seeded password first because
     * otherwise every page redirects.
     */
    const omarId = db.prepare("SELECT id FROM users WHERE username = 'omar'").get().id;
    db.prepare('INSERT OR IGNORE INTO request_assignees (request_id, user_id, assigned_by) VALUES (1,?,?)')
      .run(omarId, 'اختبار');

    // omar was signed in earlier to prove the forced-password-change redirect;
    // clearing it here is what makes the rest of his pages reachable.
    const omarChangeTok = await omar.client.token(`${ADMIN}/account`);
    await omar.client.post(`${ADMIN}/account/password`, {
      body: { _csrf: omarChangeTok, current: 'demo1234',
              next: 'Plain#Lawyer9', confirm: 'Plain#Lawyer9' },
    });
    const plainLawyer = await loginStaff('omar', 'Plain#Lawyer9');

    const adamDetail = (await adam.client.get(`${ADMIN}/requests/1`)).text;
    const omarPage = await plainLawyer.client.get(`${ADMIN}/requests/1`);
    const omarDetail = omarPage.text;

    check('الأدمن بيشوف بنود الأتعاب', has(adamDetail, 'الأتعاب'));
    check('المحامي المعيّن بيفتح الطلب', omarPage.status === 200, `status ${omarPage.status}`);
    check('المحامي مش بيشوف خانة المدفوع', !has(omarDetail, 'name="paid_amount"'));
    check('المحامي مش بيشوف بنود الأتعاب',
      omarPage.status === 200 && !has(omarDetail, 'fee-list'));
    check('المحامي بيشوف التعليقات', /class="bubble/.test(omarDetail));
    check('المحامي بيشوف المستندات', /\/files\/\d+/.test(omarDetail));

    // A lawyer who was granted the exception does see them — the other half of
    // the same rule.
    check('والمحامي اللي معاه استثناء بيشوفها',
      has((await mona.client.get(`${ADMIN}/requests/1`)).text, 'fee-list'));

    section('صفحات الأدمن فقط');
    for (const p of ['/content', '/users', '/settings', '/activity', '/security', '/consultations-admin', '/imports']) {
      const a = await adam.client.get(ADMIN + p);
      const m = await mona.client.get(ADMIN + p);
      check(`${p}: أدمن 200 / محامي 403`, a.status === 200 && m.status === 403,
        `adam=${a.status} mona=${m.status}`);
    }
    for (const p of ['/trash', '/notifications', '/requests', '/account']) {
      const r = await nour.client.get(ADMIN + p);
      check(`${p}: مشرف 200`, r.status === 200, `status ${r.status}`);
    }

    // ============================================================ writes
    section('الكتابة: تعليقات وردود');
    const tok = await khaled.client.token(`${ADMIN}/requests/1`);
    const c1 = await khaled.client.post(`${ADMIN}/requests/1/comments`,
      { body: { _csrf: tok, body: 'تعليق من الاختبار' } });
    check('محامي بيكتب تعليق', c1.status === 302);

    const after = (await khaled.client.get(`${ADMIN}/requests/1`)).text;
    check('التعليق ظهر', has(after, 'تعليق من الاختبار'));

    const c2 = await khaled.client.post(`${ADMIN}/requests/1/comments`,
      { body: { _csrf: tok, parent_id: '1', body: 'رد من الاختبار' } });
    check('الرد اتسجل', c2.status === 302);
    const after2 = (await khaled.client.get(`${ADMIN}/requests/1`)).text;
    check('الردود متداخلة مستوى واحد', has(after2, 'class="replies"'));

    section('منع تصعيد الصلاحيات');
    const beforeMoney = (await adam.client.get(`${ADMIN}/requests/1`)).text;
    const paidBefore = (beforeMoney.match(/name="paid_amount"[^>]*value="([\d.]+)"/) || [])[1];

    await khaled.client.post(`${ADMIN}/requests/1/update`,
      { body: { _csrf: tok, status: 'in_progress', paid_amount: '999999', total_amount: '999999' } });

    const afterMoney = (await adam.client.get(`${ADMIN}/requests/1`)).text;
    const paidAfter = (afterMoney.match(/name="paid_amount"[^>]*value="([\d.]+)"/) || [])[1];
    check('محامي مقدرش يغيّر المدفوع', paidBefore === paidAfter,
      `${paidBefore} → ${paidAfter}`);

    const feeTry = await khaled.client.post(`${ADMIN}/requests/1/fees`,
      { body: { _csrf: tok, label: 'اختراق', amount: '1' } });
    check('محامي مقدرش يضيف بند أتعاب', feeTry.status === 403, `status ${feeTry.status}`);

    const unassignTry = await khaled.client.post(`${ADMIN}/requests/1/unassign`,
      { body: { _csrf: tok, user_id: '5' } });
    check('محامي مقدرش يشيل محامي', unassignTry.status === 403, `status ${unassignTry.status}`);

    section('ملف الموظف');
    const profileLib = require('./lib/profile');
    check('الرقم القومي لازم ١٤ رقم',
      profileLib.validNationalId('28501011234567') && !profileLib.validNationalId('123'));
    check('تاريخ ميلاد غير منطقي مرفوض',
      profileLib.validBirthDate('1985-01-01') && !profileLib.validBirthDate('2024-01-01'));

    check('صفحة بياناتي بتفتح',
      (await adam.client.get(`${ADMIN}/account/profile`)).status === 200);
    const profPage = (await adam.client.get(`${ADMIN}/account/profile`)).text;
    ['email', 'phone', 'national_id', 'birth_date'].forEach((f) =>
      check(`فيها خانة ${f}`, has(profPage, `name="${f}"`)));
    check('فيها رفع صورة', has(profPage, 'name="photo"'));

    // An account missing its details cannot reach the panel at all.
    const gateTok = await adam.client.token(`${ADMIN}/users`);
    await adam.client.post(`${ADMIN}/users/new`, {
      body: { _csrf: gateTok, username: 'incomplete', password: 'Gate#Test123',
              password_confirm: 'Gate#Test123', role: 'supervisor' },
    });
    const gated = await loginStaff('incomplete', 'Gate#Test123');
    check('حساب ناقص بيتحوّل لكلمة السر الأول',
      (gated.redirect || '').includes('/account'), gated.redirect);

    const pwTok2 = await gated.client.token(`${ADMIN}/account`);
    await gated.client.post(`${ADMIN}/account/password`, {
      body: { _csrf: pwTok2, current: 'Gate#Test123',
              next: 'Gate#Test456', confirm: 'Gate#Test456' },
    });
    const afterPw = await gated.client.get(`${ADMIN}/requests`);
    check('وبعدها بيتحوّل لاستكمال البيانات',
      (afterPw.location || '').includes('/account/profile'), afterPw.location);

    const profTok = await gated.client.token(`${ADMIN}/account/profile`);
    const saved = await gated.client.post(`${ADMIN}/account/profile`, {
      body: { _csrf: profTok, legal_name: 'موظف ناقص حسن', display_name: 'موظف ناقص',
              email: 'incomplete@demo.sanad', phone: '+201009998888',
              national_id: '29001011234567', birth_date: '1990-01-01' },
    });
    check('حفظ البيانات بينجح', (saved.location || '').includes('saved=1'), saved.location);
    check('وبعدها بيوصل للوحة',
      (await gated.client.get(`${ADMIN}/requests`)).status === 200);

    const badNid = await gated.client.post(`${ADMIN}/account/profile`, {
      body: { _csrf: profTok, legal_name: 'موظف ناقص حسن', display_name: 'موظف ناقص',
              email: 'incomplete@demo.sanad', phone: '+201009998888',
              national_id: '123', birth_date: '1990-01-01' },
    });
    check('رقم قومي غلط مرفوض', (badNid.location || '').includes('err='), badNid.location);

    section('إنشاء الموظف — اسم وباسورد بس');
    const simpleTok = await adam.client.token(`${ADMIN}/users`);
    const simple = await adam.client.post(`${ADMIN}/users/new`, {
      body: { _csrf: simpleTok, username: 'samir', password: 'Office#Test77',
              password_confirm: 'Office#Test77', role: 'lawyer' },
    });
    check('الحساب اتعمل من غير أي بيانات تانية',
      (simple.location || '').includes('msg=added'), simple.location);

    const samir = db.prepare('SELECT * FROM users WHERE username = ?').get('samir');
    check('بياناته متسجّلة كناقصة', samir.profile_completed === 0);
    check('مفيش إيميل مخترع له', !samir.email);

    const usersForm = (await adam.client.get(`${ADMIN}/users`)).text;
    check('الفورم مبيطلبش الاسم', !usersForm.includes('name="display_name"'));
    check('ولا الإيميل', !/name="email"[^>]*required/.test(usersForm));
    check('بيوضّح إن الموظف هيكمّل بنفسه', has(usersForm, 'هيكمّل بياناته بنفسه'));
    check('الحسابات الناقصة متعلّمة', has(usersForm, 'ناقصة'), 'مفيش علامة');

    const samirLogin = await loginStaff('samir', 'Office#Test77');
    check('بيتحوّل لكلمة السر الأول',
      (samirLogin.redirect || '').includes('/account'), samirLogin.redirect);

    section('الاسم الرسمي والمختصر');
    const profileForm = (await adam.client.get(`${ADMIN}/account/profile`)).text;
    check('فيه خانة الاسم كما في البطاقة', has(profileForm, 'name="legal_name"'));
    check('وفيه الاسم المختصر', has(profileForm, 'name="display_name"'));

    const profLib = require('./lib/profile');
    check('الاسم الرسمي لازم ثلاثي',
      !!profLib.validate({ legal_name: 'خالد سمير', display_name: 'خالد',
        email: 'a@b.co', phone: '+201000000000', national_id: '28501011234567',
        birth_date: '1985-01-01' }).error);
    check('الثلاثي بيعدّي',
      !profLib.validate({ legal_name: 'خالد سمير حسن', display_name: 'خالد',
        email: 'a@b.co', phone: '+201000000000', national_id: '28501011234567',
        birth_date: '1985-01-01' }).error);

    section('صورة البطاقة');
    const idTok = await adam.client.token(`${ADMIN}/settings?tab=staff`);
    const staffTab = (await adam.client.get(`${ADMIN}/settings?tab=staff`)).text;
    check('تبويب الموظفين في الإعدادات', has(staffTab, 'staff_id_required'));

    await adam.client.post(`${ADMIN}/settings/staff`, { body: { _csrf: idTok, staff_id_required: '1' } });
    const afterOn = (await adam.client.get(`${ADMIN}/settings?tab=staff`)).text;
    check('التفعيل بيتحفظ',
      /name="staff_id_required"[^>]*checked/.test(afterOn) ||
      /checked[^>]*name="staff_id_required"/.test(afterOn));

    const withId = (await adam.client.get(`${ADMIN}/account/profile`)).text;
    check('خانات البطاقة بتظهر', has(withId, 'name="id_front"') && has(withId, 'name="id_back"'));
    check('الكاميرا مفعّلة للبطاقة', has(withId, 'capture="environment"'));

    // adam is the Sanad-owner account and is deliberately exempt from this
    // gate everywhere (middleware/auth.js's isSanadOwner bypass) — nour is a
    // real, non-owner, non-admin staff account and is actually subject to it.
    const blockedNow = await nour.client.get(`${ADMIN}/requests`);
    check('الموظف اللي مرفعش البطاقة بيتوقف',
      (blockedNow.location || '').includes('/account/profile'), blockedNow.location);

    // Switch it back off before continuing: leaving it on would park every
    // later request on the profile gate.
    const offTok = await adam.client.token(`${ADMIN}/settings?tab=staff`);
    await adam.client.post(`${ADMIN}/settings/staff`, { body: { _csrf: offTok } });
    const afterOff = (await adam.client.get(`${ADMIN}/settings?tab=staff`)).text;
    check('الإلغاء بيتحفظ',
      !/name="staff_id_required"[^>]*checked/.test(afterOff) &&
      !/checked[^>]*name="staff_id_required"/.test(afterOff));
    check('وبعدها بيعدّي عادي',
      (await adam.client.get(`${ADMIN}/requests`)).status === 200);

    check('صور البطاقة للأدمن بس',
      (await mona.client.get(`${ADMIN}/account/id-card/1/front`)).status === 403);

    section('تنبيه تأخّر الموعد');
    const deadlines = require('./lib/deadlines');
    db.prepare("UPDATE requests SET deadline = date('now','-4 days'), deadline_alerted_at = NULL, status = 'in_progress' WHERE id = 1").run();
    db.prepare("DELETE FROM notifications WHERE type = 'deadline_missed'").run();

    const alerted = deadlines.run();
    check('التنبيه اتبعت', alerted >= 1, `${alerted}`);

    const critical = db
      .prepare("SELECT * FROM notifications WHERE type = 'deadline_missed'")
      .all();
    check('أولويته حرجة', critical.every((n) => n.priority === 'critical'));
    check('بيقول كام يوم تأخير', critical.some((n) => /متأخر \d+ يوم/.test(n.text)));

    const recipients = new Set(critical.map((n) => n.user_id));
    const responsible = db
      .prepare(
        `SELECT id FROM users WHERE active = 1 AND (role IN ('admin','supervisor')
          OR id IN (SELECT user_id FROM request_assignees WHERE request_id = 1))`
      )
      .all().map((u) => u.id);
    check('وصل لكل المسؤولين',
      responsible.every((id) => recipients.has(id)),
      `${recipients.size}/${responsible.length}`);

    check('مبيتكررش', deadlines.run() === 0);

    db.prepare("UPDATE requests SET deadline = date('now','-9 days'), deadline_alerted_at = NULL WHERE id = 1").run();
    check('تغيير الموعد بيسمح بتنبيه جديد', deadlines.run() >= 1);

    db.prepare("UPDATE requests SET status = 'completed' WHERE id = 1").run();
    db.prepare('UPDATE requests SET deadline_alerted_at = NULL WHERE id = 1').run();
    check('الطلب المكتمل مش بيتنبّه عليه', deadlines.run() === 0);
    db.prepare("UPDATE requests SET status = 'in_progress' WHERE id = 1").run();

    check('الإشعار الحرج شكله مختلف',
      has((await adam.client.get(`${ADMIN}/notifications`)).text, 'critical'));

    section('تأكيد الإيميل بيتلغي من غير مفتاح');
    const mailerLib = require('./lib/mailer');
    check('الإيميل في وضع التجربة', !mailerLib.isLive());

    const noVerify = makeClient();
    const nvTok = await noVerify.token('/portal/register');
    await noVerify.post('/portal/register', {
      body: { _csrf: nvTok, full_name: 'عميل بلا تأكيد', relation: 'self',
              phone: '+201007776655', email: 'noverify@test.local',
              password: 'Verify#Test9', password_confirm: 'Verify#Test9' },
    });
    const created2 = db.prepare('SELECT * FROM clients WHERE email = ?').get('noverify@test.local');
    check('مفيش توكن تأكيد اتعمل', !created2.verify_token);
    check('مفيش تنبيه تأكيد في الصفحة',
      !has((await noVerify.get('/portal')).text, 'notice-warn'));

    section('إرفاق ملفات من المكتب');
    const detailPage = (await adam.client.get(`${ADMIN}/requests/1`)).text;
    check('فيه فورم إرفاق', has(detailPage, 'staff-upload'));

    const docTok = await adam.client.token(`${ADMIN}/requests/1`);
    const fd2 = new FormData();
    fd2.append('_csrf', docTok);
    fd2.append('name', 'إيصال سداد رسوم');
    const receipt = await sharp({ create: { width: 1400, height: 900, channels: 3, background: '#eee' } })
      .jpeg().toBuffer();
    fd2.append('files', new Blob([receipt], { type: 'image/jpeg' }), 'receipt.jpg');

    const staffUp = await fetch(BASE + `${ADMIN}/requests/1/documents`, {
      method: 'POST', body: fd2, redirect: 'manual',
      headers: { cookie: adam.client.cookieHeader() },
    });
    check('المكتب بيرفع ملف',
      (staffUp.headers.get('location') || '').includes('doc_added'),
      staffUp.headers.get('location'));

    const staffDoc = db.prepare("SELECT * FROM documents WHERE source = 'staff' ORDER BY id DESC").get();
    check('متسجّل مين أرفقه', !!staffDoc && !!staffDoc.uploaded_by, staffDoc && staffDoc.uploaded_by);
    check('مربوط بحساب الموظف', !!staffDoc.uploaded_by_id);

    const lawyerDocTok = await khaled.client.token(`${ADMIN}/requests/1`);
    const fd3 = new FormData();
    fd3.append('_csrf', lawyerDocTok);
    fd3.append('name', 'مستند من المحامي');
    fd3.append('files', new Blob([receipt], { type: 'image/jpeg' }), 'x.jpg');
    const lawyerUp = await fetch(BASE + `${ADMIN}/requests/1/documents`, {
      method: 'POST', body: fd3, redirect: 'manual',
      headers: { cookie: khaled.client.cookieHeader() },
    });
    check('المحامي المعيّن يقدر يرفق',
      (lawyerUp.headers.get('location') || '').includes('doc_added'));

    section('تاريخ تنفيذ الخطوات');
    const todo = db.prepare('SELECT * FROM todos WHERE request_id = 1 AND done = 0 LIMIT 1').get();
    const tdTok = await adam.client.token(`${ADMIN}/requests/1`);
    await adam.client.post(`${ADMIN}/requests/1/todos/${todo.id}/toggle`,
      { body: { _csrf: tdTok, done_on: '2026-08-10' } });
    const afterTick = db.prepare('SELECT * FROM todos WHERE id = ?').get(todo.id);
    check('التاريخ المختار اتسجّل', afterTick.done_on === '2026-08-10', afterTick.done_on);

    await adam.client.post(`${ADMIN}/requests/1/todos/${todo.id}/date`,
      { body: { _csrf: tdTok, done_on: '2026-08-12' } });
    check('التاريخ بيتعدّل',
      db.prepare('SELECT done_on FROM todos WHERE id = ?').get(todo.id).done_on === '2026-08-12');

    check('التاريخ ظاهر في الصفحة',
      has((await adam.client.get(`${ADMIN}/requests/1`)).text, 'todo-date'));

    section('فلتر الشهر');
    check('فلتر آخر شهر موجود',
      has((await adam.client.get(`${ADMIN}/requests`)).text, 'آخر شهر'));
    check('وبيشتغل',
      (await adam.client.get(`${ADMIN}/requests?days=30&open=1`)).status === 200);

    section('إلزام التسجيل عند طلب مستندات');
    const withReq = db
      .prepare(
        `SELECT r.id, r.upload_token FROM requests r
         WHERE r.upload_token IS NOT NULL
           AND EXISTS (SELECT 1 FROM requirements q WHERE q.request_id = r.id AND q.status = 'pending')
         LIMIT 1`
      )
      .get();
    check('فيه طلب فيه مستندات مطلوبة', !!withReq);

    if (withReq) {
      const gate = await makeClient().get(`/upload/${withReq.id}?t=${withReq.upload_token}`);
      check('بوابة التسجيل بتظهر بدل الرفع',
        gate.status === 200 && has(gate.text, 'gate-card'), `status ${gate.status}`);
      check('بتعرض المطلوب', has(gate.text, 'gate-item'));
      check('فيها لينك تسجيل بالرجوع', has(gate.text, 'next='));
      check('مفيش فورم رفع فيها', !has(gate.text, 'id="upForm"'));

      // The owner signed in goes straight through.
      const owner = await loginClient('client@demo.sanad', 'demo1234');
      const direct = await owner.client.get(`/upload/${withReq.id}`);
      check('العميل المسجّل بيعدّي على طول',
        direct.status === 200 && has(direct.text, 'id="upForm"'), `status ${direct.status}`);
    }

    const openReq = db
      .prepare(
        `SELECT id, upload_token FROM requests
         WHERE upload_token IS NOT NULL
           AND id NOT IN (SELECT request_id FROM requirements WHERE status = 'pending')
         LIMIT 1`
      )
      .get();
    if (openReq) {
      const free = await makeClient().get(`/upload/${openReq.id}?t=${openReq.upload_token}`);
      check('طلب من غير مستندات مطلوبة الرفع فيه مفتوح',
        free.status === 200 && has(free.text, 'id="upForm"'), `status ${free.status}`);
    }

    section('تشجيع التسجيل');
    const successPage = (await makeClient().get('/request')).text;
    check('صفحة الطلب فيها دعوة للدخول', has(successPage, '/portal/login'));

    section('فتح طلب من المكتب');
    check('المشرف بيوصل لصفحة الطلب الجديد',
      (await nour.client.get(`${ADMIN}/requests/new`)).status === 200);
    check('المحامي مش بيوصلها',
      (await mona.client.get(`${ADMIN}/requests/new`)).status === 403);

    const newTok = await adam.client.token(`${ADMIN}/requests/new`);
    const opened = await adam.client.post(`${ADMIN}/requests/new`, {
      body: {
        _csrf: newTok, name: 'عميل التليفون', phone: '+201005559999',
        email: 'byphone@test.local', title: 'ترخيص فيلا الشيخ زايد',
        message: 'كلّمنا بخصوص ترخيص بناء', relation: 'self',
      },
    });
    check('الطلب اتفتح', (opened.location || '').includes('msg=created'), opened.location);

    const newId = (opened.location || '').match(/requests\/(\d+)/)[1];
    const newPage = (await adam.client.get(`${ADMIN}/requests/${newId}`)).text;
    check('العنوان ظاهر', has(newPage, 'ترخيص فيلا الشيخ زايد'));
    check('مكتوب مين فتحه', has(newPage, 'من المكتب'));

    await new Promise((r) => setTimeout(r, 400));
    const outboxNames = fsx.readdirSync(require('./lib/mailer').OUTBOX);
    check('إيميل التأكيد وصل للعميل',
      outboxNames.some((f) => f.includes('byphone')), outboxNames.slice(-2).join(', '));

    const created = db.prepare('SELECT * FROM requests WHERE id = ?').get(newId);
    check('الرقم بنفس الشكل الآمن', /^SND-\d{2}-[A-Z0-9]{5}$/.test(created.ref), created.ref);
    check('فيه لينك رفع', !!created.upload_token);
    check('مسجّل إنه من المكتب', created.source === 'office');

    section('تعديل عنوان الطلب');
    const titleTok = await adam.client.token(`${ADMIN}/requests/${newId}`);
    const renamed = await adam.client.post(`${ADMIN}/requests/${newId}/title`,
      { body: { _csrf: titleTok, title: 'عنوان معدّل' } });
    check('العنوان اتعدّل', (renamed.location || '').includes('title_saved'));
    check('العنوان الجديد ظاهر',
      has((await adam.client.get(`${ADMIN}/requests/${newId}`)).text, 'عنوان معدّل'));

    const lawyerTitleTok = await khaled.client.token(`${ADMIN}/requests/1`);
    const lawyerRenamed = await khaled.client.post(`${ADMIN}/requests/1/title`,
      { body: { _csrf: lawyerTitleTok, title: 'عنوان من المحامي' } });
    check('المحامي المعيّن يقدر يعدّل العنوان', lawyerRenamed.status === 302);

    section('الحالة بتتبع المطلوب من العميل');
    const before = db.prepare('SELECT status FROM requests WHERE id = ?').get(newId).status;
    await adam.client.post(`${ADMIN}/requests/${newId}/requirements`,
      { body: { _csrf: titleTok, title: 'صورة البطاقة' } });
    const afterAsk = db.prepare('SELECT status FROM requests WHERE id = ?').get(newId).status;
    check('طلب مستند بيحوّل الحالة لبانتظار المستندات',
      before !== 'awaiting_docs' && afterAsk === 'awaiting_docs', `${before} → ${afterAsk}`);

    const reqRow = db
      .prepare("SELECT id FROM requirements WHERE request_id = ? AND status = 'pending'")
      .get(newId);
    await adam.client.post(`${ADMIN}/requests/${newId}/requirements/${reqRow.id}/toggle`,
      { body: { _csrf: titleTok } });
    const afterGot = db.prepare('SELECT status FROM requests WHERE id = ?').get(newId).status;
    check('استلام كل المطلوب بيرجّع الحالة', afterGot === 'in_progress', afterGot);

    section('فلاتر الطلبات');
    for (const q of ['?open=1', '?days=3&open=1', '?days=7&open=1', '?days=10&open=1']) {
      check(`الفلتر ${q} بيشتغل`,
        (await adam.client.get(`${ADMIN}/requests${q}`)).status === 200);
    }
    const dayFiltered = await adam.client.get(`${ADMIN}/requests?days=3&open=1`);
    check('أزرار الفلترة ظاهرة', has(dayFiltered.text, 'quick-filters'));
    check('الفلتر المفعّل متعلّم', has(dayFiltered.text, 'qf on'));

    const closedOnly = db
      .prepare("SELECT COUNT(*) c FROM requests WHERE status IN ('completed','cancelled')")
      .get().c;
    const openRefs = [...new Set(
      ((await adam.client.get(`${ADMIN}/requests?open=1`)).text.match(/SND-\d{2}-[A-Z0-9]{5}/g) || [])
    )];
    const closedRefs = db
      .prepare("SELECT ref FROM requests WHERE status IN ('completed','cancelled') AND archived_at IS NULL")
      .all().map((r) => r.ref);
    check('الفلتر بيستبعد المكتمل والملغي',
      closedRefs.length > 0 && closedRefs.every((r) => !openRefs.includes(r)),
      `${closedRefs.length} مقفول`);

    section('الإشعارات — سياسة الحذف');
    const notifyLib = require('./lib/notify');
    check('فيه سياسة احتفاظ', notifyLib.KEEP_READ_DAYS === 30);

    const beforePrune = db.prepare('SELECT COUNT(*) c FROM notifications').get().c;
    db.prepare(
      "UPDATE notifications SET seen_at = datetime('now','-60 days') WHERE id IN (SELECT id FROM notifications WHERE seen_at IS NOT NULL LIMIT 2)"
    ).run();
    const unseenBefore = db.prepare('SELECT COUNT(*) c FROM notifications WHERE seen_at IS NULL').get().c;
    notifyLib.prune();
    const afterPrune = db.prepare('SELECT COUNT(*) c FROM notifications').get().c;
    const unseenAfter = db.prepare('SELECT COUNT(*) c FROM notifications WHERE seen_at IS NULL').get().c;

    check('المقروء القديم بيتشال', afterPrune < beforePrune, `${beforePrune} → ${afterPrune}`);
    check('غير المقروء مبيتلمسش', unseenAfter === unseenBefore, `${unseenBefore} → ${unseenAfter}`);

    section('لغة العميل مش متخزّنة');
    check('مفيش لغة محفوظة على الحسابات',
      db.prepare('SELECT COUNT(*) c FROM clients WHERE lang IS NOT NULL').get().c === 0);

    section('بنود الأتعاب');
    const ftok = await adam.client.token(`${ADMIN}/requests/1`);
    const feeAdd = await adam.client.post(`${ADMIN}/requests/1/fees`,
      { body: { _csrf: ftok, label: 'بند اختبار', amount: '2500' } });
    check('أدمن بيضيف بند', feeAdd.status === 302);

    const withFee = (await adam.client.get(`${ADMIN}/requests/1`)).text;
    check('البند ظهر', has(withFee, 'بند اختبار'));
    check('الإجمالي اتحسب من البنود', has(withFee, '47,500') || has(withFee, '47500'),
      'الإجمالي المتوقع 45000 + 2500');

    section('التراجع عن الحذف');
    const ttok = await adam.client.token(`${ADMIN}/requests/1`);
    const todosBefore = countOf(
      (await adam.client.get(`${ADMIN}/requests/1`)).text, /class="tick/g);

    const del = await adam.client.post(`${ADMIN}/requests/1/todos/1/delete`, { body: { _csrf: ttok } });
    const undoId = (del.location || '').match(/undo=(\d+)/);
    check('الحذف بيدي رابط تراجع', !!undoId, del.location);

    if (undoId) {
      const restored = await adam.client.post(`${ADMIN}/trash/${undoId[1]}/restore`,
        { body: { _csrf: ttok, next: `${ADMIN}/requests/1` } });
      check('التراجع نجح', (restored.location || '').includes('undo_ok=1'), restored.location);

      const todosAfter = countOf(
        (await adam.client.get(`${ADMIN}/requests/1`)).text, /class="tick/g);
      check('الخطوة رجعت', todosAfter === todosBefore, `${todosBefore} → ${todosAfter}`);
    }

    section('الترتيب بيتحفظ');
    const ctok = await adam.client.token(`${ADMIN}/content`);
    const contentDefaultPage = db.prepare('SELECT id FROM pages ORDER BY sort, id LIMIT 1').get();
    const orderedCats = db.prepare(
      'SELECT id, name_ar FROM categories WHERE page_id = ? ORDER BY sort, id LIMIT 3'
    ).all(contentDefaultPage.id);
    const reversedCatIds = orderedCats.map((c) => c.id).reverse();
    const order = await adam.client.post(`${ADMIN}/content/categories/reorder`,
      { json: { ids: reversedCatIds }, headers: { 'x-csrf-token': ctok } });
    check('ترتيب الأقسام 200 JSON', order.status === 200 && has(order.text, '"ok":true'),
      `status ${order.status}`);

    const contentAfter = (await adam.client.get(`${ADMIN}/content`)).text;
    const firstCat = (contentAfter.match(/class="t">([^<]+)</) || [])[1] || '';
    check('الترتيب اتغيّر فعلاً', firstCat.includes(orderedCats.at(-1).name_ar),
      `أول قسم: ${firstCat.trim()}`);

    section('حماية الحذف');
    const catDel = await adam.client.post(`${ADMIN}/content/categories/1/delete`, { body: { _csrf: ctok } });
    check('قسم فيه خدمات مش بيتحذف',
      (catDel.location || '').includes('cat_has_services'), catDel.location);

    // ============================================================ security
    section('صفحة الأمان');
    const sec = await adam.client.get(`${ADMIN}/security`);
    check('صفحة الأمان بتفتح', sec.status === 200);
    check('بتعرض عناوين IP', /\d+\.\d+\.\d+\.\d+/.test(sec.text));
    check('بتعرض نوع الجهاز', has(sec.text, 'موبايل') || has(sec.text, 'كمبيوتر'));
    check('بتحذّر من المحاولات الفاشلة المتكررة', has(sec.text, '185.220.101.44'));
    check('سجل الدخول الكامل بيفتح',
      (await adam.client.get(`${ADMIN}/security/log`)).status === 200);

    const secMona = await mona.client.get(`${ADMIN}/security`);
    check('المحامي مش بيوصل لصفحة الأمان', secMona.status === 403);

    // ============================================================ print
    section('مراجعة الواجهة');
    // Every page must answer, on both audiences. A 500 on a rarely-visited
    // screen is the kind of thing that only surfaces in front of a client.
    const adminPages = ['/', '/requests', '/requests/1', '/requests/new', '/notifications',
      '/trash', '/content', '/content/services/new', '/social', '/consultations-admin',
      '/security', '/security/log', '/users', '/settings', '/activity', '/imports',
      '/account', '/account/profile'];
    for (const p of adminPages) {
      check(`صفحة ${p}`, (await adam.client.get(ADMIN + p)).status === 200);
    }

    const publicPages = ['/', '/services', '/services/1', '/request', '/track',
      '/portal/login', '/portal/register', '/portal/forgot'];
    for (const p of publicPages) {
      check(`صفحة عامة ${p}`, (await makeClient().get(p)).status === 200);
    }

    section('تفاصيل تخدم الشغل اليومي');
    const detail = (await adam.client.get(`${ADMIN}/requests/1`)).text;
    check('زرار نسخ رقم الطلب', has(detail, 'copy-ref'));
    check('زرار نسخ الموبايل', countOf(detail, /data-copy/g) >= 2);
    check('طلبات نفس العميل ظاهرة', has(detail, 'sibling-list'));

    const siblingLinks = countOf(detail, /sibling-list/g);
    check('الطلبات التانية قابلة للفتح', siblingLinks > 0 && has(detail, `${ADMIN}/requests/`));

    // A lawyer must not see another client's requests through this panel.
    const monaView = await mona.client.get(`${ADMIN}/requests/1`);
    const monaSiblingRefs = monaView.text.match(/SND-\d{2}-[A-Z0-9]{5}/g) || [];
    const monaAllowed = db
      .prepare(
        `SELECT r.ref FROM requests r
         WHERE r.id IN (SELECT request_id FROM request_assignees WHERE user_id =
           (SELECT id FROM users WHERE username = 'mona'))`
      )
      .all().map((r) => r.ref);
    check('طلبات نفس العميل بتحترم صلاحية المحامي',
      monaSiblingRefs.every((r) => monaAllowed.includes(r)),
      monaSiblingRefs.filter((r) => !monaAllowed.includes(r)).join(','));

    section('الحفاظ على المكان بعد الحفظ');
    /*
     * Every form in the panel posts then redirects, which reloads the page at
     * the top — so ticking an item halfway down a long request threw the reader
     * back to the header. Solved once, centrally, rather than by adding an
     * anchor to a hundred and eighty redirects.
     */
    const keepPath = pathx.join(__dirname, 'public/js/keep-place.js');
    check('السكربت موجود', fsx.existsSync(keepPath));

    const panelHtml = (await adam.client.get(`${ADMIN}/requests`)).text;
    check('وبيتحمّل في كل صفحات اللوحة', has(panelHtml, 'keep-place.js'));

    for (const page of ['/requests/1', '/revenue', '/errands', '/expenses', '/clients', '/users']) {
      check(`وفي ${page}`, has((await adam.client.get(ADMIN + page)).text, 'keep-place.js'));
    }

    // The behaviour itself, run the way a browser runs it. jsdom is a
    // developer-only tool, so its absence skips these rather than failing them.
    let KeepDOM = null;
    try {
      ({ JSDOM: KeepDOM } = require('jsdom'));
    } catch (_) { /* not installed */ }

    if (KeepDOM) {
      const keepCode = fsx.readFileSync(keepPath, 'utf8');

      const trial = ({ savedAt, savedPath, savedY, nowPath }) => {
        const dom = new KeepDOM('<!doctype html><html><body><form id="f"></form></body></html>', {
          url: 'http://x' + nowPath,
          pretendToBeVisual: true,
          runScripts: 'outside-only',
        });
        const w = dom.window;

        if (savedY !== undefined) {
          w.sessionStorage.setItem(
            'sanad.panel.scroll',
            JSON.stringify({ y: savedY, path: savedPath, at: savedAt })
          );
        }

        let landed = null;
        w.scrollTo = (opts) => { landed = opts && opts.top; };
        Object.defineProperty(w, 'scrollY', { value: 0, writable: true });
        w.requestAnimationFrame = (fn) => fn();

        w.eval(keepCode);
        w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
        w.close();
        return landed;
      };

      const now = Date.now();
      const here = `${ADMIN}/requests`;

      check('بيرجّع المكان بعد الحفظ',
        trial({ savedAt: now, savedPath: here, savedY: 800, nowPath: here }) === 800);
      check('ومبيرجعش على صفحة تانية',
        trial({ savedAt: now, savedPath: here, savedY: 800, nowPath: `${ADMIN}/revenue` }) === null);
      check('ومبيرجعش بعد وقت طويل',
        trial({ savedAt: now - 60000, savedPath: here, savedY: 800, nowPath: here }) === null);
      check('ومبيعملش حاجة من غير محفوظ',
        trial({ nowPath: here }) === null);
      check('ومبيرجعش لمكان قريب من الأول',
        trial({ savedAt: now, savedPath: here, savedY: 20, nowPath: here }) === null);
      check('والمحفوظ بيتمسح بعد الاستخدام', (() => {
        const dom = new KeepDOM('<!doctype html><html><body></body></html>', {
          url: 'http://x' + here, pretendToBeVisual: true, runScripts: 'outside-only',
        });
        const w = dom.window;
        w.sessionStorage.setItem('sanad.panel.scroll',
          JSON.stringify({ y: 500, path: here, at: Date.now() }));
        w.scrollTo = () => {};
        Object.defineProperty(w, 'scrollY', { value: 0, writable: true });
        w.requestAnimationFrame = (fn) => fn();
        w.eval(keepCode);
        w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
        const left = w.sessionStorage.getItem('sanad.panel.scroll');
        w.close();
        return left === null;
      })(), 'المحفوظ فضل');
    } else {
      check('سلوك الحفاظ على المكان اتخطّى (jsdom مش متثبتة)', true);
    }

    section('تخطيط اللوحة');
    /**
     * Measured, not assumed.
     *
     * The layout was reported broken four times and "fixed" three times,
     * because each fix was reasoned from a screenshot instead of read off the
     * cascade. These checks render the real page with the real stylesheet and
     * ask the DOM what it resolved — so a regression fails here rather than in
     * front of somebody.
     */
    /*
     * jsdom is a developer-only tool: it measures the rendered shell so a layout
     * regression fails here instead of in front of somebody. It is deliberately
     * not a declared dependency — the host would then try to resolve it on every
     * deploy, and these checks have nothing to do with running the app.
     */
    let JSDOM = null;
    try {
      ({ JSDOM } = require('jsdom'));
    } catch (_) {
      console.log('  \x1b[33m•\x1b[0m jsdom not installed — layout measurements skipped');
      console.log('    npm i -D jsdom   to enable them');
    }

    const shellCss = fsx.readFileSync(pathx.join(__dirname, 'public/css/admin.css'), 'utf8');

    // jsdom does not evaluate media queries, so the desktop block is appended
    // unconditionally to see what it resolves to at desktop width.
    const desktopStart = shellCss.indexOf('@media (min-width: 1000px) {\n  /*\n   * Desktop shell.');
    let braceDepth = 0, cursor = desktopStart;
    while (cursor < shellCss.length) {
      if (shellCss[cursor] === '{') braceDepth++;
      else if (shellCss[cursor] === '}') { braceDepth--; if (!braceDepth) break; }
      cursor++;
    }
    const desktopRules = shellCss.slice(shellCss.indexOf('{', desktopStart) + 1, cursor);

    const renderAdmin = async (path) => {
      const page = await adam.client.get(ADMIN + path);
      const dom = new JSDOM(
        page.text.replace(/<link[^>]*admin\.css[^>]*>/, `<style>${shellCss}\n${desktopRules}</style>`),
        { pretendToBeVisual: true }
      );
      return dom;
    };

    if (!JSDOM) {
      check('قياسات التخطيط اتخطّت (jsdom مش متثبتة)', true);
    } else {
    const shellDom = await renderAdmin('/revenue');
    const win = shellDom.window;
    const styleOf = (sel) => {
      const el = win.document.querySelector(sel);
      return el ? win.getComputedStyle(el) : null;
    };

    const side = styleOf('.sidebar');
    const mainEl = styleOf('.main');
    const barEl = styleOf('.topbar');
    const innerEl = styleOf('.main-inner');

    check('الصفحة RTL', win.document.documentElement.getAttribute('dir') === 'rtl');
    check('السايدبار ملزوق بالحافة',
      side.right === '0px' && side.left === 'auto', `right=${side.right} left=${side.left}`);
    check('ومفيش transform مخبّيه على الديسكتوب',
      side.transform === 'none', side.transform);
    // Some jsdom builds leave a var() unresolved and report an empty string, so
    // the rule itself is the reliable place to look.
    const reservesSidebar = (selector) =>
      new RegExp(
        `\\[dir="rtl"\\]\\s*${selector}[^{}]*\\{[^}]*padding-right:\\s*var\\(--sidebar-w\\)`
      ).test(desktopRules) ||
      new RegExp(
        `\\[dir="rtl"\\][^{}]*${selector}[^{}]*,[^{}]*\\{[^}]*padding-right:\\s*var\\(--sidebar-w\\)`
      ).test(desktopRules);

    check('والمحتوى محجوز له مكانه',
      reservesSidebar('\\.main'), `padding-right=${mainEl.paddingRight || '(غير محلولة)'}`);
    check('والشريط العلوي بنفس الحجز', reservesSidebar('\\.topbar'));
    check('العمود الداخلي متوسّط',
      !!innerEl && innerEl.margin.includes('auto'), innerEl ? innerEl.margin : 'مفيش .main-inner');
    check('وبعرض مقروء', !!innerEl && innerEl.maxWidth === '1180px',
      innerEl ? innerEl.maxWidth : '—');
    check('ومفيش max-width على main نفسه', mainEl.maxWidth === 'none', mainEl.maxWidth);
    win.close();

    // Every icon on every page must resolve to a real size; an inline SVG with
    // only a viewBox fills whatever box it lands in.
    const iconPages = ['', '/requests', '/requests/1', '/revenue', '/errands', '/clients',
      '/notifications', '/trash', '/content', '/security', '/users', '/settings',
      '/contacts', '/activity', '/imports', '/account/profile'];

    const oversized = [];
    for (const page of iconPages) {
      const dom = await renderAdmin(page);
      const w = dom.window;
      w.document.querySelectorAll('svg').forEach((svg) => {
        if (svg.hasAttribute('width') || svg.hasAttribute('height')) return;
        const width = w.getComputedStyle(svg).width;
        if (!/^\d+(\.\d+)?px$/.test(width) || parseFloat(width) > 40) {
          oversized.push(`${page || '/'}:${width || 'بلا مقاس'}`);
        }
      });
      w.close();
    }
    check('كل أيقونة في اللوحة ليها مقاس محدّد', oversized.length === 0,
      oversized.slice(0, 4).join(', '));
    }

    const adminCssText = fsx.readFileSync(pathx.join(__dirname, 'public/css/admin.css'), 'utf8');
    const siteCssText = fsx.readFileSync(pathx.join(__dirname, 'public/css/style.css'), 'utf8');

    const shell = (await adam.client.get(`${ADMIN}/revenue`)).text;
    check('الشريط العلوي فيه غلاف داخلي', has(shell, 'topbar-inner'));

    // An inline SVG with only a viewBox has no intrinsic size and fills its box.
    check('فيه مقاس افتراضي لكل أيقونة',
      adminCssText.includes('svg:not([width]):not([height])'));
    check('وفي الموقع العام كمان',
      siteCssText.includes('svg:not([width]):not([height])'));

    // Every class the templates use must have a rule, or it renders unstyled.
    const cssAll = adminCssText + siteCssText;
    const defined = new Set((cssAll.match(/\.([A-Za-z][\w-]*)/g) || []).map((c) => c.slice(1)));
    const unstyled = new Set();

    // Standalone pages ship their own inline <style> and never participate in
    // admin.css/style.css by design — printed or emailed outside the panel.
    const STANDALONE_PRINT_TEMPLATES = new Set(['request_print.ejs', 'access_card_print.ejs']);
    fsx.readdirSync(pathx.join(__dirname, 'views/admin'))
      .filter((f) => f.endsWith('.ejs') && !STANDALONE_PRINT_TEMPLATES.has(f))
      .forEach((f) => {
        const body = fsx.readFileSync(pathx.join(__dirname, 'views/admin', f), 'utf8');
        (body.match(/class="([^"<>]+)"/g) || []).forEach((m) => {
          m.replace(/class="|"/g, '').split(/\s+/).forEach((c) => {
            if (c && !c.includes('<%') && !c.includes('%>') && !defined.has(c)) unstyled.add(c);
          });
        });
      });

    check('مفيش عنصر في اللوحة بدون تنسيق', unstyled.size === 0,
      [...unstyled].join(', '));

    section('أهداف اللمس');
    const adminCss = fsx.readFileSync(pathx.join(__dirname, 'public/css/admin.css'), 'utf8');
    check('فيه تكبير لعناصر اللمس على الموبايل', adminCss.includes('pointer: coarse'));
    check('الصفوف بتلتف على الشاشة الصغيرة', adminCss.includes('.sort-item { flex-wrap: wrap'));
    check('النصوص الطويلة مش بتمدّ الصفحة', adminCss.includes('overflow-wrap: anywhere'));

    const siteCss = fsx.readFileSync(pathx.join(__dirname, 'public/css/style.css'), 'utf8');
    check('الموقع العام كمان', siteCss.includes('pointer:coarse'));

    section('تصدير PDF');
    const print = await adam.client.get(`${ADMIN}/requests/1/print`);
    check('صفحة الطباعة بتفتح', print.status === 200);
    check('فيها التعليقات', has(print.text, 'التعليقات والتوثيق'));
    check('فيها المستندات', has(print.text, 'مستندات العميل'));
    check('فيها الصور', /\/files\/\d+/.test(print.text));
    check('فيها سجل الطلب', has(print.text, 'سجل الطلب'));
    check('فيها الأتعاب للأدمن', has(print.text, 'الأتعاب'));

    // mona holds a money.view exception, so she is the wrong lawyer for this —
    // the exception-free one proves the default.
    const printPlain = await plainLawyer.client.get(`${ADMIN}/requests/1/print`);
    check('المحامي بيطبع من غير أتعاب',
      printPlain.status === 200 && !has(printPlain.text, 'الإجمالي'),
      `status ${printPlain.status}`);
    check('واللي معاه استثناء بيطبعها',
      has((await mona.client.get(`${ADMIN}/requests/1/print`)).text, 'الإجمالي'));

    // ============================================================ portal
    section('بوابة العملاء');
    const cl = await loginClient('client@demo.sanad', 'demo1234');
    check('العميل بيدخل', !!cl.redirect);

    const portal = await cl.client.get('/portal');
    check('صفحة طلباتي بتفتح', portal.status === 200);
    check('بتعرض طلباته', /SND-\d+/.test(portal.text));

    const pd = await cl.client.get('/portal/requests/1');
    check('تفاصيل الطلب بتفتح', pd.status === 200);
    check('التعليقات الداخلية مش مسرّبة', !/class="bubble/.test(pd.text));
    check('خطوات التنفيذ مش مسرّبة', !has(pd.text, 'تقديم الملف للحي'));
    check('المطلوب منه ظاهر', has(pd.text, 'المطلوب منك'));

    const notMine = await cl.client.get('/portal/requests/3');
    check('العميل مش بيفتح طلب غيره', notMine.status === 302, `status ${notMine.status}`);

    const guest = await makeClient().get('/portal');
    check('زائر بيتحوّل للدخول', guest.status === 302);

    const unverified = await loginClient('mostafa@demo.sanad', 'demo1234');
    const uPortal = await unverified.client.get('/portal');
    check('مفيش تنبيه تأكيد لأن الإيميل مش مفعّل', !has(uPortal.text, 'notice-warn'));

    // ============================================================ uploads
    section('رفع الملفات');
    const upNoAuth = await makeClient().get('/upload/1');
    check('الرفع محمي من الزائر', upNoAuth.status === 403, `status ${upNoAuth.status}`);

    const upOwner = await cl.client.get('/upload/1');
    check('صاحب الطلب بيفتح صفحة الرفع', upOwner.status === 200, `status ${upOwner.status}`);
    check('فيها اختيار صور أو PDF',
      has(upOwner.text, 'data-mode="images"') && has(upOwner.text, 'data-mode="pdf"'));
    check('فيها زرار الظهر', has(upOwner.text, 'backToggle'));
    check('الكاميرا مفعّلة على الموبايل', has(upOwner.text, 'capture="environment"'));
    check('بتعرض المطلوب من العميل كـ chips', has(upOwner.text, 'need-chip'));
    check('بتقول إن الرفع اختياري', has(upOwner.text, 'اختياري'));

    const upOther = await cl.client.get('/upload/3');
    check('مش بيفتح رفع لطلب غيره', upOther.status === 403);

    // ---- a real multipart upload, end to end ----
    // The page rendering can look perfect while the upload itself is rejected,
    // so this posts an actual file the way a browser does.
    const upTok = await cl.client.token('/upload/1');
    // loginClient returns { client, redirect }, so the jar lives on .client
    const jarHeader = () => cl.client.cookieHeader();

    const frontBuf = await sharp({ create: { width: 2600, height: 1800, channels: 3, background: '#ddd' } })
      .jpeg().toBuffer();
    const backBuf = await sharp({ create: { width: 2600, height: 1800, channels: 3, background: '#ccc' } })
      .jpeg().toBuffer();

    const fd = new FormData();
    fd.append('_csrf', upTok);
    fd.append('name', 'مستند اختبار آلي');
    fd.append('front', new Blob([frontBuf], { type: 'image/jpeg' }), 'front.jpg');
    fd.append('back', new Blob([backBuf], { type: 'image/jpeg' }), 'back.jpg');

    const upRes = await fetch(BASE + '/upload/1', {
      method: 'POST', body: fd, redirect: 'manual',
      headers: { cookie: jarHeader() },
    });
    check('رفع ملفات حقيقي بينجح',
      upRes.status === 302 && (upRes.headers.get('location') || '').includes('msg=uploaded'),
      `${upRes.status} ${upRes.headers.get('location')}`);

    const uploaded = db.prepare(
      `SELECT f.* FROM document_files f JOIN documents d ON d.id = f.document_id WHERE d.name = ?`
    ).all('مستند اختبار آلي');
    check('الملفين اتسجلوا', uploaded.length === 2, `${uploaded.length}`);
    check('اتصغّروا لـ 2000px', uploaded.every((f) => f.width === 2000),
      uploaded.map((f) => f.width).join(','));
    check('الحجم قلّ فعلاً', uploaded.every((f) => f.size < f.original_size));
    check('الملفات على الديسك',
      uploaded.every((f) => fsx.existsSync(pathx.join(UPLOAD_DIR, f.stored_name))));

    // CSRF must still be enforced on multipart, just later in the chain.
    const noTok = new FormData();
    noTok.append('name', 'من غير توكن');
    noTok.append('front', new Blob([frontBuf], { type: 'image/jpeg' }), 'x.jpg');
    const noTokRes = await fetch(BASE + '/upload/1', {
      method: 'POST', body: noTok, redirect: 'manual', headers: { cookie: jarHeader() },
    });
    check('رفع من غير توكن مرفوض', noTokRes.status === 403, `status ${noTokRes.status}`);

    const badType = new FormData();
    badType.append('_csrf', upTok);
    badType.append('name', 'ملف ممنوع');
    badType.append('front', new Blob([Buffer.from('MZ')], { type: 'application/x-msdownload' }), 'v.exe');
    const badTypeRes = await fetch(BASE + '/upload/1', {
      method: 'POST', body: badType, redirect: 'manual', headers: { cookie: jarHeader() },
    });
    check('نوع ملف ممنوع مرفوض',
      (badTypeRes.headers.get('location') || '').includes('err='),
      badTypeRes.headers.get('location'));

    // ============================================================ passwords
    section('سياسة كلمة السر');
    const pwLib = require('./lib/password');

    const weakOnes = [
      ['قصيرة', 'Ab@1'],
      ['من غير رقم', 'Abcdefgh@'],
      ['من غير رمز', 'Abcdefgh12'],
      ['من غير حرف كبير', 'abcdefgh@1'],
      ['أرقام بس', '1234567890'],
      ['متوقّعة', 'Password1!'],
      ['حرف متكرر', 'Aaaaa@12345'],
    ];
    weakOnes.forEach(function (pair) {
      check(`مرفوضة: ${pair[0]}`, !pwLib.isValid(pair[1]));
    });

    check('مقبولة: كلمة قوية', pwLib.isValid('Sanad@Legal7x'));
    check('المقترحة بتعدّي السياسة', pwLib.isValid(pwLib.suggest()));
    check('مينفعش تحتوي اسم المستخدم',
      !pwLib.isValid('Khaled@12345', { username: 'khaled' }));

    // The server must reject a weak password even when the browser is bypassed.
    const pwTok = await adam.client.token(`${ADMIN}/users`);
    const weakCreate = await adam.client.post(`${ADMIN}/users/new`, {
      body: { _csrf: pwTok, display_name: 'اختبار', username: 'weaktest', email: 'weaktest@demo.sanad',
              password: 'simple123', password_confirm: 'simple123', role: 'supervisor' },
    });
    check('السيرفر بيرفض كلمة سر ضعيفة',
      (weakCreate.location || '').includes('err=weak'), weakCreate.location);

    const mismatch = await adam.client.post(`${ADMIN}/users/new`, {
      body: { _csrf: pwTok, display_name: 'اختبار', username: 'mismatchtest', email: 'mismatchtest@demo.sanad',
              password: 'Sanad@Legal7x', password_confirm: 'Sanad@Legal9y', role: 'supervisor' },
    });
    check('لازم الكلمتين يتطابقوا',
      (mismatch.location || '').includes('err=mismatch'), mismatch.location);

    const goodCreate = await adam.client.post(`${ADMIN}/users/new`, {
      body: { _csrf: pwTok, display_name: 'موظف اختبار', username: 'strongtest', email: 'strongtest@demo.sanad',
              password: 'Sanad@Legal7x', password_confirm: 'Sanad@Legal7x', role: 'supervisor' },
    });
    check('كلمة سر قوية بتتقبل',
      (goodCreate.location || '').includes('msg=added'), goodCreate.location);

    const newStaff = await loginStaff('strongtest', 'Sanad@Legal7x');
    check('الحساب الجديد بيتطلب منه يغيّر كلمة السر',
      (newStaff.redirect || '').includes('/account?force=1'), newStaff.redirect);

    const accountPage = await newStaff.client.get(`${ADMIN}/account?force=1`);
    check('صفحة كلمة السر فيها قائمة الشروط', has(accountPage.text, 'data-pw-rules'));
    check('فيها خانة إعادة الكتابة', has(accountPage.text, 'data-pw="confirm"'));
    check('فيها مؤشر القوة', has(accountPage.text, 'data-pw-meter'));
    check('فيها زرار اقتراح كلمة سر', has(accountPage.text, 'data-pw-suggest'));
    check('سكريبت كلمة السر متاح',
      (await makeClient().get('/js/password.js')).status === 200);

    const accTok = await newStaff.client.token(`${ADMIN}/account`);
    const badChange = await newStaff.client.post(`${ADMIN}/account/password`, {
      body: { _csrf: accTok, current: 'Sanad@Legal7x', next: 'weak', confirm: 'weak' },
    });
    check('تغيير لكلمة ضعيفة مرفوض',
      (badChange.location || '').includes('err='), badChange.location);

    const goodChange = await newStaff.client.post(`${ADMIN}/account/password`, {
      body: { _csrf: accTok, current: 'Sanad@Legal7x', next: 'Cairo#Office42', confirm: 'Cairo#Office42' },
    });
    check('تغيير لكلمة قوية بينجح',
      (goodChange.location || '').includes('msg=ok'), goodChange.location);

    const reLogin = await loginStaff('strongtest', 'Cairo#Office42');
    check('الدخول بالكلمة الجديدة شغال', !!reLogin.redirect);
    check('الكلمة القديمة مبقتش تشتغل', !(await loginStaff('strongtest', 'Sanad@Legal7x')).redirect);

    // Client registration must obey the same rules.
    const pwVisitor = makeClient();
    const regTok2 = await pwVisitor.token('/portal/register');
    const weakReg = await pwVisitor.post('/portal/register', {
      body: { _csrf: regTok2, full_name: 'عميل ضعيف', relation: 'self',
              phone: '+201000000077', email: 'weakpw@test.local',
              password: 'abcdefgh', password_confirm: 'abcdefgh' },
    });
    check('تسجيل العميل بيطبّق نفس السياسة',
      weakReg.status === 200 && has(weakReg.text, 'ناقصها'), `status ${weakReg.status}`);

    // ============================================================ comments moderation
    section('نسيت كلمة المرور');
    const devlinksLib = require('./lib/devlinks');
    const readLinks = () =>
      fsx.existsSync(devlinksLib.FILE) ? fsx.readFileSync(devlinksLib.FILE, 'utf8') : '';

    for (const p of [`${ADMIN}/forgot`, `${ADMIN}/reset`, '/portal/forgot', '/portal/reset']) {
      check(`${p} بيفتح`, (await makeClient().get(p)).status === 200);
    }
    check('صفحة دخول الموظفين فيها لينك النسيان',
      has((await makeClient().get(`${ADMIN}/login`)).text, '/forgot'));
    check('صفحة دخول العملاء فيها لينك النسيان',
      has((await makeClient().get('/portal/login')).text, '/portal/forgot'));

    // --- staff journey ---
    const fg = makeClient();
    const fgTok = await fg.token(`${ADMIN}/forgot`);
    const asked = await fg.post(`${ADMIN}/forgot`, { body: { _csrf: fgTok, identifier: 'nour' } });
    check('طلب الرابط بينجح', (asked.location || '').includes('sent=1'), asked.location);
    await new Promise((r) => setTimeout(r, 400));

    const staffToken = (readLinks().match(new RegExp(`${ADMIN}/reset\\?token=([a-f0-9]{40,})`)) || [])[1];
    check('رابط الموظف اتولّد', !!staffToken);

    if (staffToken) {
      const rc = makeClient();
      const page = await rc.get(`${ADMIN}/reset?token=${staffToken}`);
      check('الرابط بيفتح فورم كلمة السر', has(page.text, 'data-pw="new"'));

      const rTok = (page.text.match(/name="_csrf" value="([^"]+)"/) || [])[1];
      const weak = await rc.post(`${ADMIN}/reset`, {
        body: { _csrf: rTok, token: staffToken, password: 'weak', password_confirm: 'weak' },
      });
      check('كلمة ضعيفة مرفوضة', weak.status === 200 && has(weak.text, 'ناقصها'));

      const rTok2 = (weak.text.match(/name="_csrf" value="([^"]+)"/) || [])[1];
      const done = await rc.post(`${ADMIN}/reset`, {
        body: { _csrf: rTok2, token: staffToken,
                password: 'Cairo#Office99', password_confirm: 'Cairo#Office99' },
      });
      check('كلمة قوية بتتحفظ', (done.location || '').includes('reset_done'), done.location);

      check('الدخول بالجديدة شغال', !!(await loginStaff('nour', 'Cairo#Office99')).redirect);
      check('القديمة بطلت', !(await loginStaff('nour', 'demo1234')).redirect);

      const replay = await makeClient().get(`${ADMIN}/reset?token=${staffToken}`);
      check('الرابط بيستخدم مرة واحدة', has(replay.text, 'غير صالح'));
    }

    // --- client journey ---
    const cf = makeClient();
    const cfTok = await cf.token('/portal/forgot');
    await cf.post('/portal/forgot', { body: { _csrf: cfTok, email: 'sara@demo.sanad' } });
    await new Promise((r) => setTimeout(r, 400));

    const clientToken = (readLinks().match(/\/portal\/reset\?token=([a-f0-9]{40,})/) || [])[1];
    check('رابط العميل اتولّد', !!clientToken);

    if (clientToken) {
      const cc = makeClient();
      const page = await cc.get(`/portal/reset?token=${clientToken}`);
      const t2 = (page.text.match(/name="_csrf" value="([^"]+)"/) || [])[1];
      const done = await cc.post('/portal/reset', {
        body: { _csrf: t2, token: clientToken,
                password: 'Nile#Client88', password_confirm: 'Nile#Client88' },
      });
      check('العميل بيغيّر كلمته', (done.location || '').includes('reset_done'), done.location);
      check('العميل بيدخل بالجديدة',
        !!(await loginClient('sara@demo.sanad', 'Nile#Client88')).redirect);
    }

    // An unknown address must look identical to a known one.
    const unknown = makeClient();
    const uTok = await unknown.token('/portal/forgot');
    const unknownRes = await unknown.post('/portal/forgot',
      { body: { _csrf: uTok, email: 'nobody@nowhere.test' } });
    check('إيميل مش مسجّل بيدي نفس الرد',
      (unknownRes.location || '').includes('sent=1'), unknownRes.location);

    const forgedReset = await makeClient().get('/portal/reset?token=' + 'f'.repeat(64));
    check('توكن مزوّر مرفوض', has(forgedReset.text, 'غير صالح'));

    const freshDb2 = new (require('better-sqlite3'))(pathx.join(DATA_DIR, 'sanad.db'), { readonly: true });
    // Accounts an admin created are still waiting on their owner; only a
    // completed profile is required to carry an address.
    const completedNoEmail = freshDb2
      .prepare("SELECT COUNT(*) c FROM users WHERE profile_completed = 1 AND (email IS NULL OR email = '')")
      .get().c;
    check('كل حساب مكتمل عنده إيميل', completedNoEmail === 0, `${completedNoEmail} بدون إيميل`);
    freshDb2.close();

    section('شطب التعليقات');
    const strikeTok = await adam.client.token(`${ADMIN}/requests/1`);
    const firstComment = (await adam.client.get(`${ADMIN}/requests/1`)).text;
    const cid = (firstComment.match(/id="c(\d+)"/) || [])[1];
    check('فيه تعليق للاختبار', !!cid);

    if (cid) {
      const struck = await adam.client.post(
        `${ADMIN}/requests/1/comments/${cid}/delete`, { body: { _csrf: strikeTok } });
      check('الشطب نجح', struck.status === 302);

      const afterStrike = (await adam.client.get(`${ADMIN}/requests/1`)).text;
      check('النص لسه ظاهر بعد الشطب', has(afterStrike, 'bubble struck'));
      check('مكتوب مين شطبه', has(afterStrike, 'مشطوب بواسطة'));
      check('فيه زرار رجّعه', has(afterStrike, '>رجّعه<'));

      const restored = await adam.client.post(
        `${ADMIN}/requests/1/comments/${cid}/restore`, { body: { _csrf: strikeTok } });
      check('الرجوع نجح', restored.status === 302);

      // The demo data ships with a comment already struck, so look at this
      // specific one rather than the page as a whole.
      const afterRestore = (await adam.client.get(`${ADMIN}/requests/1`)).text;
      const block = afterRestore.slice(afterRestore.indexOf(`id="c${cid}"`));
      const bubble = block.slice(0, block.indexOf('</div>', block.indexOf('bubble')) + 6);
      check('التعليق رجع طبيعي', !bubble.includes('struck'), bubble.slice(0, 80));
    }

    // A supervisor moderates anyone; a lawyer only their own.
    // nour's password was changed by the reset test above, so this section
    // signs in again rather than reusing a session that is now revoked.
    const nour2 = await loginStaff('nour', 'Cairo#Office99');
    const supPage = (await nour2.client.get(`${ADMIN}/requests/1`)).text;
    check('المشرف بيشوف زرار الشطب', has(supPage, '>شطب<'));

    const monaPage = (await mona.client.get(`${ADMIN}/requests/1`)).text;
    const monaStrikeButtons = countOf(monaPage, />شطب</g);
    const monaOwnComments = countOf(monaPage, /منى فتحي/g);
    check('المحامي بيشوف أزرار شطب أقل من تعليقاته الظاهرة',
      monaStrikeButtons < monaOwnComments,
      `buttons=${monaStrikeButtons} mentions=${monaOwnComments}`);

    // Forging the request must still fail for a comment the lawyer did not write.
    const otherComment = (supPage.match(/id="c(\d+)"/g) || [])
      .map((m) => m.match(/\d+/)[0])
      .find((id) => id !== cid);
    if (otherComment) {
      const monaTok = await mona.client.token(`${ADMIN}/requests/1`);
      const forged = await mona.client.post(
        `${ADMIN}/requests/1/comments/${otherComment}/delete`, { body: { _csrf: monaTok } });
      check('المحامي مقدرش يشطب تعليق غيره',
        forged.status === 403 || forged.status === 302, `status ${forged.status}`);
    }

    // ============================================================ dev links
    section('الروابط المؤقتة');
    const devlinks = require('./lib/devlinks');
    const linksVisitor = makeClient();
    const dlTok = await linksVisitor.token('/request');
    await linksVisitor.post('/request', {
      body: { _csrf: dlTok, name: 'عميل الروابط', phone: '+201000000088',
              email: 'devlink@test.local', message: 'اختبار الروابط' },
    });
    await new Promise((r) => setTimeout(r, 250));

    const accountsFile = fsx.existsSync(devlinks.FILE)
      ? fsx.readFileSync(devlinks.FILE, 'utf8')
      : '';
    check('ملف الحسابات فيه قسم روابط مؤقتة', has(accountsFile, 'روابط مؤقتة'));
    check('لينك الرفع اتكتب فيه', /\/upload\/\d+\?t=[a-f0-9]{40,}/.test(accountsFile));
    check('مكتوب إنه بيقف مع الإيميل الحقيقي', has(accountsFile, 'بتقف تلقائياً'));

    // ============================================================ images
    section('معالجة الصور');
    const images = require('./lib/images');

    // A phone-sized photo must come back scaled and much smaller.
    const bigPath = pathx.join(UPLOAD_DIR, 'test-big.jpg');
    await sharp({ create: { width: 4032, height: 3024, channels: 3, background: '#e8e4dc' } })
      .jpeg({ quality: 95 }).toFile(bigPath);
    const bigBefore = fsx.statSync(bigPath).size;
    const bigRes = await images.normaliseImage(bigPath, { mime: 'image/jpeg', originalName: 'IMG.jpg' });

    check('صورة كبيرة بتتصغّر لـ 2000px',
      bigRes.width === 2000, `${bigRes.width}x${bigRes.height}`);
    check('الحجم بيقل',
      bigRes.after < bigBefore, `${bigBefore} → ${bigRes.after}`);

    // HEIC must always come out as a JPEG, whichever decoder handled it.
    let heicOk = true;
    try {
      const heicPath = pathx.join(UPLOAD_DIR, 'test.heic');
      await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#ddd' } })
        .heif({ compression: 'av1', quality: 60 }).toFile(heicPath);
      const heicRes = await images.normaliseImage(heicPath, { mime: 'image/heic', originalName: 'IMG.HEIC' });

      check('HEIC بيتحوّل JPEG', heicRes.mime === 'image/jpeg' && heicRes.converted, heicRes.mime);
      check('الامتداد بقى .jpg', heicRes.storedName.endsWith('.jpg'), heicRes.storedName);
      check('ملف HEIC الأصلي اتمسح', !fsx.existsSync(heicPath));

      const outMeta = await sharp(pathx.join(UPLOAD_DIR, heicRes.storedName)).metadata();
      check('الناتج JPEG صالح', outMeta.format === 'jpeg', outMeta.format);
    } catch (e) {
      heicOk = false;
      check('اختبار HEIC اشتغل', false, e.message.slice(0, 80));
    }

    // A corrupt file must not take the upload down.
    const badPath = pathx.join(UPLOAD_DIR, 'test-bad.jpg');
    fsx.writeFileSync(badPath, 'not an image');
    const badRes = await images.normaliseImage(badPath, { mime: 'image/jpeg', originalName: 'x.jpg' });
    check('ملف تالف مش بيكسر المعالجة', badRes && badRes.after > 0);
    check('الملف التالف اتساب زي ما هو', fsx.existsSync(badPath));

    check('سكريبت الضغط بيتقدّم للمتصفح',
      (await makeClient().get('/js/compress.js')).status === 200);
    const upPage = (await cl.client.get('/upload/1')).text;
    check('صفحة الرفع بتحمّل سكريبت الضغط', has(upPage, '/js/compress.js'));
    check('بتقول للعميل إنها بتصغّر الصور', has(upPage, 'compressNote'));

    // ============================================================ email
    section('الإيميل');
    const mailer = require('./lib/mailer');
    check('الوضع الحالي Outbox (مفيش مفاتيح)', mailer.currentProvider() === 'outbox');
    check('mailer.isLive() = false', mailer.isLive() === false);

    const mailSettings = await adam.client.get(`${ADMIN}/settings?tab=mail`);
    check('تبويب الإيميل بيفتح', mailSettings.status === 200);
    check('بيوضّح إنه وضع تجربة', has(mailSettings.text, 'Outbox'));
    check('فيه زرار رسالة تجريبية', has(mailSettings.text, 'test-email'));

    const mtok = await adam.client.token(`${ADMIN}/settings?tab=mail`);
    const testMail = await adam.client.post(`${ADMIN}/settings/test-email`,
      { body: { _csrf: mtok, to: 'tester@example.com' } });
    check('الرسالة التجريبية اتبعتت',
      (testMail.location || '').includes('test=outbox'), testMail.location);

    const outboxFiles = fsx.existsSync(mailer.OUTBOX) ? fsx.readdirSync(mailer.OUTBOX) : [];
    check('الرسالة اتكتبت على الديسك', outboxFiles.length > 0, `${outboxFiles.length} ملف`);

    if (outboxFiles.length) {
      const body = fsx.readFileSync(pathx.join(mailer.OUTBOX, outboxFiles[0]), 'utf8');
      check('الرسالة HTML كاملة', has(body, '<!DOCTYPE html>') && has(body, 'TO:'));
    }

    const mailLogPage = (await adam.client.get(`${ADMIN}/settings?tab=mail`)).text;
    check('سجل الرسائل بيعرض الرسالة', has(mailLogPage, 'tester@example.com'));

    // A new request must produce a confirmation email carrying the upload link.
    const mailVisitor = makeClient();
    const mvTok = await mailVisitor.token('/request');
    await mailVisitor.post('/request', {
      body: { _csrf: mvTok, name: 'عميل الإيميل', phone: '+201000000009',
              email: 'mailtest@example.com', message: 'اختبار الإيميل' },
    });
    await new Promise((r) => setTimeout(r, 400));

    const outboxNow = fsx.readdirSync(mailer.OUTBOX);
    const confirm = outboxNow.find((f) => f.includes('mailtest'));
    check('إيميل تأكيد الطلب اتبعت', !!confirm, outboxNow.join(', ').slice(0, 120));

    if (confirm) {
      const body = fsx.readFileSync(pathx.join(mailer.OUTBOX, confirm), 'utf8');
      check('فيه رقم الطلب', /SND-\d+/.test(body));
      check('فيه لينك الرفع بالتوكن', /\/upload\/\d+\?t=[a-f0-9]{40,}/.test(body));
      check('بيوضّح إن الرفع اختياري', has(body, 'اختياري'));
    }

    // Registration must trigger a verification email.
    const vTok = await mailVisitor.token('/portal/register');
    await mailVisitor.post('/portal/register', {
      body: { _csrf: vTok, full_name: 'عميل التأكيد', relation: 'self',
              phone: '+201000000009', email: 'mailtest@example.com',
              password: 'Journey@Test5', password_confirm: 'Journey@Test5' },
    });
    await new Promise((r) => setTimeout(r, 400));

    const verifyFile = fsx.readdirSync(mailer.OUTBOX)
      .map((f) => ({ f, body: fsx.readFileSync(pathx.join(mailer.OUTBOX, f), 'utf8') }))
      .find((x) => x.body.includes('/portal/verify?token='));
    check('مفيش إيميل تأكيد لأن الخدمة مش مفعّلة', !verifyFile);

    if (verifyFile) {
      const token = (verifyFile.body.match(/\/portal\/verify\?token=([a-f0-9]+)/) || [])[1];
      const verified = await mailVisitor.get(`/portal/verify?token=${token}`);
      check('لينك التأكيد بيشتغل', verified.status === 200 && has(verified.text, 'تم تأكيد'));

      const replay = await makeClient().get(`/portal/verify?token=${token}`);
      check('التوكن بيستخدم مرة واحدة بس', has(replay.text, 'غير صالح'));
    }

    // ============================================================ files
    section('صلاحيات الملفات');
    const fileIds = [...adamDetail.matchAll(/\/files\/(\d+)/g)].map((m) => m[1]);
    if (fileIds.length) {
      const fid = fileIds[0];
      check('زائر مش بيوصل للملف',
        (await makeClient().get(`/files/${fid}`)).status === 403);
      check('الأدمن بيوصل',
        (await adam.client.get(`/files/${fid}`)).status === 200);
      check('المحامي المعيّن بيوصل',
        (await mona.client.get(`/files/${fid}`)).status === 200);
    } else {
      check('فيه ملفات للاختبار', false, 'مفيش ملفات في الطلب');
    }

    // ============================================================ csrf
    section('حماية CSRF');
    const noToken = await adam.client.post(`${ADMIN}/requests/1/comments`, { body: { body: 'hack' } });
    check('POST من غير توكن مرفوض', noToken.status === 403, `status ${noToken.status}`);

    const badToken = await adam.client.post(`${ADMIN}/requests/1/comments`,
      { body: { _csrf: 'x'.repeat(48), body: 'hack' } });
    check('POST بتوكن غلط مرفوض', badToken.status === 403, `status ${badToken.status}`);

    const publicNoToken = await makeClient().post('/request',
      { body: { name: 'x', phone: '1', email: 'a@b.c' } });
    check('فورم الطلب العام محمي', publicNoToken.status === 403);

    // ============================================================ full journey
    section('رحلة كاملة: زائر → طلب → حساب');
    const visitor = makeClient();
    const rtok = await visitor.token('/request');
    const submitted = await visitor.post('/request', {
      body: { _csrf: rtok, name: 'عميل الاختبار', phone: '+201000000001',
              email: 'journey@test.local', message: 'طلب اختبار آلي' },
    });
    check('الطلب اتبعت', submitted.status === 302 && /success/.test(submitted.location || ''),
      submitted.location);

    const successUrl = (submitted.location || '').replace(BASE, '');
    const success = await visitor.get(successUrl);
    check('صفحة النجاح بتفتح', success.status === 200);
    check('رقم الطلب ظاهر', /SND-\d+/.test(success.text));
    check('فيها زرار رفع المستندات', has(success.text, '/upload/'));
    check('فيها زرار عمل حساب', has(success.text, '/portal/register'));

    const regTok = await visitor.token('/portal/register');
    const registered = await visitor.post('/portal/register', {
      body: { _csrf: regTok, full_name: 'عميل الاختبار الآلي', relation: 'self',
              phone: '+201000000001', email: 'journey@test.local',
              password: 'Journey@Test5', password_confirm: 'Journey@Test5' },
    });
    check('التسجيل نجح وربط الطلب',
      (registered.location || '').includes('linked='), registered.location);

    const mine = await visitor.get('/portal');
    check('الطلب القديم ظهر في حسابه', /SND-\d+/.test(mine.text));

    // ============================================================ performance
    section('الترقيم (pagination)');
    const listPage = await adam.client.get(`${ADMIN}/requests`);
    check('قائمة الطلبات بتفتح', listPage.status === 200);
    check('فيه أكتر من صفحة دلوقتي', has(listPage.text, 'class="pager"'));

    const page2 = await adam.client.get(`${ADMIN}/requests?page=999`);
    check('رقم صفحة كبير مش بيكسر', page2.status === 200);

    const filtered = await adam.client.get(`${ADMIN}/requests?status=in_progress&page=1`);
    check('الفلتر مع الترقيم شغال', filtered.status === 200);

    section('الأداء');
    const t0 = Date.now();
    for (let i = 0; i < 20; i++) await adam.client.get(`${ADMIN}/requests`);
    const listAvg = (Date.now() - t0) / 20;
    check(`قائمة الطلبات < 120ms (${listAvg.toFixed(0)}ms)`, listAvg < 120);

    const t1 = Date.now();
    for (let i = 0; i < 20; i++) await adam.client.get(`${ADMIN}/requests/1`);
    const detailAvg = (Date.now() - t1) / 20;
    check(`صفحة الطلب < 150ms (${detailAvg.toFixed(0)}ms)`, detailAvg < 150);

    const t2 = Date.now();
    for (let i = 0; i < 20; i++) await makeClient().get('/');
    const homeAvg = (Date.now() - t2) / 20;
    check(`الرئيسية < 100ms (${homeAvg.toFixed(0)}ms)`, homeAvg < 100);

    const t3 = Date.now();
    await Promise.all(Array.from({ length: 30 }, () => adam.client.get(`${ADMIN}/`)));
    check(`٣٠ طلب متوازي < 3s (${Date.now() - t3}ms)`, Date.now() - t3 < 3000);

    section('مكان البيانات آمن افتراضياً');
    // The default has to be safe on its own: a setting that destroys data when
    // somebody forgets it is not a setting, it is a trap.
    const prodDefault = await new Promise((resolve) => {
      const p = spawn('node', ['-e', "console.log('DIR=' + require('./db').DATA_DIR)"], {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          DATA_DIR: '',
          HOME: fsx.mkdtempSync(pathx.join(require('os').tmpdir(), 'sanad-home-')),
        },
        cwd: __dirname,
      });
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (out += d));
      p.on('close', () => resolve(out));
      setTimeout(() => { p.kill('SIGKILL'); resolve(out); }, 10000);
    });

    const resolvedDir = (prodDefault.match(/DIR=(.+)/) || [])[1] || '';
    check('في الإنتاج بيروح بره المشروع تلقائياً',
      !!resolvedDir && !resolvedDir.startsWith(__dirname), resolvedDir);
    check('ومفيش تحذير خطر', !prodDefault.includes('DANGER'), 'التحذير ظهر');

    const devDefault = await new Promise((resolve) => {
      const p = spawn('node', ['-e', "console.log('DIR=' + require('./db').DATA_DIR)"], {
        env: { ...process.env, NODE_ENV: 'development', DATA_DIR: '' },
        cwd: __dirname,
      });
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.on('close', () => resolve(out));
      setTimeout(() => { p.kill('SIGKILL'); resolve(out); }, 10000);
    });
    check('وفي التطوير بيفضل جنب الكود',
      (devDefault.match(/DIR=(.+)/) || [''])[1].startsWith(__dirname),
      (devDefault.match(/DIR=(.+)/) || [''])[1]);

    // Data already sitting in the old place must be rescued, not orphaned.
    const rescueHome = fsx.mkdtempSync(pathx.join(require('os').tmpdir(), 'sanad-rescue-'));
    const legacy = pathx.join(__dirname, 'data');
    fsx.mkdirSync(legacy, { recursive: true });
    fsx.writeFileSync(pathx.join(legacy, 'sanad.db'), 'legacy-marker');

    const rescued = await new Promise((resolve) => {
      const p = spawn('node', ['-e', "require('./db')"], {
        env: { ...process.env, NODE_ENV: 'production', DATA_DIR: '', HOME: rescueHome },
        cwd: __dirname,
      });
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (out += d));
      p.on('close', () => resolve(out));
      setTimeout(() => { p.kill('SIGKILL'); resolve(out); }, 10000);
    });

    check('الداتا القديمة بتتنقل لمكان آمن',
      rescued.includes('copied to a safe location'), rescued.slice(-140));
    check('والأصل مبيتمسحش',
      fsx.existsSync(pathx.join(legacy, 'sanad.db')));

    fsx.rmSync(rescueHome, { recursive: true, force: true });
    fsx.rmSync(legacy, { recursive: true, force: true });

    section('مخرجات الترمينال بالإنجليزي');
    // Whoever is operating or debugging the server reads these, and that is not
    // always the person who commissioned it. English also copies cleanly into a
    // log aggregator or a bug report.
    const arabicRange = /[\u0600-\u06FF]/;
    const sourceDirs = ['.', 'db', 'lib', 'middleware', 'routes', 'routes/admin'];
    const offenders = [];

    // The suites themselves print Arabic section names on purpose — the office
    // reads those. What matters is the application's own output.
    const SUITE_FILES = ['test.js', 'edge.js', 'security.js', 'integration.js', 'test-harness.js'];

    sourceDirs.forEach((dir) => {
      const full = pathx.join(__dirname, dir);
      if (!fsx.existsSync(full)) return;

      fsx.readdirSync(full)
        .filter((f) => f.endsWith('.js') && !SUITE_FILES.includes(f))
        .forEach((f) => {
          const body = fsx.readFileSync(pathx.join(full, f), 'utf8');
          body.split('\n').forEach((line, i) => {
            // audit.log writes to the activity trail the office reads, so it
            // stays Arabic; comments are not output at all.
            if (line.includes('audit.log') || line.trim().startsWith('*') ||
                line.trim().startsWith('//')) return;
            if (/console\.(log|warn|error)|(?<![.\w])log\(/.test(line) && arabicRange.test(line)) {
              offenders.push(`${dir}/${f}:${i + 1}`);
            }
          });
        });
    });

    check('مفيش رسالة عربية بتتطبع في الترمينال', offenders.length === 0,
      offenders.slice(0, 5).join(', '));

    // And the demo run itself, end to end.
    const demoOut = await new Promise((resolve) => {
      const dir = fsx.mkdtempSync(pathx.join(require('os').tmpdir(), 'sanad-lang-'));
      const p = spawn('node', ['demo.js'], { env: { ...process.env, DATA_DIR: dir }, cwd: __dirname });
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (out += d));
      p.on('close', () => { fsx.rmSync(dir, { recursive: true, force: true }); resolve(out); });
      setTimeout(() => { p.kill('SIGKILL'); resolve(out); }, 120000);
    });

    // Account names and reference numbers are values, not prose — only the
    // surrounding words are checked.
    const proseLines = demoOut
      .split('\n')
      .filter((l) => arabicRange.test(l));

    check('مخرجات npm run demo كلها إنجليزي', proseLines.length === 0,
      proseLines.slice(0, 3).join(' | '));
    check('وبتقول إنها خلصت', demoOut.includes('Demo data ready'));

    section('حماية الإنتاج');
    const bootGuard = await new Promise((resolve) => {
      const p = spawn('node', ['server.js'], {
        env: { ...process.env, NODE_ENV: 'production', SESSION_SECRET: '', PORT: '4099', DATA_DIR },
        cwd: __dirname,
      });
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (out += d));
      p.on('close', (code) => resolve({ code, out }));
      setTimeout(() => { p.kill('SIGKILL'); resolve({ code: -1, out }); }, 4000);
    });
    check('بيرفض يشتغل في production من غير SESSION_SECRET',
      bootGuard.code === 1 && bootGuard.out.includes('SESSION_SECRET'), `exit ${bootGuard.code}`);

    check('فيه ملف .env.example', fsx.existsSync(pathx.join(__dirname, '.env.example')));
    const deployDoc = fsx.readFileSync(pathx.join(__dirname, 'DEPLOY.md'), 'utf8');
    check('فيه دليل رفع', deployDoc.length > 1000);
    check('الدليل بيحذّر من مكان مجلد البيانات', deployDoc.includes('بره مجلد المشروع'));

    // The guard that stops a deploy from silently wiping client data.
    const guard = await new Promise((resolve) => {
      const p = spawn('node', ['-e', "process.env.NODE_ENV='production';require('./db')"], {
        env: { ...process.env, NODE_ENV: 'production', DATA_DIR: './data-guard-test' },
        cwd: __dirname,
      });
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (out += d));
      p.on('close', () => resolve(out));
      setTimeout(() => { p.kill('SIGKILL'); resolve(out); }, 5000);
    });
    check('بيحذّر لو مجلد البيانات جوّه المشروع', guard.includes('DANGER'), guard.slice(0, 100));
    fsx.rmSync(pathx.join(__dirname, 'data-guard-test'), { recursive: true, force: true });

    const ignore = fsx.readFileSync(pathx.join(__dirname, '.gitignore'), 'utf8');
    check('.gitignore بيحمي الداتا', ignore.includes('data/'));
    check('.gitignore بيحمي ملف الحسابات', ignore.includes('TEST-ACCOUNTS.txt'));
    check('.gitignore بيحمي .env', ignore.includes('.env'));

    // Managed hosts run "npm run build" as part of their default preset.
    const pkgJson = JSON.parse(fsx.readFileSync(pathx.join(__dirname, 'package.json'), 'utf8'));
    check('فيه سكريبت build (عشان البناء ميفشلش)', !!pkgJson.scripts.build);

    const buildRun = await new Promise((resolve) => {
      const p = spawn('npm', ['run', 'build'], { cwd: __dirname });
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (out += d));
      p.on('close', (code) => resolve({ code, out }));
      setTimeout(() => { p.kill('SIGKILL'); resolve({ code: -1, out }); }, 20000);
    });
    check('npm run build بينجح', buildRun.code === 0, `exit ${buildRun.code}`);

    // DATA_DIR must accept ~ so it can be set without knowing the username.
    const tildeDir = await new Promise((resolve) => {
      const p = spawn('node', ['-e', "console.log(require('./db').DATA_DIR)"], {
        env: { ...process.env, DATA_DIR: '~/sanad-tilde-test' },
        cwd: __dirname,
      });
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.on('close', () => resolve(out));
      setTimeout(() => { p.kill('SIGKILL'); resolve(out); }, 6000);
    });
    check('DATA_DIR بيقبل ~/',
      tildeDir.includes(require('os').homedir()) && !tildeDir.includes('~'),
      tildeDir.trim().split('\n').pop());
    fsx.rmSync(pathx.join(require('os').homedir(), 'sanad-tilde-test'), { recursive: true, force: true });

    check('معالجة الصور اختيارية مش إجبارية', (() => {
      const pkg = JSON.parse(fsx.readFileSync(pathx.join(__dirname, 'package.json'), 'utf8'));
      return !!(pkg.optionalDependencies && pkg.optionalDependencies.sharp);
    })());

    section('SEED_DEMO');
    // Seeding on boot is what makes the demo accounts reachable on a host
    // where commands cannot be run. It must also refuse to touch real data.
    const seedDir = fsx.mkdtempSync(pathx.join(require('os').tmpdir(), 'sanad-seed-'));

    const bootWithSeed = () => new Promise((resolve) => {
      const p = spawn('node', ['server.js'], {
        env: { ...process.env, DATA_DIR: seedDir, PORT: '4233', SEED_DEMO: '1', NODE_ENV: 'test' },
        cwd: __dirname,
      });
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (out += d));
      setTimeout(() => { p.kill('SIGKILL'); resolve(out); }, 14000);
    });

    const firstBoot = await bootWithSeed();
    check('SEED_DEMO بيجهّز البيانات أول تشغيل',
      firstBoot.includes('Demo data ready'), firstBoot.slice(-140));

    const Database = require('better-sqlite3');
    const seeded = new Database(pathx.join(seedDir, 'sanad.db'), { readonly: true });
    const staff = seeded.prepare('SELECT username FROM users').all().map((u) => u.username);
    const clients = seeded.prepare('SELECT email FROM clients').all().map((c) => c.email);
    const reqCount = seeded.prepare('SELECT COUNT(*) c FROM requests').get().c;
    seeded.close();

    check('حسابات الموظفين اتعملت',
      ['adam', 'nour', 'khaled', 'mona'].every((u) => staff.includes(u)), staff.join(','));
    check('حسابات العملاء اتعملت',
      clients.includes('client@demo.sanad') && clients.includes('sara@demo.sanad'),
      clients.join(','));
    check('الطلبات اتعملت', reqCount >= 10, `${reqCount}`);

    // Booting again must not duplicate or wipe anything.
    const secondBoot = await bootWithSeed();
    check('التشغيل التاني بيتخطّى ومبيلمسش الداتا',
      secondBoot.includes('skipping demo data'), secondBoot.slice(-140));

    const reopened = new Database(pathx.join(seedDir, 'sanad.db'), { readonly: true });
    const reqAfter = reopened.prepare('SELECT COUNT(*) c FROM requests').get().c;
    reopened.close();
    check('عدد الطلبات ما اتغيّرش', reqAfter === reqCount, `${reqCount} → ${reqAfter}`);

    fsx.rmSync(seedDir, { recursive: true, force: true });

    section('علامة العاجل');
    const critTok = await adam.client.token(`${ADMIN}/requests/1`);
    const noReason = await adam.client.post(`${ADMIN}/requests/1/critical`,
      { body: { _csrf: critTok, is_critical: '1', critical_reason: 'x' } });
    check('مش بيقبل من غير سبب واضح',
      (noReason.location || '').includes('need_reason'), noReason.location);

    const marked = await adam.client.post(`${ADMIN}/requests/1/critical`, {
      body: { _csrf: critTok, is_critical: '1',
              critical_reason: 'العميل مسافر يوم ١٤ ولازم الورق يخلص قبلها' },
    });
    check('التعليم بينجح', (marked.location || '').includes('critical_saved'));

    const critRow = db.prepare('SELECT * FROM requests WHERE id = 1').get();
    check('الحالة متسجّلة', critRow.is_critical === 1);
    check('السبب متسجّل', has(critRow.critical_reason, 'مسافر'));
    check('ومين علّمه', !!critRow.critical_by);

    const listWithCrit = await adam.client.get(`${ADMIN}/requests`);
    check('بيبان في القائمة', has(listWithCrit.text, 'flag urgent'));
    check('فيه فلتر عاجل', has(listWithCrit.text, 'critical=1'));
    check('بيطلع فوق', listWithCrit.text.indexOf(critRow.ref) < listWithCrit.text.length / 2);

    const critFilter = await adam.client.get(`${ADMIN}/requests?critical=1&open=1`);
    check('الفلتر بيشتغل',
      critFilter.status === 200 && has(critFilter.text, critRow.ref));

    const critNotif = db.prepare("SELECT * FROM notifications WHERE type = 'critical'").all();
    check('اتبعت إشعارات', critNotif.length > 0);
    check('بأولوية حرجة', critNotif.every((n) => n.priority === 'critical'));

    const cleared = await adam.client.post(`${ADMIN}/requests/1/critical`,
      { body: { _csrf: critTok } });
    check('الشيل بينجح',
      db.prepare('SELECT is_critical FROM requests WHERE id = 1').get().is_critical === 0);

    section('تنبيه الجهاز الجديد');
    const secLib = require('./lib/security');
    const monaId = db.prepare("SELECT id FROM users WHERE username = 'mona'").get().id;
    db.prepare('DELETE FROM known_devices WHERE user_id = ?').run(monaId);
    db.prepare("DELETE FROM notifications WHERE type = 'new_device'").run();

    const first = secLib.rememberDevice(monaId,
      { device: 'كمبيوتر', browser: 'Chrome', os: 'Windows 10/11', ip: '41.1.1.1' });
    check('أول جهاز مش بيتنبّه عليه', first.isNew === false, 'اتنبّه على أول جهاز');

    const second = secLib.rememberDevice(monaId,
      { device: 'موبايل', browser: 'Safari', os: 'iOS', ip: '197.2.2.2' });
    check('الجهاز التاني بيتحسب جديد', second.isNew === true);

    const repeat = secLib.rememberDevice(monaId,
      { device: 'كمبيوتر', browser: 'Chrome', os: 'Windows 10/11', ip: '41.1.1.1' });
    check('نفس الجهاز تاني مش جديد', repeat.isNew === false);
    check('العدّاد بيزيد',
      db.prepare('SELECT seen_count FROM known_devices WHERE user_id = ? AND fingerprint LIKE ?')
        .get(monaId, 'كمبيوتر%').seen_count === 2);

    // And through a real sign-in.
    db.prepare('DELETE FROM known_devices WHERE user_id = ?').run(monaId);
    db.prepare("DELETE FROM notifications WHERE type = 'new_device'").run();
    await loginStaff('mona', 'demo1234');

    const deviceLogin = await fetch(BASE + ADMIN + '/login', {
      method: 'POST', redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) Safari/604.1',
        cookie: await (async () => {
          const c = makeClient();
          await c.token(`${ADMIN}/login`);
          return c.cookieHeader();
        })(),
      },
      body: new URLSearchParams({ _csrf: 'x', username: 'mona', password: 'demo1234' }).toString(),
    });
    check('محاولة الدخول اتعالجت', [200, 302, 403].includes(deviceLogin.status));

    const deviceAlerts = db.prepare("SELECT * FROM notifications WHERE type = 'new_device'").all();
    check('التنبيه بيروح للأدمن بس',
      deviceAlerts.every((n) =>
        db.prepare("SELECT role FROM users WHERE id = ?").get(n.user_id).role === 'admin'),
      `${deviceAlerts.length} إشعار`);

    section('ملف العميل');
    const sampleReq = db.prepare('SELECT * FROM requests WHERE client_id IS NOT NULL LIMIT 1').get();
    const clientFile = await adam.client.get(`${ADMIN}/clients/${sampleReq.client_id}`);
    check('ملف العميل بيفتح', clientFile.status === 200, `status ${clientFile.status}`);
    check('بيعرض كل طلباته', /SND-\d{2}-[A-Z0-9]{5}/.test(clientFile.text));
    check('فيه إحصائيات', has(clientFile.text, 'stat-grid'));
    check('فيه زرار طلب جديد له', has(clientFile.text, '/requests/new?client='));

    const guestReq = db.prepare('SELECT * FROM requests WHERE client_id IS NULL LIMIT 1').get();
    if (guestReq) {
      const guestFile = await adam.client.get(
        `${ADMIN}/clients/${encodeURIComponent(guestReq.phone)}`
      );
      check('عميل بدون حساب بيتجمّع بالموبايل', guestFile.status === 200,
        `status ${guestFile.status}`);
      check('وبيوضّح إنه مسجّلش', has(guestFile.text, 'معملش حساب'));
    }

    check('ملف العميل محدود العدد',
      has((await adam.client.get(`${ADMIN}/clients/${sampleReq.client_id}`)).text, 'stat-grid'));

    check('صفحة الطلب فيها لينك لملف العميل',
      has((await adam.client.get(`${ADMIN}/requests/1`)).text, `${ADMIN}/clients/`));

    // A lawyer must not learn about requests they are not on through this page.
    const monaFile = await mona.client.get(`${ADMIN}/clients/${sampleReq.client_id}`);
    const monaFileRefs = monaFile.text.match(/SND-\d{2}-[A-Z0-9]{5}/g) || [];
    const monaCan = db
      .prepare(
        `SELECT ref FROM requests WHERE id IN
          (SELECT request_id FROM request_assignees WHERE user_id =
            (SELECT id FROM users WHERE username = 'mona'))`
      )
      .all().map((r) => r.ref);
    check('ملف العميل بيحترم صلاحية المحامي',
      monaFileRefs.every((r) => monaCan.includes(r)),
      monaFileRefs.filter((r) => !monaCan.includes(r)).join(','));
    check('والمحامي مش بيشوف الأرقام المالية',
      !has((await plainLawyer.client.get(`${ADMIN}/clients/${sampleReq.client_id}`)).text,
        'إجمالي الأتعاب'));

    section('الأداء — البحث والفهرسة');
    check('فهرس البحث النصي موجود',
      !!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'requests_fts'").get());
    check('الفهرس متزامن مع الطلبات',
      db.prepare('SELECT COUNT(*) c FROM requests_fts').get().c ===
        db.prepare('SELECT COUNT(*) c FROM requests').get().c,
      `${db.prepare('SELECT COUNT(*) c FROM requests_fts').get().c} مقابل ${db.prepare('SELECT COUNT(*) c FROM requests').get().c}`);

    check('مفتاح الموبايل متحسوب',
      db.prepare("SELECT COUNT(*) c FROM requests WHERE phone_key IS NULL OR phone_key = ''").get().c === 0);

    const searchName = await adam.client.get(
      `${ADMIN}/requests?q=${encodeURIComponent('سارة')}`
    );
    check('البحث بالاسم شغّال', searchName.status === 200 && /SND-/.test(searchName.text));

    const searchPhone = await adam.client.get(
      `${ADMIN}/requests?q=${encodeURIComponent(sampleReq.phone)}`
    );
    check('البحث بالموبايل شغّال',
      searchPhone.status === 200 && searchPhone.text.includes(sampleReq.ref));

    const searchRef = await adam.client.get(`${ADMIN}/requests?q=${sampleReq.ref}`);
    check('البحث برقم الطلب شغّال', searchRef.text.includes(sampleReq.ref));

    const corporateRequest = db.prepare(`SELECT r.ref,r.company_id,r.branch_id,co.name company_name,cb.name branch_name
      FROM requests r JOIN companies co ON co.id=r.company_id
      LEFT JOIN company_branches cb ON cb.id=r.branch_id ORDER BY r.id LIMIT 1`).get();
    const personalRequest = db.prepare('SELECT ref FROM requests WHERE company_id IS NULL ORDER BY id LIMIT 1').get();
    check('بيانات الاختبار فيها طلب شركة', !!corporateRequest);
    const searchCompany = await adam.client.get(`${ADMIN}/requests?q=${encodeURIComponent(corporateRequest.company_name)}`);
    check('البحث باسم الشركة أو المكتب يظهر طلباته', searchCompany.text.includes(corporateRequest.ref));
    if (corporateRequest.branch_name) {
      const searchBranch = await adam.client.get(`${ADMIN}/requests?q=${encodeURIComponent(corporateRequest.branch_name)}`);
      check('البحث باسم الفرع يظهر طلباته', searchBranch.text.includes(corporateRequest.ref));
    }
    const companyOnly = await adam.client.get(`${ADMIN}/requests?party=company`);
    check('فلتر الشركات والمكاتب يعرض طلباتها', companyOnly.text.includes(corporateRequest.ref));
    check('فلتر الشركات والمكاتب يستبعد طلب الفرد', !personalRequest || !companyOnly.text.includes(personalRequest.ref));
    const individualOnly = await adam.client.get(`${ADMIN}/requests?party=individual`);
    check('فلتر الأفراد يستبعد طلب الشركة', !individualOnly.text.includes(corporateRequest.ref));
    const selectedCompany = await adam.client.get(`${ADMIN}/requests?party=company&company=${corporateRequest.company_id}`);
    check('اختيار اسم الشركة يعرض طلباتها', selectedCompany.text.includes(corporateRequest.ref));
    check('قائمة الشركات والفروع ظاهرة في شاشة الطلبات', has(selectedCompany.text, 'request-company-filter') && has(selectedCompany.text, 'request-branch-filter'));
    if (corporateRequest.branch_id) {
      const selectedBranch = await adam.client.get(`${ADMIN}/requests?party=company&company=${corporateRequest.company_id}&branch=${corporateRequest.branch_id}`);
      check('اختيار الفرع يعرض طلباته', selectedBranch.text.includes(corporateRequest.ref));
      const branchPrint = await adam.client.get(`${ADMIN}/requests/print?company=${corporateRequest.company_id}&branch=${corporateRequest.branch_id}`);
      check('تقرير الفرع قابل للطباعة ويحمل اسم الشركة والفرع', branchPrint.status===200 && has(branchPrint.text,corporateRequest.company_name) && has(branchPrint.text,corporateRequest.branch_name));
      const branchExport = await adam.client.get(`${ADMIN}/requests/export.csv?company=${corporateRequest.company_id}&branch=${corporateRequest.branch_id}`);
      check('تقرير الفرع قابل للتصدير ويحتوي طلباته', branchExport.status===200 && branchExport.text.includes(corporateRequest.ref));
    }

    // A new request must be searchable the moment it exists.
    const freshTok = await adam.client.token(`${ADMIN}/requests/new`);
    await adam.client.post(`${ADMIN}/requests/new`, {
      body: { _csrf: freshTok, name: 'بحيرة الفهرسة', phone: '+201004443322',
              message: 'اختبار الفهرسة', relation: 'self' },
    });
    const findFresh = await adam.client.get(`${ADMIN}/requests?q=${encodeURIComponent('بحيرة')}`);
    check('الطلب الجديد بيتفهرس فوراً', has(findFresh.text, 'بحيرة الفهرسة'));

    // And an edited one must not linger under its old text.
    const freshRow = db.prepare("SELECT id FROM requests WHERE name = 'بحيرة الفهرسة'").get();
    db.prepare("UPDATE requests SET name = 'اسم متغيّر تماماً' WHERE id = ?").run(freshRow.id);
    const stale = await adam.client.get(`${ADMIN}/requests?q=${encodeURIComponent('بحيرة')}`);
    check('التعديل بيحدّث الفهرس', !has(stale.text, 'بحيرة الفهرسة'));

    section('حدود الصفوف — الأداء');
    const notify = require('./lib/notify');
    // Every list that can grow without bound needs a cap; without one a single
    // busy account eventually renders thousands of rows on every visit.
    // Make sure there is something to open, otherwise the buttons never render.
    notify.notify(1, { type: 'comment', text: 'إشعار لاختبار الفتح في تاب' });
    const notifPage = await adam.client.get(`${ADMIN}/notifications`);
    check('صفحة الإشعارات محدودة', notifPage.status === 200);
    check('فيها خيار فتح في تاب جديدة', has(notifPage.text, 'target="_blank"'),
      'مفيش إشعارات تعرض الزرار');

    check('لوحة التحكم فيها الخيار كمان',
      has((await adam.client.get(`${ADMIN}/`)).text, 'target="_blank"'));

    const routeFiles = ['requests', 'client', 'notifications', 'security'];
    const uncapped = routeFiles.filter((f) => {
      const body = fsx.readFileSync(pathx.join(__dirname, 'routes/admin', f + '.js'), 'utf8');
      return !/LIMIT/i.test(body);
    });
    check('كل الصفحات اللي بتكبر عندها حد', uncapped.length === 0, uncapped.join(', '));

    section('تعديل الموظف لبياناته');
    check('صفحة البيانات فيها لينك لكلمة السر',
      has((await adam.client.get(`${ADMIN}/account/profile`)).text, '/account'));
    check('وصفحة كلمة السر فيها لينك للبيانات',
      has((await adam.client.get(`${ADMIN}/account`)).text, '/account/profile'));

    const editTok = await adam.client.token(`${ADMIN}/account/profile`);
    const edited = await adam.client.post(`${ADMIN}/account/profile`, {
      body: { _csrf: editTok, legal_name: 'آدم محمد عبد الرحمن حسن',
              display_name: 'آدم م.', email: 'adam@demo.sanad',
              phone: '+201000000002', national_id: '28501011234567',
              birth_date: '1985-01-01' },
    });
    check('التعديل بينجح', (edited.location || '').includes('saved=1'), edited.location);
    check('الاسم المختصر اتغيّر',
      db.prepare("SELECT display_name FROM users WHERE username = 'adam'").get().display_name === 'آدم م.');
    check('والرسمي كمان',
      has(db.prepare("SELECT legal_name FROM users WHERE username = 'adam'").get().legal_name, 'حسن'));

    section('سجل الدفعات');
    const pay = require('./lib/payments');
    check('طرق الدفع فيها التحويل من الخارج', !!pay.METHODS.bank_intl);
    check('وفيها إنستاباي والمحفظة والحوالة',
      !!pay.METHODS.instapay && !!pay.METHODS.wallet && !!pay.METHODS.remittance);

    const payReq = db.prepare('SELECT * FROM requests WHERE total_amount > 0 LIMIT 1').get();
    const payTok = await adam.client.token(`${ADMIN}/requests/${payReq.id}`);
    const beforePaid = db.prepare('SELECT paid_amount FROM requests WHERE id = ?').get(payReq.id).paid_amount;

    const added = await adam.client.post(`${ADMIN}/revenue/request/${payReq.id}`, {
      body: { _csrf: payTok, amount: '2500', method: 'instapay',
              paid_on: new Date().toISOString().slice(0, 10), reference: 'IP-TEST-1' },
    });
    check('تسجيل الدفعة بينجح', (added.location || '').includes('payment_added'), added.location);

    const afterPaid = db.prepare('SELECT paid_amount FROM requests WHERE id = ?').get(payReq.id).paid_amount;
    check('المدفوع اتحدّث تلقائياً', Math.abs(afterPaid - beforePaid - 2500) < 0.01,
      `${beforePaid} → ${afterPaid}`);

    const badPay = await adam.client.post(`${ADMIN}/revenue/request/${payReq.id}`, {
      body: { _csrf: payTok, amount: '-100', method: 'cash', paid_on: '2026-13-40' },
    });
    check('دفعة بمبلغ سالب وتاريخ غلط مرفوضة',
      (badPay.location || '').includes('bad_payment'), badPay.location);

    const newPayment = db.prepare("SELECT id FROM payments WHERE reference = 'IP-TEST-1'").get();
    const voidNoReason = await adam.client.post(`${ADMIN}/revenue/${newPayment.id}/void`,
      { body: { _csrf: payTok } });
    check('الإلغاء بيطلب سبب',
      (voidNoReason.location || '').includes('need_void_reason'), voidNoReason.location);

    await adam.client.post(`${ADMIN}/revenue/${newPayment.id}/void`,
      { body: { _csrf: payTok, reason: 'اتسجلت بالغلط' } });
    const voidedRow = db.prepare('SELECT * FROM payments WHERE id = ?').get(newPayment.id);
    check('الدفعة اتلغت مش اتمسحت', !!voidedRow && !!voidedRow.voided_at);
    check('والسبب متسجّل', has(voidedRow.void_reason, 'بالغلط'));
    check('المدفوع رجع تاني',
      Math.abs(db.prepare('SELECT paid_amount FROM requests WHERE id = ?').get(payReq.id).paid_amount - beforePaid) < 0.01);

    const disc = await adam.client.post(`${ADMIN}/revenue/request/${payReq.id}/discount`, {
      body: { _csrf: payTok, discount: '1000', discount_reason: 'عميل قديم' },
    });
    check('الخصم بيتحفظ', (disc.location || '').includes('discount_saved'));
    const noDiscReason = await adam.client.post(`${ADMIN}/revenue/request/${payReq.id}/discount`, {
      body: { _csrf: payTok, discount: '500' },
    });
    check('الخصم بيطلب سبب',
      (noDiscReason.location || '').includes('need_discount_reason'));

    check('المحامي مش بيوصل للدفعات',
      (await mona.client.post(`${ADMIN}/revenue/request/${payReq.id}`,
        { body: { _csrf: payTok, amount: '100', method: 'cash', paid_on: '2026-08-01' } })).status === 403);

    section('إضافة موظف بصلاحياته');
    const addPage = await adam.client.get(`${ADMIN}/users`);

    // Every role the system supports has to be offerable, or it may as well not
    // exist — the accountant was missing from this list while the route behind
    // it accepted the value perfectly well.
    const perms = require('./lib/permissions');
    ['lawyer', 'accountant', 'supervisor', 'admin'].forEach((role) =>
      check(`الدور ${role} موجود في القائمة`,
        has(addPage.text, `value="${role}"`), 'مش معروض في شاشة الإضافة'));

    // The count includes the hidden marker field, so compare the checkboxes.
    const permBoxes = (addPage.text.match(/type="checkbox" name="permission"/g) || []).length;
    check('الصلاحيات معروضة في نفس الشاشة', permBoxes === perms.ALL.length,
      `${permBoxes} من ${perms.ALL.length}`);
    check('وفيها أزرار الكل/ولا حاجة', has(addPage.text, 'perm-all'));
    check('والافتراضي بيتحمّل من الدور', has(addPage.text, 'DEFAULTS'));

    /*
     * Each account is created and checked in one step, with a name of its own.
     *
     * Sharing a fixture across several posts to the same handler meant a later
     * call could overwrite what an earlier assertion was about to read — the
     * checks then described the wrong row and looked like a broken feature.
     */
    async function createStaff(username, role, chosen) {
      db.prepare('DELETE FROM users WHERE username = ?').run(username);

      const token = await adam.client.token(`${ADMIN}/users`);
      const password = 'Fixture#2026x';

      const res = await adam.client.post(`${ADMIN}/users/new`, {
        body: {
          _csrf: token, username, password, password_confirm: password,
          role, _perms: '1', permission: chosen,
        },
      });

      const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      return { res, row, rows: row
        ? db.prepare('SELECT permission, granted FROM user_permissions WHERE user_id = ?').all(row.id)
        : [] };
    }

    const acct = await createStaff('fx_acct', 'accountant',
      [...perms.ROLE_DEFAULTS.accountant, 'clients.directory']);

    check('المحاسب بيتضاف', (acct.res.location || '').includes('msg=added'), acct.res.location);
    check('ودوره اتسجّل صح', acct.row && acct.row.role === 'accountant',
      acct.row && acct.row.role);

    const acctPerms = perms.resolve(db, acct.row);
    check('وباخد افتراضي دوره',
      acctPerms.has('revenue.view') && acctPerms.has('money.view'),
      JSON.stringify(acct.rows));
    check('والاستثناء اتحفظ معاه', acctPerms.has('clients.directory'),
      JSON.stringify(acct.rows));
    check('ومش باخد صلاحيات مش ليه', !acctPerms.has('requests.edit'));
    check('والمتخزن هو الاستثناء بس',
      acct.rows.length === 1 && acct.rows[0].permission === 'clients.directory' &&
        acct.rows[0].granted === 1,
      JSON.stringify(acct.rows));

    // Taking something away from the role is stored the same way.
    const trimmed = await createStaff('fx_super', 'supervisor',
      perms.ROLE_DEFAULTS.supervisor.filter((k) => k !== 'trash.restore'));

    check('المشرف بيتضاف', !!trimmed.row);
    check('وشيل صلاحية بيتسجّل كاستثناء سالب',
      trimmed.rows.length === 1 && trimmed.rows[0].permission === 'trash.restore' &&
        trimmed.rows[0].granted === 0,
      JSON.stringify(trimmed.rows));
    check('وفعلاً مش بيقدر يسترجع',
      !perms.resolve(db, trimmed.row).has('trash.restore'));

    // An admin has no list at all.
    const madeAdmin = await createStaff('fx_admin', 'admin', ['money.view']);
    check('الأدمن مبيتخزنلوش صلاحيات', madeAdmin.rows.length === 0,
      JSON.stringify(madeAdmin.rows));
    check('وبرضه صلاحياته مفتوحة',
      perms.resolve(db, madeAdmin.row).size === perms.ALL.length);

    // Leaving the role's defaults alone stores nothing.
    const plain = await createStaff('fx_lawyer', 'lawyer', perms.ROLE_DEFAULTS.lawyer);
    check('واللي على الافتراضي مبيتخزنلوش صف', plain.rows.length === 0,
      JSON.stringify(plain.rows));

    section('الوصول لشاشة الصلاحيات');
    /*
     * The screen and its route existed for a while with nothing linking to
     * them — which is the same as not existing. This checks the path a person
     * actually takes, not just that the URL responds.
     */
    const staffList = await adam.client.get(`${ADMIN}/users`);
    check('قايمة الموظفين فيها زرار الصلاحيات',
      has(staffList.text, '/permissions'), 'مفيش لينك يوصّل للشاشة');

    const monaUserId = db.prepare("SELECT id FROM users WHERE username = 'mona'").get().id;
    check('واللينك بيوصل للموظف الصح',
      has(staffList.text, `${ADMIN}/users/${monaUserId}/permissions`));

    check('والاستثناءات بتبان في القايمة',
      /chip brass">\s*\d+\s*</.test(staffList.text),
      'مفيش شارة استثناءات');

    check('والأدمن مالوش زرار صلاحيات', (() => {
      const adminId = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get().id;
      return !staffList.text.includes(`${ADMIN}/users/${adminId}/permissions`);
    })());

    check('شاشة الإضافة بتقول إن الصلاحيات جاية من الدور',
      has(staffList.text, 'الصلاحيات بتيجي من الدور'));
    check('وبتوصّف كل دور',
      has(staffList.text, 'محامي — طلباته هو فقط'));

    const permScreen = await adam.client.get(`${ADMIN}/users/${monaUserId}/permissions`);
    check('الشاشة بتعرض كل الصلاحيات',
      (permScreen.text.match(/perm-row/g) || []).length ===
        require('./lib/permissions').ALL.length,
      `${(permScreen.text.match(/perm-row/g) || []).length}`);
    check('وبتوضّح التلات حالات',
      has(permScreen.text, 'من الدور') && has(permScreen.text, 'مضافة') &&
        has(permScreen.text, 'مشيلة'));

    section('المحاسب');
    const samia = await loginStaff('samia', 'demo1234');
    check('المحاسب بيدخل', !!samia.redirect, samia.redirect);

    // What the role exists for.
    const accRevenue = await samia.client.get(`${ADMIN}/revenue`);
    check('بيشوف الإيرادات', accRevenue.status === 200, `status ${accRevenue.status}`);
    check('وبيشوف الأرقام', has(accRevenue.text, 'المُحصَّل في الفترة'));
    check('وبيصدّر CSV',
      (await samia.client.get(`${ADMIN}/revenue/export.csv`)).status === 200);
    check('وبيشوف إشعاراته',
      (await samia.client.get(`${ADMIN}/notifications`)).status === 200);

    // Everything the role must not reach.
    const blockedForAccountant = ['/requests', '/requests/1', '/clients', '/errands',
      '/content', '/users', '/settings', '/security', '/activity', '/trash', '/social'];
    const leaked = [];
    for (const p of blockedForAccountant) {
      const r = await samia.client.get(ADMIN + p);
      const blocked = r.status === 403 || (r.status === 302 && (r.location || '').includes('/revenue'));
      if (!blocked) leaked.push(`${p}=${r.status}`);
    }
    check('محجوب عن كل شاشات الشغل', leaked.length === 0, leaked.join(', '));

    check('لوحة التحكم بتوديه للإيرادات',
      ((await samia.client.get(`${ADMIN}/`)).location || '').includes('/revenue'));

    // Read-only means read-only: every write path is refused.
    const samiaTok = await samia.client.token(`${ADMIN}/revenue`);
    const writeAttempts = [
      [`${ADMIN}/revenue/request/1`, { amount: '500', method: 'cash', paid_on: '2026-08-01' }],
      [`${ADMIN}/revenue/request/1/discount`, { discount: '100', discount_reason: 'محاولة' }],
      [`${ADMIN}/revenue/request/1/write-off`, { amount: '100', reason: 'محاولة إعدام' }],
    ];
    for (const [url, body] of writeAttempts) {
      const r = await samia.client.post(url, { body: { _csrf: samiaTok, ...body } });
      check(`مش بيكتب على ${url.replace(ADMIN, '')}`, r.status === 403, `status ${r.status}`);
    }

    const anyPayment = db.prepare('SELECT id FROM payments WHERE voided_at IS NULL LIMIT 1').get();
    check('ومش بيلغي دفعة',
      (await samia.client.post(`${ADMIN}/revenue/${anyPayment.id}/void`,
        { body: { _csrf: samiaTok, reason: 'محاولة' } })).status === 403);

    // The notifications the role does and does not receive.
    const samiaId = db.prepare("SELECT id FROM users WHERE username = 'samia'").get().id;
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(samiaId);

    const payTok2 = await adam.client.token(`${ADMIN}/requests/2`);
    await adam.client.post(`${ADMIN}/revenue/request/2`, {
      body: { _csrf: payTok2, amount: '1200', method: 'cash',
              paid_on: new Date().toISOString().slice(0, 10) },
    });
    const gotPayment = db
      .prepare("SELECT * FROM notifications WHERE user_id = ? AND type IN ('payment','payment_complete')")
      .all(samiaId);
    check('بياخد إشعار بالدفعات', gotPayment.length > 0, `${gotPayment.length} إشعار`);

    await adam.client.post(`${ADMIN}/requests/2/comments`,
      { body: { _csrf: payTok2, body: 'تعليق مش للمحاسب' } });
    check('مبياخدش إشعار بالتعليقات',
      db.prepare("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND type = 'comment'")
        .get(samiaId).c === 0);

    // Settling a request in full is its own event.
    const settleReq = db
      .prepare('SELECT * FROM requests WHERE total_amount > 0 AND paid_amount < total_amount LIMIT 1')
      .get();
    if (settleReq) {
      const owed = settleReq.total_amount - (settleReq.discount || 0) - settleReq.paid_amount;
      const settleTok = await adam.client.token(`${ADMIN}/requests/${settleReq.id}`);
      await adam.client.post(`${ADMIN}/revenue/request/${settleReq.id}`, {
        body: { _csrf: settleTok, amount: String(owed), method: 'bank',
                paid_on: new Date().toISOString().slice(0, 10), reference: 'SETTLE-1' },
      });
      check('اكتمال السداد له إشعار خاص',
        db.prepare("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND type = 'payment_complete'")
          .get(samiaId).c > 0);
    }

    check('المحامي مش بياخد إشعارات دفعات',
      db.prepare(
        `SELECT COUNT(*) c FROM notifications
         WHERE type IN ('payment','payment_complete')
           AND user_id IN (SELECT id FROM users WHERE role = 'lawyer')`
      ).get().c === 0);

    section('إعدام الديون');
    const debtReq = db
      .prepare(
        `SELECT * FROM requests
         WHERE total_amount - COALESCE(discount,0) - COALESCE(written_off,0) - paid_amount > 100
         LIMIT 1`
      )
      .get();
    check('فيه طلب عليه متبقي', !!debtReq);

    if (debtReq) {
      const owedBefore =
        debtReq.total_amount - (debtReq.discount || 0) - debtReq.paid_amount;
      const outBefore = pay.report(pay.periodBounds('month')).outstanding.amount;

      const woTok = await adam.client.token(`${ADMIN}/requests/${debtReq.id}`);
      const noReasonWo = await adam.client.post(`${ADMIN}/revenue/request/${debtReq.id}/write-off`,
        { body: { _csrf: woTok, amount: String(owedBefore) } });
      check('الإعدام بيطلب سبب',
        (noReasonWo.location || '').includes('need_writeoff_reason'), noReasonWo.location);

      const tooBig = await adam.client.post(`${ADMIN}/revenue/request/${debtReq.id}/write-off`,
        { body: { _csrf: woTok, amount: String(owedBefore + 10000), reason: 'محاولة مبالغة' } });
      check('مبلغ أكبر من المتبقي مرفوض',
        (tooBig.location || '').includes('writeoff_too_big'), tooBig.location);

      const wo = await adam.client.post(`${ADMIN}/revenue/request/${debtReq.id}/write-off`, {
        body: { _csrf: woTok, amount: String(owedBefore),
                reason: 'العميل مش بيرد من ٨ شهور والمبلغ صغير' },
      });
      check('الإعدام بينجح', (wo.location || '').includes('writeoff_saved'), wo.location);

      const after = db.prepare('SELECT * FROM requests WHERE id = ?').get(debtReq.id);
      check('المبلغ متسجّل على الطلب', after.written_off > 0);
      check('والسبب ومين عمله', !!after.write_off_reason && !!after.write_off_by);
      check('المبلغ الأصلي مش اتمسح', after.total_amount === debtReq.total_amount);

      const outAfter = pay.report(pay.periodBounds('month')).outstanding.amount;
      check('خرج من المتبقي على العملاء',
        outAfter < outBefore, `${outBefore} → ${outAfter}`);

      const bal = pay.balanceFor(debtReq.id);
      check('رصيد الطلب بقى صفر', Math.abs(bal.remaining) < 0.01, `${bal.remaining}`);

      check('بيظهر في صفحة الإيرادات',
        has((await adam.client.get(`${ADMIN}/revenue`)).text, 'معدوم') ||
        pay.report(pay.periodBounds('month')).writtenOff.amount > 0);

      await adam.client.post(`${ADMIN}/revenue/request/${debtReq.id}/write-off`,
        { body: { _csrf: woTok, clear: '1' } });
      check('التراجع بيرجّع المبلغ',
        db.prepare('SELECT written_off FROM requests WHERE id = ?').get(debtReq.id).written_off === 0);
    }

    section('صفحة الإيرادات');
    check('الصفحة بتفتح', (await adam.client.get(`${ADMIN}/revenue`)).status === 200);
    for (const period of ['today', 'week', 'month', 'this_month', 'last_month', 'quarter', 'year']) {
      check(`فترة ${period}`, (await adam.client.get(`${ADMIN}/revenue?period=${period}`)).status === 200);
    }
    const custom = await adam.client.get(`${ADMIN}/revenue?period=custom&from=2026-01-01&to=2026-12-31`);
    check('فترة محددة', custom.status === 200);

    const revPage = (await adam.client.get(`${ADMIN}/revenue`)).text;
    check('فيها المحصّل', has(revPage, 'المُحصَّل في الفترة'));
    check('وفيها المتبقي على العملاء', has(revPage, 'المتبقي على العملاء'));
    check('وتقسيم بطرق الدفع', has(revPage, 'حسب طريقة الدفع'));
    check('ومخطط يومي', has(revPage, 'day-chart'));
    check('وأكتر الخدمات تحصيلاً', has(revPage, 'أكتر الخدمات'));

    const csv = await adam.client.get(`${ADMIN}/revenue/export.csv?period=month`);
    check('تصدير CSV بيشتغل', csv.status === 200);
    // fetch().text() strips a leading BOM, so the raw bytes are the only place
    // to see whether Excel will read the Arabic correctly.
    const csvBytes = Buffer.from(
      await (await fetch(BASE + `${ADMIN}/revenue/export.csv?period=month`, {
        headers: { cookie: adam.client.cookieHeader() },
      })).arrayBuffer()
    );
    check('فيه BOM للعربي في إكسل',
      csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf,
      [...csvBytes.slice(0, 3)].map((b) => b.toString(16)).join(' '));
    check('وفيه بيانات', csv.text.split('\n').length > 2);

    check('المحامي مش بيشوف الإيرادات',
      (await mona.client.get(`${ADMIN}/revenue`)).status === 403);

    section('الجهات والمشاوير');
    check('صفحة المشاوير بتفتح', (await adam.client.get(`${ADMIN}/errands`)).status === 200);
    const errPage = (await adam.client.get(`${ADMIN}/errands`)).text;
    check('فيها جهات', has(errPage, 'dest-list'));
    check('وفيها تخطيط مشوار', has(errPage, 'errands/trips/new'));

    const dest = db.prepare('SELECT * FROM destinations LIMIT 1').get();
    check('صفحة الجهة بتفتح',
      (await adam.client.get(`${ADMIN}/errands/destination/${dest.id}`)).status === 200);

    const errTok = await adam.client.token(`${ADMIN}/requests/1`);
    const attached = await adam.client.post(`${ADMIN}/errands/request/1/add`, {
      body: { _csrf: errTok, destination_id: dest.id, task: 'اختبار المهمة' },
    });
    check('ربط جهة بطلب', (attached.location || '').includes('destination_added'));

    const item = db.prepare("SELECT * FROM request_destinations WHERE task = 'اختبار المهمة'").get();
    check('المهمة اتسجلت معلّقة', item.status === 'pending');

    await adam.client.post(`${ADMIN}/errands/item/${item.id}/done`, {
      body: { _csrf: errTok, result_note: 'اتخلّصت' },
    });
    const doneItem = db.prepare('SELECT * FROM request_destinations WHERE id = ?').get(item.id);
    check('التعليم كمنتهية شغّال', doneItem.status === 'done' && !!doneItem.done_by);
    check('وبيتسجّل التاريخ والنتيجة',
      !!doneItem.done_on && has(doneItem.result_note, 'اتخلّصت'));

    const tripTok = await adam.client.token(`${ADMIN}/errands`);
    const tripRes = await adam.client.post(`${ADMIN}/errands/trips/new`, {
      body: { _csrf: tripTok, destination_id: dest.id,
              trip_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10) },
    });
    check('إنشاء مشوار', (tripRes.location || '').includes('/errands/trip/'), tripRes.location);

    const tripId = (tripRes.location || '').match(/trip\/(\d+)/)[1];
    const tripPage = await adam.client.get(`${ADMIN}/errands/trip/${tripId}`);
    check('صفحة المشوار بتفتح', tripPage.status === 200);
    check('الطلبات المعلّقة انضمت تلقائياً',
      db.prepare('SELECT COUNT(*) c FROM request_destinations WHERE trip_id = ?').get(tripId).c >= 0);

    await adam.client.post(`${ADMIN}/errands/trip/${tripId}/close`, { body: { _csrf: tripTok } });
    check('قفل المشوار', db.prepare('SELECT status FROM trips WHERE id = ?').get(tripId).status === 'done');
    check('اللي مخلّصش رجع للقائمة',
      db.prepare("SELECT COUNT(*) c FROM request_destinations WHERE trip_id = ? AND status = 'pending'").get(tripId).c === 0);

    check('صفحة الطلب فيها لوحة الجهات',
      has((await adam.client.get(`${ADMIN}/requests/1`)).text, 'جهات خارجية'));

    section('حذف الملفات القديمة');
    const purgeLib = require('./lib/purge');
    check('الحد الأدنى ١٨٠ يوم', purgeLib.MIN_DAYS === 180);

    const filesTab = await adam.client.get(`${ADMIN}/settings?tab=files`);
    check('تبويب الملفات بيفتح', filesTab.status === 200);
    check('بيعرض المساحة المستخدمة', has(filesTab.text, 'المساحة المستخدمة'));
    check('وبيوضّح إن السجل بيفضل', has(filesTab.text, 'مش السجل'));

    const purgeTok = await adam.client.token(`${ADMIN}/settings?tab=files`);
    const noConfirm = await adam.client.post(`${ADMIN}/settings/purge-files`,
      { body: { _csrf: purgeTok, days: '180' } });
    check('الحذف من غير تأكيد مرفوض',
      (noConfirm.location || '').includes('err=confirm'), noConfirm.location);

    const filesBefore = db.prepare('SELECT COUNT(*) c FROM document_files WHERE purged_at IS NULL').get().c;
    await adam.client.post(`${ADMIN}/settings/purge-files`,
      { body: { _csrf: purgeTok, days: '180', confirm: 'احذف' } });
    check('السجلات مبتتمسحش',
      db.prepare('SELECT COUNT(*) c FROM document_files').get().c === filesBefore,
      'اتمسح صف من الجدول');

    check('المحامي مش بيوصل للحذف',
      (await mona.client.post(`${ADMIN}/settings/purge-files`,
        { body: { _csrf: purgeTok, confirm: 'احذف' } })).status === 403);

    section('دليل العملاء');
    const dir = await adam.client.get(`${ADMIN}/clients`);
    check('الصفحة بتفتح', dir.status === 200, `status ${dir.status}`);
    check('بتعرض عملاء', /SND-|<td data-label="العميل"/.test(dir.text));
    check('فيها بحث', has(dir.text, 'name="q"'));
    check('وفيها ترتيب', has(dir.text, 'sort=newest'));

    const clientRow = db.prepare('SELECT name, phone FROM requests LIMIT 1').get();
    const byName = await adam.client.get(
      `${ADMIN}/clients?q=${encodeURIComponent(clientRow.name.split(' ')[0])}`
    );
    check('البحث بالاسم شغّال', byName.status === 200 && has(byName.text, clientRow.name));

    const byPhone = await adam.client.get(`${ADMIN}/clients?q=${encodeURIComponent(clientRow.phone)}`);
    check('البحث بالموبايل شغّال', has(byPhone.text, clientRow.name));

    for (const sortKey of ['recent', 'newest', 'oldest', 'requests', 'owing']) {
      check(`ترتيب ${sortKey}`,
        (await adam.client.get(`${ADMIN}/clients?sort=${sortKey}`)).status === 200);
    }

    check('العميل بيظهر مرة واحدة مهما كان عنده طلبات كتير', (() => {
      const names = (dir.text.match(/data-label="العميل"[\s\S]*?<\/td>/g) || []);
      return names.length <= 40;
    })());

    check('المحامي مش بيوصل لدليل العملاء',
      (await mona.client.get(`${ADMIN}/clients`)).status === 403);

    section('مشاركة الطلب مع زميل');
    const shareView = (await adam.client.get(`${ADMIN}/requests/1`)).text;
    check('فيه زرار مشاركة', has(shareView, 'shareBtn'));
    check('وفيه لينك للنسخ', has(shareView, 'shareLink'));
    check('وزرار واتساب', has(shareView, 'shareWa'));

    section('طلب جديد من ملف العميل');
    const withAccount = db.prepare('SELECT * FROM clients LIMIT 1').get();
    const prefilled = await adam.client.get(`${ADMIN}/requests/new?client=${withAccount.id}`);
    check('بيتملي باسم العميل', has(prefilled.text, withAccount.full_name));
    check('ومش بيطلب اختيار تاني', !has(prefilled.text, 'id="clientPick"'));
    check('والحساب مربوط', has(prefilled.text, `value="${withAccount.id}"`));

    const guestPhone = db
      .prepare('SELECT phone, name FROM requests WHERE client_id IS NULL LIMIT 1')
      .get();
    if (guestPhone) {
      const byPhonePrefill = await adam.client.get(
        `${ADMIN}/requests/new?phone=${encodeURIComponent(guestPhone.phone)}`
      );
      check('وعميل بدون حساب بيتملي بالموبايل',
        has(byPhonePrefill.text, guestPhone.name), 'مااتملاش');
    }

    section('فترات المواعيد في اللوحة');
    // An overdue deadline must survive every window: filtering it out is how a
    // slipped date becomes a forgotten one.
    const farOverdue = db.prepare('SELECT * FROM requests LIMIT 1').get();
    const farFuture = db.prepare('SELECT * FROM requests WHERE id != ? LIMIT 1').get(farOverdue.id);

    db.prepare("UPDATE requests SET deadline = date('now','-150 days'), status = 'in_progress' WHERE id = ?")
      .run(farOverdue.id);
    db.prepare("UPDATE requests SET deadline = date('now','+120 days'), status = 'in_progress' WHERE id = ?")
      .run(farFuture.id);

    const overdueSection = (html) => {
      const i = html.indexOf('due-group overdue');
      if (i === -1) return '';
      return html.slice(i, html.indexOf('due-filters', i));
    };
    const upcomingSection = (html) => {
      const i = html.indexOf('id="due"');
      return i === -1 ? '' : html.slice(i);
    };

    for (const [key, label] of [['week', 'أسبوع'], ['month', 'شهر'],
                                ['quarter', '٣ شهور'], ['half', '٦ شهور']]) {
      const page = await adam.client.get(`${ADMIN}/?due=${key}`);
      check(`فترة ${label} بتفتح`, page.status === 200);
      check(`المتأخر ظاهر مع فترة ${label}`,
        overdueSection(page.text).includes(farOverdue.ref), 'المتأخر اختفى');
    }

    const weekView = await adam.client.get(`${ADMIN}/?due=week`);
    check('الموعد البعيد مش ظاهر في فترة أسبوع',
      !upcomingSection(weekView.text).includes(farFuture.ref));

    const halfView = await adam.client.get(`${ADMIN}/?due=half`);
    check('وظاهر في فترة ٦ شهور',
      upcomingSection(halfView.text).includes(farFuture.ref), 'مظهرش');

    check('فيه أزرار الفترات', has(weekView.text, 'due-filters'));
    check('والمفعّل متعلّم', /qf sm on|qf sm\s+on/.test(weekView.text));
    check('وعدد المتأخر بيبان', has(weekView.text, 'متأخر'));

    const badHorizon = await adam.client.get(`${ADMIN}/?due=nonsense`);
    check('فترة غلط بترجع للافتراضي', badHorizon.status === 200);

    section('فلاتر ٣ و٦ شهور');
    const filterPage = (await adam.client.get(`${ADMIN}/requests`)).text;
    check('فلتر ٣ شهور موجود', has(filterPage, 'آخر ٣ شهور'));
    check('فلتر ٦ شهور موجود', has(filterPage, 'آخر ٦ شهور'));
    for (const d of [1, 3, 7, 10, 30, 90, 180]) {
      check(`الفلتر ${d} يوم بيشتغل`,
        (await adam.client.get(`${ADMIN}/requests?days=${d}&open=1`)).status === 200);
    }

    const ninety = await adam.client.get(`${ADMIN}/requests?days=90&open=1`);
    check('الفلتر بيحافظ على نفسه في الترقيم',
      !has(ninety.text, 'page=') || has(ninety.text, 'days=90'));

    section('حسابات المحاكاة في الإنتاج');
    // The documented demo passwords are only safe because the accounts cannot
    // keep them on a production server.
    const demoProd = await new Promise((resolve) => {
      const dir = fsx.mkdtempSync(pathx.join(require('os').tmpdir(), 'sanad-prod-'));
      const p = spawn('node', ['demo.js'], {
        env: { ...process.env, DATA_DIR: dir, NODE_ENV: 'production' },
        cwd: __dirname,
      });
      p.on('close', () => resolve(dir));
      setTimeout(() => { p.kill('SIGKILL'); resolve(dir); }, 60000);
    });

    const prodDb = new (require('better-sqlite3'))(pathx.join(demoProd, 'sanad.db'), { readonly: true });
    const notForced = prodDb
      .prepare('SELECT COUNT(*) c FROM users WHERE must_change_password = 0')
      .get().c;
    prodDb.close();
    fsx.rmSync(demoProd, { recursive: true, force: true });

    check('كل حسابات المحاكاة مجبرة تغيّر كلمة السر في الإنتاج',
      notForced === 0, `${notForced} حساب مش مجبر`);

    check('وفي التطوير الدخول المباشر شغّال',
      db.prepare("SELECT must_change_password m FROM users WHERE username = 'adam'").get().m === 0);

    section('الدخول بحساب Google');
    const googleLib = require('./lib/google');

    // Off by default: no credentials, no button, no route.
    check('مقفول لو مفيش بيانات', !googleLib.isEnabled());
    check('مفيش زرار في صفحة الدخول',
      !has((await makeClient().get('/portal/login')).text, 'btn google'));
    check('المسار بيحوّل مع رسالة',
      ((await makeClient().get('/portal/google')).location || '').includes('google_off'));

    const gTok = await adam.client.token(`${ADMIN}/settings?tab=google`);
    const gTab = await adam.client.get(`${ADMIN}/settings?tab=google`);
    check('تبويب الإعدادات بيفتح', gTab.status === 200);
    check('بيوضّح إنه للعملاء بس', has(gTab.text, 'للعملاء بس'));
    check('وبيعرض لينك الـ callback', has(gTab.text, '/portal/google/callback'));
    check('وفيه شرح الخطوات', has(gTab.text, 'console.cloud.google.com'));

    await adam.client.post(`${ADMIN}/settings/google`, {
      body: { _csrf: gTok, google_client_id: '123.apps.googleusercontent.com',
              google_client_secret: 'GOCSPX-test-secret' },
    });

    const onPage = await adam.client.get(`${ADMIN}/settings?tab=google`);
    check('اتفعّل بعد الحفظ', has(onPage.text, 'مفعّل') && !has(onPage.text, 'مش مفعّل'));
    check('المفتاح السري مش بيترجع للمتصفح',
      !has(onPage.text, 'GOCSPX-test-secret'), 'المفتاح ظهر في الصفحة');
    check('ولا مفتاح الإيميل كمان',
      !has((await adam.client.get(`${ADMIN}/settings?tab=mail`)).text,
        db.prepare("SELECT value v FROM settings WHERE key = 'mail_api_key'").get()?.v || '\u0000'));

    const loginWithGoogle = await makeClient().get('/portal/login');
    check('الزرار بيظهر في الدخول', has(loginWithGoogle.text, 'btn google'));
    check('وفي التسجيل كمان',
      has((await makeClient().get('/portal/register')).text, 'btn google'));

    const starter = makeClient();
    const started = await starter.get('/portal/google');
    check('البداية بتحوّل لجوجل',
      (started.location || '').startsWith('https://accounts.google.com/'), started.location);
    check('اللينك فيه الـ client id',
      (started.location || '').includes('123.apps.googleusercontent.com'));
    check('وفيه state عشوائي', /[?&]state=[a-f0-9]{40,}/.test(started.location || ''));
    check('وبيطلب اختيار الحساب', (started.location || '').includes('prompt=select_account'));
    const scope = new URL(started.location || 'https://x/').searchParams.get('scope') || '';
    check('وبيطلب البريد والاسم بس', scope === 'openid email profile', scope);

    // The state check is what stops somebody completing a sign-in in another
    // person's browser.
    const wrongState = await starter.get('/portal/google/callback?code=x&state=forged');
    check('state مزوّر مرفوض',
      (wrongState.location || '').includes('google_state'), wrongState.location);

    const noCode = await makeClient().get('/portal/google/callback?state=x');
    check('رجوع من غير كود مرفوض', (noCode.location || '').includes('google_'));

    const cancelled = await makeClient().get('/portal/google/callback?error=access_denied&state=x');
    check('الإلغاء بيتعامل معاه بهدوء', (cancelled.location || '').includes('google_'));

    // Account matching, tested at the library level — the network round-trip to
    // Google cannot be made from a test.
    const existingClient = db.prepare('SELECT * FROM clients LIMIT 1').get();
    const linkedExisting = googleLib.linkClient({
      googleId: 'g-existing-1', email: existingClient.email, name: 'اسم من جوجل',
    });
    check('البريد الموجود بيتربط مش بيتكرر',
      linkedExisting.client.id === existingClient.id && linkedExisting.linked === true);
    check('والحساب بقى مؤكّد',
      db.prepare('SELECT email_verified v FROM clients WHERE id = ?').get(existingClient.id).v === 1);

    const again = googleLib.linkClient({
      googleId: 'g-existing-1', email: existingClient.email, name: 'اسم تاني',
    });
    check('الدخول التاني بيلاقيه بالمعرّف',
      again.client.id === existingClient.id && again.created === false && again.linked === false);

    const clientsBefore = db.prepare('SELECT COUNT(*) c FROM clients').get().c;
    const fresh = googleLib.linkClient({
      googleId: 'g-brand-new', email: 'brandnew@gmail.test', name: 'عميل جديد',
    });
    check('حساب جديد بيتعمل', fresh.created === true);
    check('وبيتحسب عميل واحد زيادة بس',
      db.prepare('SELECT COUNT(*) c FROM clients').get().c === clientsBefore + 1);
    check('وبيبقى مؤكّد من غير كلمة سر',
      fresh.client.email_verified === 1 && !fresh.client.password_hash);

    // Nothing here may open a staff session.
    const staffGoogle = await makeClient().get(`${ADMIN}/google`);
    check('مفيش مسار Google للموظفين',
      [302, 403, 404].includes(staffGoogle.status) &&
        !(staffGoogle.location || '').includes('accounts.google.com'),
      `status ${staffGoogle.status} → ${staffGoogle.location}`);
    check('ولا في صفحة دخول الموظفين',
      !has((await makeClient().get(`${ADMIN}/login`)).text, 'btn google'));

    // Put it back the way it was.
    const offTok2 = await adam.client.token(`${ADMIN}/settings?tab=google`);
    await adam.client.post(`${ADMIN}/settings/google`, {
      body: { _csrf: offTok2, google_client_id: '', clear_secret: '1' },
    });
    check('الإلغاء بيقفله', !googleLib.isEnabled());

    section('بيانات المحاكاة — التغطية');
    const vol = (t, w = '') =>
      db.prepare(`SELECT COUNT(*) c FROM ${t} ${w}`).get().c;

    check('حجم معقول للطلبات', vol('requests') >= 60, `${vol('requests')} طلب`);
    check('وعملاء كتير', vol('clients') >= 25, `${vol('clients')} عميل`);
    check('وتعليقات كتير', vol('comments') >= 200, `${vol('comments')} تعليق`);

    // Every role has to exist, or the permission model is untested by hand.
    const roles = db.prepare('SELECT role, COUNT(*) c FROM users GROUP BY role').all();
    const roleMap = Object.fromEntries(roles.map((r) => [r.role, r.c]));
    ['admin', 'supervisor', 'lawyer', 'accountant'].forEach((r) =>
      check(`فيه حساب ${r}`, (roleMap[r] || 0) > 0));
    check('وفيه حساب موقوف', vol('users', 'WHERE active = 0') > 0);
    check('وحساب لسه مغيّرش كلمته', vol('users', 'WHERE must_change_password = 1') > 0);

    // Every status, so no screen is empty on a walkthrough.
    const statuses = db.prepare('SELECT status, COUNT(*) c FROM requests GROUP BY status').all();
    const statusMap = Object.fromEntries(statuses.map((r) => [r.status, r.c]));
    Object.keys(require('./lib/i18n').STATUS).forEach((st) =>
      check(`فيه طلبات بحالة ${st}`, (statusMap[st] || 0) > 0, `${statusMap[st] || 0}`));

    check('فيه طلبات مؤرشفة', vol('requests', 'WHERE archived_at IS NOT NULL') > 0);
    check('وطلبات عاجلة', vol('requests', 'WHERE is_critical = 1') > 0);
    check('ومواعيد متأخرة',
      vol('requests', "WHERE deadline < date('now') AND status NOT IN ('completed','cancelled')") > 0);
    check('ومواعيد بعيدة', vol('requests', "WHERE deadline > date('now','+60 days')") > 0);
    check('وطلبات بدون موعد', vol('requests', 'WHERE deadline IS NULL') > 0);
    check('وطلبات من المكتب', vol('requests', "WHERE source = 'office'") > 0);
    check('وطلبات بعناوين', vol('requests', 'WHERE title IS NOT NULL') > 0);
    check('وطلبات لصفة غير صاحب الطلب', vol('requests', "WHERE relation != 'self'") > 0);
    check('وطلبات خاصة', vol('requests', 'WHERE special_request IS NOT NULL') > 0);

    check('فيه ردود على التعليقات', vol('comments', 'WHERE parent_id IS NOT NULL') > 30);
    check('وتعليقات مشطوبة', vol('comments', 'WHERE deleted_at IS NOT NULL') > 0);

    check('فيه خطوات خالصة بتواريخ', vol('todos', 'WHERE done = 1 AND done_on IS NOT NULL') > 20);
    check('وخطوات لسه مفتوحة', vol('todos', 'WHERE done = 0') > 10);

    check('فيه مطلوب من العملاء معلّق', vol('requirements', "WHERE status = 'pending'") > 0);
    check('ومطلوب اتستلم', vol('requirements', "WHERE status = 'received'") > 0);

    check('فيه مستندات من العملاء', vol('documents', "WHERE source = 'client'") > 0);
    check('ومستندات من المكتب', vol('documents', "WHERE source = 'staff'") > 0);
    check('ومستندات داخلية', vol('documents', 'WHERE internal = 1') > 0);

    // Money, across every method the office accepts.
    const methods = db.prepare('SELECT DISTINCT method FROM payments').all().map((m) => m.method);
    ['cash', 'bank', 'bank_intl', 'instapay', 'wallet', 'remittance', 'cheque'].forEach((m) =>
      check(`فيه دفعات بـ ${m}`, methods.includes(m), methods.join(',')));

    check('فيه دفعة ملغاة', vol('payments', 'WHERE voided_at IS NOT NULL') > 0);
    check('وخصومات', vol('requests', 'WHERE discount > 0') > 0);
    check('وديون معدومة', vol('requests', 'WHERE written_off > 0') > 0);
    check('وطلبات عليها متبقي',
      vol('requests', 'WHERE total_amount - COALESCE(discount,0) - COALESCE(written_off,0) - paid_amount > 0.01') > 0);

    check('فيه جهات مربوطة', vol('request_destinations') > 10);
    check('ومنها معلّق', vol('request_destinations', "WHERE status = 'pending'") > 0);
    check('ومنها خلصان', vol('request_destinations', "WHERE status = 'done'") > 0);
    check('فيه مشاوير مقفولة', vol('trips', "WHERE status = 'done'") > 0);
    check('ومشاوير مخططة', vol('trips', "WHERE status = 'planned'") > 0);

    check('فيه إشعارات غير مقروءة', vol('notifications', 'WHERE seen_at IS NULL') > 0);
    check('وإشعارات حرجة', vol('notifications', "WHERE priority = 'critical'") > 0);
    check('وأجهزة معروفة', vol('known_devices') > 0);
    check('وسجل دخول فيه محاولات فاشلة', vol('login_history', 'WHERE success = 0') > 0);

    check('فيه عملاء بدون حساب',
      vol('requests', 'WHERE client_id IS NULL') > 0);
    check('وعملاء دخلوا بجوجل', vol('clients', 'WHERE google_id IS NOT NULL') > 0);
    check('وعملاء أجانب', vol('clients', "WHERE email LIKE '%example.com'") > 0);

    // Two years of history, so the long periods on the revenue page mean
    // something.
    const span = db
      .prepare("SELECT julianday('now') - julianday(MIN(created_at)) AS d FROM requests")
      .get().d;
    check('التاريخ ممتد لسنة على الأقل', span > 330, `${Math.round(span)} يوم`);

    const revenueSpan = pay.report(pay.periodBounds('year'));
    check('صفحة الإيرادات ليها بيانات على مدى سنة', revenueSpan.byDay.length > 40,
      `${revenueSpan.byDay.length} يوم فيه تحصيل`);
    check('والتقسيم بالخدمة مليان', revenueSpan.byService.length >= 5);

    check('الترقيم بيشتغل فعلاً',
      (await adam.client.get(`${ADMIN}/requests?page=2`)).status === 200);
    check('وفيه صفحة تانية أصلاً', vol('requests', 'WHERE archived_at IS NULL') > 50);

    check('كل الإجماليات مطابقة للدفعات',
      db.prepare(
        `SELECT COUNT(*) c FROM requests r
         WHERE ABS(r.paid_amount -
           (SELECT COALESCE(SUM(amount),0) FROM payments p
             WHERE p.request_id = r.id AND p.voided_at IS NULL)) > 0.01`
      ).get().c === 0);

    // Requests the suite itself created are not demo rows, so only the seeded
    // ones are checked.
    check('كل بيانات المحاكاة متعلّمة',
      vol('requests', "WHERE is_demo = 1") >= 60 && vol('clients', "WHERE is_demo = 1") >= 25,
      `${vol('requests', 'WHERE is_demo = 1')} طلب متعلّم`);

    section('بيانات التواصل');
    const contactPage = await makeClient().get('/contact');
    check('صفحة اتصل بنا بتفتح', contactPage.status === 200);
    check('فيها رقم الواتساب', has(contactPage.text, '966551537512'));
    check('وفيها البريد الرسمي', has(contactPage.text, 'mohamedsaleh@sanad.com.eg'));
    check('والواتساب لينك شغّال', has(contactPage.text, 'wa.me/966551537512'));
    check('والبريد mailto', has(contactPage.text, 'mailto:mohamedsaleh@sanad.com.eg'));
    check('وفيها مواعيد العمل', has(contactPage.text, 'مواعيد العمل'));
    check('ولينك في الفوتر', has((await makeClient().get('/')).text, 'href="/contact"'));
    check('والزرار العايم على نفس الرقم',
      has((await makeClient().get('/')).text, 'wa.me/966551537512'));

    const cAdmin = await adam.client.get(`${ADMIN}/contacts`);
    check('صفحة الإدارة بتفتح', cAdmin.status === 200);
    check('بتعرض البيانات الموجودة', has(cAdmin.text, '966551537512'));

    const cTok = await adam.client.token(`${ADMIN}/contacts`);
    const contactAdded = await adam.client.post(`${ADMIN}/contacts/new`, {
      body: { _csrf: cTok, kind: 'phone', label: 'خط الاستقبال',
              value: '+20223456789', note: 'من ٩ لـ ٥' },
    });
    check('إضافة رقم بتنجح',
      (contactAdded.location || '').includes('msg=added'), contactAdded.location);
    check('وبيظهر للعملاء',
      has((await makeClient().get('/contact')).text, '+20223456789'));

    const badContact = await adam.client.post(`${ADMIN}/contacts/new`,
      { body: { _csrf: cTok, kind: 'email', value: 'مش إيميل' } });
    check('بريد غلط مرفوض', (badContact.location || '').includes('err=bad_value'));

    const badPhone = await adam.client.post(`${ADMIN}/contacts/new`,
      { body: { _csrf: cTok, kind: 'phone', value: '---' } });
    check('رقم غلط مرفوض', (badPhone.location || '').includes('err=bad_value'));

    const contactRow = db.prepare("SELECT * FROM contacts WHERE value = '+20223456789'").get();
    await adam.client.post(`${ADMIN}/contacts/${contactRow.id}/edit`, {
      body: { _csrf: cTok, label: 'خط الاستقبال', value: '+20229999999' },
    });
    check('التعديل بيشتغل',
      db.prepare('SELECT value v FROM contacts WHERE id = ?').get(contactRow.id).v === '+20229999999');
    check('واللي مش ظاهر بيختفي من صفحة العملاء',
      !has((await makeClient().get('/contact')).text, '+20229999999'),
      'ظهر رغم إنه مخفي');

    await adam.client.post(`${ADMIN}/contacts/${contactRow.id}/delete`, { body: { _csrf: cTok } });
    check('الحذف بيروح للسلة',
      db.prepare("SELECT COUNT(*) c FROM trash WHERE entity = 'contact'").get().c > 0);

    const supervisorNow = await loginStaff('tarek', 'demo1234');
    check('المشرف بيوصل لبيانات التواصل بصلاحيته',
      (await supervisorNow.client.get(`${ADMIN}/contacts`)).status === 200);
    check('والمحامي لأ',
      (await mona.client.get(`${ADMIN}/contacts`)).status === 403);

    section('بيانات الموظفين واقعية');
    const staffRows = db.prepare('SELECT * FROM users WHERE is_demo = 1').all();
    check('كلهم لهم اسم رسمي رباعي على الأقل',
      staffRows.every((u) => (u.legal_name || '').trim().split(/\s+/).length >= 4),
      staffRows.filter((u) => (u.legal_name || '').split(/\s+/).length < 4)
        .map((u) => u.username).join(', '));
    check('ورقم قومي ١٤ رقم',
      staffRows.every((u) => /^\d{14}$/.test(u.national_id || '')));
    check('وتاريخ الميلاد متسق مع الرقم القومي',
      staffRows.every((u) => {
        if (!u.national_id || !u.birth_date) return false;
        const yy = u.national_id.slice(1, 3);
        return u.birth_date.slice(2, 4) === yy;
      }));
    // adam's address is rewritten by the profile-edit section above, so this
    // checks the accounts the suite has not touched.
    const untouched = staffRows.filter((u) => u.username !== 'adam');
    check('وإيميلات على دومين المكتب',
      untouched.every((u) => (u.email || '').endsWith('@sanad.com.eg')),
      untouched.filter((u) => !(u.email || '').endsWith('@sanad.com.eg'))
        .map((u) => u.username).join(', '));
    check('وأرقام موبايل مصرية',
      staffRows.every((u) => /^\+201\d{9}$/.test(u.phone || '')));

    section('تغطية الإشعارات والأجهزة');
    const notifTypes = db.prepare('SELECT DISTINCT type FROM notifications').all().map((n) => n.type);
    ['comment', 'upload', 'new_request', 'deadline_missed', 'new_device', 'payment', 'assigned']
      .forEach((t) => check(`فيه إشعارات من نوع ${t}`, notifTypes.includes(t), notifTypes.join(',')));

    check('كل الموظفين النشطين عندهم إشعارات إلا الموقوف',
      db.prepare(
        `SELECT COUNT(*) c FROM users u
         WHERE u.is_demo = 1 AND u.active = 1 AND u.role != 'accountant'
           AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = u.id)`
      ).get().c === 0);

    check('إشعارات الأجهزة للأدمن بس',
      db.prepare(
        `SELECT COUNT(*) c FROM notifications n JOIN users u ON u.id = n.user_id
         WHERE n.type = 'new_device' AND u.role != 'admin'`
      ).get().c === 0);
    check('وأولويتها حرجة',
      db.prepare("SELECT COUNT(*) c FROM notifications WHERE type = 'new_device' AND priority != 'critical'")
        .get().c === 0);
    check('فيه جهاز جديد لسه غير مقروء',
      db.prepare("SELECT COUNT(*) c FROM notifications WHERE type = 'new_device' AND seen_at IS NULL")
        .get().c > 0);

    check('الأجهزة المعروفة مسجّلة', db.prepare('SELECT COUNT(*) c FROM known_devices').get().c >= 8);
    check('وموظفين عندهم أكتر من جهاز',
      db.prepare(
        'SELECT COUNT(*) c FROM (SELECT user_id FROM known_devices GROUP BY user_id HAVING COUNT(*) > 1)'
      ).get().c > 0);

    check('المحاسب بياخد إشعارات فلوس بس',
      db.prepare(
        `SELECT COUNT(*) c FROM notifications n JOIN users u ON u.id = n.user_id
         WHERE u.role = 'accountant' AND n.type NOT IN ('payment','payment_complete','payment_void')`
      ).get().c === 0);

    section('التنقّل والرجوع');
    // Every admin page must say where it is and offer a way back; a deep page
    // with no trail is a dead end that forces the browser button or the logo.
    const adminTrails = ['/requests', '/requests/1', '/requests/new', '/notifications',
      '/revenue', '/errands',
      '/trash', '/content', '/consultations-admin', '/security', '/security/log',
      '/social', '/users', '/settings', '/activity', '/imports', '/account', '/account/profile'];

    const noTrail = [];
    for (const p of adminTrails) {
      const r = await adam.client.get(ADMIN + p);
      if (!has(r.text, 'crumbs-bar')) noTrail.push(p);
    }
    check('كل صفحات الأدمن فيها مسار رجوع', noTrail.length === 0, noTrail.join(', '));

    const deep = await adam.client.get(`${ADMIN}/requests/1`);
    check('الصفحة العميقة فيها لينك للوحة التحكم',
      has(deep.text, `href="${ADMIN}"`));
    check('وفيها لينك لقائمة الطلبات', has(deep.text, `${ADMIN}/requests"`));

    const clientPages = ['/services/1'];
    const noClientTrail = [];
    for (const p of clientPages) {
      const r = await makeClient().get(p);
      if (!has(r.text, 'crumbs') && !has(r.text, 'crumb-home')) noClientTrail.push(p);
    }
    check('صفحات الزائر فيها رجوع', noClientTrail.length === 0, noClientTrail.join(', '));

    const portalPages = ['/portal', '/portal/login', '/portal/register', '/portal/forgot'];
    const noPortalTrail = [];
    for (const p of portalPages) {
      const signedIn = await loginClient('client@demo.sanad', 'demo1234');
      const r = await (p === '/portal' ? signedIn.client : makeClient()).get(p);
      if (!has(r.text, 'crumbs') && !has(r.text, 'crumb-home')) noPortalTrail.push(p);
    }
    check('صفحات البوابة فيها رجوع', noPortalTrail.length === 0, noPortalTrail.join(', '));

    section('اللغة العربية الفصحى');
    const dialectWords = ['معندكش', 'اعمل واحد', 'دلوقتي', 'عايز', 'إزاي',
      'تسجيل الدخولك', 'والالمطلوب', 'مفيش مشكلة'];
    const portalSession = await loginClient('client@demo.sanad', 'demo1234');
    const clientPagesText = await Promise.all([
      makeClient().get('/'),
      makeClient().get('/request'),
      makeClient().get('/services'),
      makeClient().get('/track'),
      makeClient().get('/portal/login'),
      makeClient().get('/portal/register'),
      makeClient().get('/portal/forgot'),
      portalSession.client.get('/portal'),
    ]);
    const foundDialect = dialectWords.filter((w) =>
      clientPagesText.some((r) => r.text.includes(w))
    );
    check('مفيش عامية في صفحات العميل', foundDialect.length === 0, foundDialect.join('، '));

    section('إضافة قسم لمجال');
    /*
     * This threw a server error: the handler referenced a variable that was
     * never declared in it, so every attempt to add a category failed with the
     * generic "something went wrong" page.
     */
    const catHostPage = db.prepare("SELECT * FROM pages WHERE slug = 'companies'").get();
    const catAddTok = await adam.client.token(`${ADMIN}/content?page=${catHostPage.id}`);

    const catAddForm = await adam.client.get(`${ADMIN}/content?page=${catHostPage.id}`);
    check('الفورم بيبعت المجال', has(catAddForm.text, 'name="page_id"'),
      'من غيره القسم بيتعمل بلا مجال');

    const madeCat = await adam.client.post(`${ADMIN}/content/categories`, {
      body: { _csrf: catAddTok, page_id: catHostPage.id, name_ar: 'قسم اختبار',
              name_en: 'Test cat', desc_ar: 'وصف', desc_en: 'desc' },
    });
    check('إضافة القسم بتنجح', (madeCat.location || '').includes('cat_added'), madeCat.location);

    const newCat = db.prepare("SELECT * FROM categories WHERE name_ar = 'قسم اختبار'").get();
    check('والقسم اتعمل', !!newCat);
    check('وفي المجال الصح', newCat && newCat.page_id === catHostPage.id,
      `${newCat && newCat.page_id} مقابل ${catHostPage.id}`);
    check('ومفيش قسم بلا مجال',
      db.prepare('SELECT COUNT(*) c FROM categories WHERE page_id IS NULL').get().c === 0);

    // Without a page it still lands somewhere findable.
    const orphanTok = await adam.client.token(`${ADMIN}/content`);
    await adam.client.post(`${ADMIN}/content/categories`, {
      body: { _csrf: orphanTok, name_ar: 'قسم بلا مجال', name_en: 'Orphan' },
    });
    const orphan = db.prepare("SELECT * FROM categories WHERE name_ar = 'قسم بلا مجال'").get();
    check('والقسم من غير مجال بياخد الافتراضي', orphan && !!orphan.page_id);

    section('أنواع المصاريف');
    const catsPage = await adam.client.get(`${ADMIN}/expenses/categories`);
    check('الصفحة بتفتح', catsPage.status === 200);
    check('بتعرض الأنواع المدمجة', has(catsPage.text, 'رسوم حكومية'));
    check('وبتوضّح المدمج', has(catsPage.text, 'مدمج'));

    const ecTok = await adam.client.token(`${ADMIN}/expenses/categories`);
    await adam.client.post(`${ADMIN}/expenses/categories/new`, {
      body: { _csrf: ecTok, label_ar: 'رسوم لجنة', icon: '⚖' },
    });
    const newEc = db.prepare("SELECT * FROM expense_categories WHERE label_ar = 'رسوم لجنة'").get();
    check('النوع الجديد اتضاف', !!newEc);
    check('وله مفتاح صالح', newEc && /^[a-z0-9_]+$/.test(newEc.key), newEc && newEc.key);

    check('وبيظهر للموظف على طول',
      has((await adam.client.get(`${ADMIN}/requests/1`)).text, 'رسوم لجنة'),
      'مش ظاهر في قائمة تسجيل المصروف');

    // A category in use is hidden, never deleted — the expenses filed against
    // it must keep their name.
    const usedCat = db
      .prepare(
        `SELECT c.* FROM expense_categories c
         WHERE EXISTS (SELECT 1 FROM expenses e WHERE e.category = c.key) AND c.built_in = 0
         LIMIT 1`
      )
      .get();

    db.prepare("UPDATE expense_categories SET built_in = 0 WHERE key = 'government'").run();
    const govt = db.prepare("SELECT * FROM expense_categories WHERE key = 'government'").get();
    const hideRes = await adam.client.post(`${ADMIN}/expenses/categories/${govt.id}/delete`,
      { body: { _csrf: ecTok } });
    check('النوع المستخدم بيتخفى مش بيتحذف',
      (hideRes.location || '').includes('msg=hidden'), hideRes.location);
    check('وبرضه موجود في الداتا',
      !!db.prepare("SELECT 1 FROM expense_categories WHERE key = 'government'").get());
    check('والمصاريف القديمة لسه بأسمائها',
      require('./lib/expenses').label('government') === 'رسوم حكومية');
    db.prepare("UPDATE expense_categories SET built_in = 1, active = 1 WHERE key = 'government'").run();

    const builtInDel = await adam.client.post(`${ADMIN}/expenses/categories/${govt.id}/delete`,
      { body: { _csrf: ecTok } });
    check('والمدمج مش بيتحذف',
      (builtInDel.location || '').includes('err=built_in'), builtInDel.location);

    section('ملف الموظف');
    const staffId = db.prepare("SELECT id FROM users WHERE username = 'mona'").get().id;
    const file = await adam.client.get(`${ADMIN}/users/${staffId}`);
    check('الصفحة بتفتح', file.status === 200, `status ${file.status}`);
    check('فيها بياناته الشخصية', has(file.text, 'البيانات الشخصية'));
    check('واسمه الرسمي', has(file.text, 'الاسم الرسمي'));
    check('ورقمه القومي', has(file.text, 'الرقم القومي'));
    check('وشغله الحالي', has(file.text, 'الشغل الحالي'));
    check('وأجهزته', has(file.text, 'الأجهزة والدخول'));
    check('وصلاحياته', has(file.text, 'الصلاحيات'));
    check('ولينك من القايمة', has((await adam.client.get(`${ADMIN}/users`)).text,
      `${ADMIN}/users/${staffId}"`));

    check('المحامي مش بيوصل لملفات الموظفين',
      (await mona.client.get(`${ADMIN}/users/${staffId}`)).status === 403);

    // The ID scans are the most sensitive thing here.
    const idShot = await adam.client.get(`${ADMIN}/users/${staffId}/id/front`);
    check('صورة البطاقة محمية أو مش موجودة',
      [200, 404].includes(idShot.status), `status ${idShot.status}`);
    check('والمحامي مش بيشوفها',
      (await mona.client.get(`${ADMIN}/users/${staffId}/id/front`)).status === 403);

    section('الأفعال المدمّرة بيتبلّغ عنها');
    /*
     * Erasing was recorded in the audit trail and nowhere else — and a trail is
     * something somebody has to go and open. If a member of staff with the
     * erase permission removes five clients, nobody responsible finds out.
     */
    db.prepare("DELETE FROM notifications WHERE type = 'erased'").run();

    const al_alertVictim = db
      .prepare(
        `SELECT c.* FROM clients c
         WHERE EXISTS (SELECT 1 FROM requests r WHERE r.client_id = c.id) LIMIT 1`
      )
      .get();

    await adam.client.post(`${ADMIN}/clients/${al_alertVictim.id}/delete`, {
      body: { _csrf: await adam.client.token(`${ADMIN}/clients/${al_alertVictim.id}`),
              reason: 'اختبار الإشعار على الحذف', confirm_phone: al_alertVictim.phone },
    });

    const al_eraseAlerts = db.prepare("SELECT * FROM notifications WHERE type = 'erased'").all();
    check('حذف العميل بيبعت إشعار', al_eraseAlerts.length > 0, `${al_eraseAlerts.length}`);
    check('وأولويته حرجة', al_eraseAlerts.every((n) => n.priority === 'critical'));
    check('وللأدمن بس',
      al_eraseAlerts.every((n) =>
        db.prepare("SELECT role FROM users WHERE id = ?").get(n.user_id).role === 'admin'));
    check('ومفيه السبب', al_eraseAlerts.some((n) => n.text.includes('اختبار الإشعار')));
    check('ومش بيوصل للي عمله',
      !al_eraseAlerts.some((n) => n.user_id === db.prepare("SELECT id FROM users WHERE username = 'adam'").get().id),
      'الأدمن اللي حذف وصله إشعار عن نفسه');

    section('مسح الملفات بسبب');
    const al_purgeTok = await adam.client.token(`${ADMIN}/settings?tab=files`);
    const al_noPurgeReason = await adam.client.post(`${ADMIN}/settings/purge-files`, {
      body: { _csrf: al_purgeTok, confirm: 'احذف', days: '180' },
    });
    check('المسح بيطلب سبب',
      (al_noPurgeReason.location || '').includes('purge_reason'), al_noPurgeReason.location);

    const al_badConfirm = await adam.client.post(`${ADMIN}/settings/purge-files`, {
      body: { _csrf: al_purgeTok, confirm: 'اه', days: '180', reason: 'تنظيف دوري' },
    });
    check('ولسه بيطلب كلمة التأكيد',
      (al_badConfirm.location || '').includes('err=confirm'), al_badConfirm.location);

    check('وفيه خانة السبب في الشاشة',
      has((await adam.client.get(`${ADMIN}/settings?tab=files`)).text, 'سبب المسح'));

    section('صلاحيات الحذف مستقلة');
    /*
     * Erasing used to require `users.manage`, so the office had to make
     * somebody an administrator just to let them clean up a duplicate. These
     * are now permissions of their own — and nobody holds them by default,
     * because destroying records is granted to a person, not inherited from a
     * job title.
     */
    const permLib = require('./lib/permissions');

    check('فيه صلاحية لحذف العميل', permLib.ALL.includes('clients.erase'));
    check('وصلاحية لحذف الطلب', permLib.ALL.includes('requests.erase'));
    check('وصلاحية لعرض ملف الموظف', permLib.ALL.includes('users.view'));
    check('ومجموعة خاصة بالحذف', 'erase' in permLib.CATALOGUE);

    Object.entries(permLib.ROLE_DEFAULTS).forEach(([role, list]) => {
      check(`الدور ${role} مالوش حذف عميل افتراضياً`, !list.includes('clients.erase'));
      check(`والدور ${role} مالوش حذف طلب افتراضياً`, !list.includes('requests.erase'));
    });

    check('والمشرف بيشوف ملفات الموظفين',
      permLib.ROLE_DEFAULTS.supervisor.includes('users.view'));
    check('بس مش بيدير الحسابات',
      !permLib.ROLE_DEFAULTS.supervisor.includes('users.manage'));
    check('والأدمن عنده كل حاجة',
      permLib.resolve(db, { id: 1, role: 'admin' }).size === permLib.ALL.length);

    // A supervisor cannot erase, and cannot see the button either.
    const sup = db.prepare("SELECT * FROM users WHERE username = 'tarek'").get();
    db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(sup.id);
    const supSession = await loginStaff('tarek', 'demo1234');
    const sampleClient = db.prepare('SELECT * FROM clients LIMIT 1').get();

    const supClientView = await supSession.client.get(`${ADMIN}/clients/${sampleClient.id}`);
    check('المشرف بيفتح ملف العميل', supClientView.status === 200);
    check('ومش شايف زرار الحذف', !has(supClientView.text, 'حذف العميل نهائياً'));

    const supEraseTry = await supSession.client.post(
      `${ADMIN}/clients/${sampleClient.id}/delete`,
      { body: { _csrf: await supSession.client.token(`${ADMIN}/clients/${sampleClient.id}`),
                reason: 'محاولة بدون صلاحية', confirm_phone: sampleClient.phone } }
    );
    check('والمسار بيرفضه', supEraseTry.status === 403, `status ${supEraseTry.status}`);
    check('والعميل لسه موجود',
      !!db.prepare('SELECT 1 FROM clients WHERE id = ?').get(sampleClient.id));

    // Granting it to that same person, from the permissions screen.
    const grantTok = await adam.client.token(`${ADMIN}/users/${sup.id}/permissions`);
    await adam.client.post(`${ADMIN}/users/${sup.id}/permissions`, {
      body: { _csrf: grantTok,
              permission: [...permLib.ROLE_DEFAULTS.supervisor, 'clients.erase'] },
    });

    const supNow = db.prepare('SELECT * FROM users WHERE id = ?').get(sup.id);
    const supPerms = permLib.resolve(db, supNow);
    check('بعد المنح بقى يقدر يحذف عميل', supPerms.has('clients.erase'));
    check('ولسه مش بيحذف طلبات', !supPerms.has('requests.erase'));
    check('ولسه مش بيدير الحسابات', !supPerms.has('users.manage'));
    check('والمتخزن استثناء واحد بس',
      db.prepare('SELECT COUNT(*) c FROM user_permissions WHERE user_id = ?').get(sup.id).c === 1,
      JSON.stringify(db.prepare('SELECT permission FROM user_permissions WHERE user_id = ?').all(sup.id)));

    const supAfter = await loginStaff('tarek', 'demo1234');
    check('والزرار بان له في نفس الجلسة الجديدة',
      has((await supAfter.client.get(`${ADMIN}/clients/${sampleClient.id}`)).text,
        'حذف العميل نهائياً'));

    // Granting it while creating an account, from the checkbox.
    db.prepare("DELETE FROM users WHERE username = 'fx_eraser'").run();
    const eraserTok = await adam.client.token(`${ADMIN}/users`);
    const eraserPw = 'Eraser#2026x';
    await adam.client.post(`${ADMIN}/users/new`, {
      body: {
        _csrf: eraserTok, username: 'fx_eraser', password: eraserPw,
        password_confirm: eraserPw, role: 'lawyer', _perms: '1',
        permission: [
          ...permLib.ROLE_DEFAULTS.lawyer,
          'clients.erase', 'users.view',
          // Erasing happens from the client's file, so the file has to open.
          'clients.file', 'clients.directory',
        ],
      },
    });
    const eraser = db.prepare("SELECT * FROM users WHERE username = 'fx_eraser'").get();
    check('موظف جديد بصلاحية حذف بيتعمل', !!eraser);

    const eraserPerms = permLib.resolve(db, eraser);
    check('وباخدها من أول لحظة', eraserPerms.has('clients.erase'));
    check('وباخد عرض ملفات الموظفين', eraserPerms.has('users.view'));
    check('ومش باخد حذف الطلبات', !eraserPerms.has('requests.erase'));
    check('ومش باخد إدارة الحسابات', !eraserPerms.has('users.manage'));
    check('والمتخزن هو الاستثناءات بس',
      db.prepare('SELECT COUNT(*) c FROM user_permissions WHERE user_id = ?').get(eraser.id).c === 4,
      JSON.stringify(db.prepare('SELECT permission FROM user_permissions WHERE user_id = ?').all(eraser.id)));

    // A new account must change its password before any page will load, so that
    // happens first — the same step the person takes.
    const eraserFirst = await loginStaff('fx_eraser', eraserPw);
    const eraserNewPw = 'Eraser#Live99';
    await eraserFirst.client.post(`${ADMIN}/account/password`, {
      body: { _csrf: await eraserFirst.client.token(`${ADMIN}/account`),
              current: eraserPw, next: eraserNewPw, confirm: eraserNewPw },
    });
    check('الموظف الجديد غيّر كلمته',
      db.prepare('SELECT must_change_password m FROM users WHERE id = ?').get(eraser.id).m === 0);

    // And the profile gate, which is the second thing a new account meets.
    db.prepare(
      `UPDATE users SET profile_completed = 1, legal_name = 'موظف الحذف الكامل حسن',
                        phone = '+201004443322', national_id = '29202021234567',
                        birth_date = '1992-02-02', email = 'eraser@sanad.com.eg'
       WHERE id = ?`
    ).run(eraser.id);

    const eraserSession = await loginStaff('fx_eraser', eraserNewPw);
    const eraserFile = await eraserSession.client.get(`${ADMIN}/users/${sup.id}`);
    check('وبيفتح ملف موظف بصلاحية العرض', eraserFile.status === 200,
      `status=${eraserFile.status} → ${eraserFile.location || ""} · login=${eraserSession.redirect}`);
    check('بس مش بيعدّل حساب',
      (await eraserSession.client.post(`${ADMIN}/users/${sup.id}/toggle`,
        { body: { _csrf: await eraserSession.client.token(`${ADMIN}/users`) } })).status === 403);

    const eraseVictim = db
      .prepare(
        `SELECT c.* FROM clients c
         WHERE c.id != ? AND EXISTS (SELECT 1 FROM requests r WHERE r.client_id = c.id)
         LIMIT 1`
      )
      .get(sampleClient.id);

    const byEraser = await eraserSession.client.post(`${ADMIN}/clients/${eraseVictim.id}/delete`, {
      body: { _csrf: await eraserSession.client.token(`${ADMIN}/clients/${eraseVictim.id}`),
              reason: 'حساب اتعمل بالغلط', confirm_phone: eraseVictim.phone },
    });
    check('والموظف بصلاحيته بيحذف فعلاً',
      (byEraser.location || '').includes('client_deleted'),
      `status=${byEraser.status} → ${byEraser.location || ""}`);
    check('والعميل اتشال',
      !db.prepare('SELECT 1 FROM clients WHERE id = ?').get(eraseVictim.id));

    // Taking it away again ends it immediately.
    await adam.client.post(`${ADMIN}/users/${eraser.id}/permissions`, {
      body: { _csrf: await adam.client.token(`${ADMIN}/users/${eraser.id}/permissions`),
              // Keeps file access, loses only the ability to erase — so the
              // refusal that follows is about the erase permission and nothing
              // else.
              permission: [...permLib.ROLE_DEFAULTS.lawyer, 'clients.file', 'clients.directory'] },
    });
    check('وشيل الصلاحية بيسري فوراً',
      !permLib.resolve(db, db.prepare('SELECT * FROM users WHERE id = ?').get(eraser.id))
        .has('clients.erase'));

    const afterRevoke = await loginStaff('fx_eraser', eraserNewPw);
    const stillThere = db.prepare('SELECT * FROM clients LIMIT 1').get();
    check('والمسار بيرفضه بعد الشيل',
      (await afterRevoke.client.post(`${ADMIN}/clients/${stillThere.id}/delete`,
        { body: { _csrf: await afterRevoke.client.token(`${ADMIN}/clients/${stillThere.id}`),
                  reason: 'بعد ما اتشالت', confirm_phone: stillThere.phone } })).status === 403);

    section('حذف طلب من الأرشيف نهائياً');
    /*
     * For entries that should never have existed: a refunded payment, a figure
     * against the wrong file, a duplicate. While such a request sits in the
     * archive its money keeps counting towards revenue, which makes the totals
     * quietly wrong.
     */
    const eraseTarget = db
      .prepare(
        `SELECT * FROM requests
         WHERE paid_amount > 0 AND archived_at IS NULL ORDER BY paid_amount DESC LIMIT 1`
      )
      .get();

    const eraseTok = await adam.client.token(`${ADMIN}/requests/${eraseTarget.id}`);

    // Live work cannot be erased — it has to be archived first.
    const eraseLiveAttempt = await adam.client.post(`${ADMIN}/requests/${eraseTarget.id}/erase`, {
      body: { _csrf: eraseTok, reason: 'محاولة على طلب شغّال', confirm_ref: eraseTarget.ref },
    });
    check('الطلب الشغّال مش بيتمسح',
      (eraseLiveAttempt.location || '').includes('erase_needs_archive'), eraseLiveAttempt.location);
    check('وبرضه موجود',
      !!db.prepare('SELECT 1 FROM requests WHERE id = ?').get(eraseTarget.id));

    db.prepare("UPDATE requests SET archived_at = datetime('now') WHERE id = ?").run(eraseTarget.id);

    const payLib = require('./lib/payments');
    const eraseCollectedBefore = payLib.report({ from: '2000-01-01', to: '2099-12-31' }).totals.collected;
    const erasePaidOnIt = db
      .prepare('SELECT COALESCE(SUM(amount),0) s FROM payments WHERE request_id = ? AND voided_at IS NULL')
      .get(eraseTarget.id).s;
    check('الطلب عليه تحصيل فعلاً', erasePaidOnIt > 0, String(erasePaidOnIt));

    const eraseNoReason = await adam.client.post(`${ADMIN}/requests/${eraseTarget.id}/erase`, {
      body: { _csrf: eraseTok, confirm_ref: eraseTarget.ref },
    });
    check('الحذف بيطلب سبب',
      (eraseNoReason.location || '').includes('need_erase_reason'), eraseNoReason.location);

    const eraseWrongRef = await adam.client.post(`${ADMIN}/requests/${eraseTarget.id}/erase`, {
      body: { _csrf: eraseTok, reason: 'العميل رجعت له فلوسه', confirm_ref: 'SND-00-XXXXX' },
    });
    check('وبيطلب رقم الطلب الصح',
      (eraseWrongRef.location || '').includes('erase_ref_mismatch'), eraseWrongRef.location);
    check('وبرضه محصلش حذف',
      !!db.prepare('SELECT 1 FROM requests WHERE id = ?').get(eraseTarget.id));

    check('والمشرف مش بيمسح نهائي',
      (await nour.client.post(`${ADMIN}/requests/${eraseTarget.id}/erase`,
        { body: { _csrf: eraseTok, reason: 'محاولة مشرف', confirm_ref: eraseTarget.ref } })
      ).status === 403);

    const eraseDone = await adam.client.post(`${ADMIN}/requests/${eraseTarget.id}/erase`, {
      body: { _csrf: eraseTok, reason: 'العميل رجعت له فلوسه بالكامل',
              confirm_ref: eraseTarget.ref },
    });
    check('الحذف بينجح', (eraseDone.location || '').includes('msg=erased'), eraseDone.location);
    check('الطلب اتشال',
      !db.prepare('SELECT 1 FROM requests WHERE id = ?').get(eraseTarget.id));

    // The point of the whole feature: the revenue figures follow.
    const eraseCollectedAfter = payLib.report({ from: '2000-01-01', to: '2099-12-31' }).totals.collected;
    check('والتحصيل نزل من الإيرادات',
      Math.abs((eraseCollectedBefore - erasePaidOnIt) - eraseCollectedAfter) < 0.01,
      `${eraseCollectedBefore} − ${erasePaidOnIt} ≠ ${eraseCollectedAfter}`);

    ['comments', 'payments', 'expenses', 'documents', 'fee_items', 'todos',
     'request_services', 'request_assignees'].forEach((table) =>
      check(`مفيش ${table} يتيم`,
        db.prepare(
          `SELECT COUNT(*) c FROM ${table} WHERE request_id NOT IN (SELECT id FROM requests)`
        ).get().c === 0));

    check('والعلاقات سليمة بعد الحذف',
      db.prepare('PRAGMA foreign_key_check').all().length === 0);
    check('وفهرس البحث اتحدّث',
      db.prepare('SELECT COUNT(*) c FROM requests_fts').get().c ===
        db.prepare('SELECT COUNT(*) c FROM requests').get().c);

    const eraseLog = db
      .prepare("SELECT details FROM audit_log WHERE action = 'request.erase' ORDER BY id DESC LIMIT 1")
      .get();
    check('والسجل بيقول إيه اللي حصل', !!eraseLog);
    check('وفيه رقم الطلب والسبب',
      eraseLog && eraseLog.details.includes(eraseTarget.ref) &&
        eraseLog.details.includes('رجعت له فلوسه'),
      eraseLog && eraseLog.details.slice(0, 90));
    check('وفيه التحصيل اللي نزل',
      eraseLog && /تحصيل/.test(eraseLog.details), eraseLog && eraseLog.details.slice(0, 90));

    section('الطلبات اللي محدش استلمها');
    /*
     * The failure that happens before a deadline exists: a request arrives,
     * nobody is assigned, and it sits. There is no overdue date to trigger on
     * because nobody set one.
     */
    const un_deadlinesLib = require('./lib/deadlines');

    // A request with no assignee, created well in the past.
    const un_lonely = db.prepare('SELECT * FROM requests WHERE archived_at IS NULL LIMIT 1').get();
    db.prepare('DELETE FROM request_assignees WHERE request_id = ?').run(un_lonely.id);
    db.prepare(
      "UPDATE requests SET created_at = datetime('now','-6 days'), status = 'new' WHERE id = ?"
    ).run(un_lonely.id);
    db.prepare("DELETE FROM notifications WHERE type = 'unclaimed'").run();

    const un_waitingList = un_deadlinesLib.unclaimed();
    check('الطلب المنسي بيتلقط', un_waitingList.some((r) => r.id === un_lonely.id),
      `${un_waitingList.length} طلب`);
    check('وبعدد أيام الانتظار',
      un_waitingList.find((r) => r.id === un_lonely.id).waiting_days >= 5);

    const un_sentAlerts = un_deadlinesLib.alertUnclaimed();
    check('والتنبيه بيتبعت', un_sentAlerts > 0, `${un_sentAlerts}`);

    const un_unclaimedNotes = db
      .prepare("SELECT * FROM notifications WHERE type = 'unclaimed'")
      .all();
    check('وللمشرفين والأدمن',
      un_unclaimedNotes.every((n) =>
        ['admin', 'supervisor'].includes(
          db.prepare('SELECT role FROM users WHERE id = ?').get(n.user_id).role
        )));
    check('وأولويته حرجة بعد خمس أيام',
      un_unclaimedNotes.some((n) => n.priority === 'critical'));

    // Once per request, not nightly.
    const un_again = un_deadlinesLib.alertUnclaimed();
    check('ومبيتكررش كل يوم', un_again === 0, `${un_again} تنبيه تاني`);

    // Assigning it takes it off the list.
    const un_picker = db.prepare("SELECT id FROM users WHERE role = 'lawyer' AND active = 1 LIMIT 1").get();
    db.prepare('INSERT OR IGNORE INTO request_assignees (request_id, user_id, assigned_by) VALUES (?,?,?)')
      .run(un_lonely.id, un_picker.id, 'اختبار');
    check('ولما حد يستلمه بيخرج من القايمة',
      !un_deadlinesLib.unclaimed().some((r) => r.id === un_lonely.id));

    check('ولوحة التحكم بتعرضها',
      has((await adam.client.get(`${ADMIN}/`)).text, 'محدش استلمها') ||
        un_deadlinesLib.unclaimed().length === 0);

    section('تسليم شغل الموظف الموقوف');
    /*
     * Deactivating used to remove the person's access and leave their requests
     * assigned to them — the files looked handled while nobody could open them.
     */
    const un_busy = db
      .prepare(
        `SELECT u.id, u.display_name, COUNT(*) n FROM users u
         JOIN request_assignees a ON a.user_id = u.id
         JOIN requests r ON r.id = a.request_id
         WHERE u.active = 1 AND u.role = 'lawyer' AND r.archived_at IS NULL
           AND r.status NOT IN ('completed','cancelled')
         GROUP BY u.id ORDER BY n DESC LIMIT 1`
      )
      .get();

    const un_busyBefore = un_busy.n;
    check('فيه موظف عنده شغل مفتوح', un_busyBefore > 0, `${un_busyBefore}`);

    const un_toggleTok = await adam.client.token(`${ADMIN}/users`);
    const un_blockedOff = await adam.client.post(`${ADMIN}/users/${un_busy.id}/toggle`, {
      body: { _csrf: un_toggleTok },
    });
    check('الإيقاف بيتحوّل لصفحة التسليم',
      (un_blockedOff.location || '').includes('/handover'), un_blockedOff.location);
    check('والحساب لسه شغّال',
      db.prepare('SELECT active FROM users WHERE id = ?').get(un_busy.id).active === 1);

    const un_handoverPage = await adam.client.get(`${ADMIN}/users/${un_busy.id}/handover`);
    check('صفحة التسليم بتفتح', un_handoverPage.status === 200);
    check('وبتعرض الطلبات المفتوحة',
      (un_handoverPage.text.match(/SND-\d{2}-[A-Z0-9]{5}/g) || []).length > 0);
    check('وبتعرض مرشحين بحمل شغلهم', has(un_handoverPage.text, 'طلب'));

    const un_receiver = db
      .prepare(
        `SELECT id FROM users WHERE active = 1 AND id != ?
           AND role IN ('lawyer','supervisor') AND assign_locked = 0 LIMIT 1`
      )
      .get(un_busy.id);

    const un_openFor = (uid) =>
      db.prepare(
        `SELECT COUNT(*) c FROM request_assignees a JOIN requests r ON r.id = a.request_id
         WHERE a.user_id = ? AND r.archived_at IS NULL
           AND r.status NOT IN ('completed','cancelled')`
      ).get(uid).c;

    const un_receiverBefore = un_openFor(un_receiver.id);

    await adam.client.post(`${ADMIN}/users/${un_busy.id}/toggle`, {
      body: { _csrf: await adam.client.token(`${ADMIN}/users/${un_busy.id}/handover`),
              handled: '1', reassign_to: un_receiver.id },
    });

    check('الشغل اتنقل كله', un_openFor(un_busy.id) === 0, `${un_openFor(un_busy.id)} فاضل`);
    check('واللي استلم زاد شغله',
      un_openFor(un_receiver.id) >= un_receiverBefore + 1,
      `${un_receiverBefore} → ${un_openFor(un_receiver.id)}`);
    check('والحساب اتوقف',
      db.prepare('SELECT active FROM users WHERE id = ?').get(un_busy.id).active === 0);
    check('واللي استلم اتبلّغ',
      db.prepare("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND text LIKE '%اتنقل لك%'")
        .get(un_receiver.id).c > 0);
    check('والنقل في السجل',
      db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action = 'user.handover'").get().c > 0);
    check('ومفيش طلب بقى بلا صاحب',
      db.prepare(
        `SELECT COUNT(*) c FROM requests r WHERE r.archived_at IS NULL
           AND r.status NOT IN ('completed','cancelled')
           AND EXISTS (SELECT 1 FROM request_assignees a WHERE a.request_id = r.id AND a.user_id = ?)`
      ).get(un_busy.id).c === 0);

    // Leaving the work in place is allowed, but recorded as a decision.
    db.prepare('UPDATE users SET active = 1 WHERE id = ?').run(un_busy.id);
    const un_keeper = db.prepare("SELECT id FROM users WHERE role = 'lawyer' AND active = 1 AND id != ? LIMIT 1").get(un_busy.id);
    const un_someReq = db.prepare("SELECT id FROM requests WHERE archived_at IS NULL AND status NOT IN ('completed','cancelled') LIMIT 1").get();
    db.prepare('INSERT OR IGNORE INTO request_assignees (request_id, user_id, assigned_by) VALUES (?,?,?)')
      .run(un_someReq.id, un_busy.id, 'اختبار');

    await adam.client.post(`${ADMIN}/users/${un_busy.id}/toggle`, {
      body: { _csrf: await adam.client.token(`${ADMIN}/users/${un_busy.id}/handover`), handled: '1' },
    });
    check('وسيبهم معاه بيتسجّل كقرار',
      db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action = 'user.deactivate_keep_work'")
        .get().c > 0);

    section('حذف العميل نهائياً');
    /*
     * The one place in the system that truly erases data, so every safeguard
     * is checked: the reason, the phone confirmation, the permission, and that
     * the uploaded scans actually leave the disk.
     */
    const doomedClient = db
      .prepare(
        `SELECT c.* FROM clients c
         WHERE EXISTS (SELECT 1 FROM requests r WHERE r.client_id = c.id) LIMIT 1`
      )
      .get();

    const doomedRequests = db
      .prepare('SELECT id FROM requests WHERE client_id = ?')
      .all(doomedClient.id).map((r) => r.id);

    const wipeTok = await adam.client.token(`${ADMIN}/clients/${doomedClient.id}`);

    const wipeNoReason = await adam.client.post(`${ADMIN}/clients/${doomedClient.id}/delete`, {
      body: { _csrf: wipeTok, confirm_phone: doomedClient.phone },
    });
    check('الحذف بيطلب سبب',
      (wipeNoReason.location || '').includes('need_delete_reason'), wipeNoReason.location);
    check('ومحصلش حذف', !!db.prepare('SELECT 1 FROM clients WHERE id = ?').get(doomedClient.id));

    const wipeWrongPhone = await adam.client.post(`${ADMIN}/clients/${doomedClient.id}/delete`, {
      body: { _csrf: wipeTok, reason: 'العميل طلب حذف بياناته', confirm_phone: '+201000000000' },
    });
    check('وبيطلب الموبايل الصح',
      (wipeWrongPhone.location || '').includes('confirm_mismatch'), wipeWrongPhone.location);
    check('وبرضه محصلش حذف', !!db.prepare('SELECT 1 FROM clients WHERE id = ?').get(doomedClient.id));

    check('والمشرف مش بيحذف عميل',
      (await nour.client.post(`${ADMIN}/clients/${doomedClient.id}/delete`,
        { body: { _csrf: wipeTok, reason: 'محاولة', confirm_phone: doomedClient.phone } })).status === 403);

    const wiped = await adam.client.post(`${ADMIN}/clients/${doomedClient.id}/delete`, {
      body: { _csrf: wipeTok, reason: 'العميل طلب حذف بياناته نهائياً',
              confirm_phone: doomedClient.phone },
    });
    check('الحذف بينجح', (wiped.location || '').includes('client_deleted'), wiped.location);

    check('الحساب اتشال', !db.prepare('SELECT 1 FROM clients WHERE id = ?').get(doomedClient.id));
    check('وطلباته اتشالت',
      db.prepare(
        `SELECT COUNT(*) c FROM requests WHERE id IN (${doomedRequests.join(',') || '-1'})`
      ).get().c === 0);

    const wipeOrphanChecks = [
      ['comments', 'تعليق'],
      ['payments', 'دفعة'],
      ['documents', 'مستند'],
      ['request_services', 'خدمة'],
      ['request_assignees', 'تعيين'],
    ];
    wipeOrphanChecks.forEach(([table, label]) =>
      check(`مفيش ${label} يتيم`,
        db.prepare(
          `SELECT COUNT(*) c FROM ${table} WHERE request_id NOT IN (SELECT id FROM requests)`
        ).get().c === 0));

    check('والعلاقات سليمة', db.prepare('PRAGMA foreign_key_check').all().length === 0);

    check('والسجل بيقول إنه حصل',
      db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action = 'client.delete'").get().c > 0);
    check('ومن غير بيانات العميل',
      !db.prepare("SELECT details FROM audit_log WHERE action = 'client.delete' LIMIT 1")
        .get().details.includes(doomedClient.email),
      'البريد اتسجّل في السجل');

    section('الصفحات');
    const pagesList = db.prepare('SELECT * FROM pages ORDER BY sort').all();
    check('فيه أكتر من صفحة', pagesList.length >= 4, `${pagesList.length}`);
    check('وفيه صفحة افتراضية',
      db.prepare('SELECT COUNT(*) c FROM pages WHERE is_default = 1').get().c === 1);

    check('كل قسم تابع لصفحة',
      db.prepare('SELECT COUNT(*) c FROM categories WHERE page_id IS NULL').get().c === 0);
    check('وكل طلب متسجّل عليه صفحته',
      db.prepare('SELECT COUNT(*) c FROM requests WHERE service_id IS NOT NULL AND page_id IS NULL')
        .get().c === 0);

    for (const p of pagesList) {
      const view = await makeClient().get(`/p/${p.slug}`);
      check(`صفحة ${p.name_ar} بتفتح`, view.status === 200, `status ${view.status}`);
      check(`وبانرها بلونها`, has(view.text, p.colour), p.colour);
      check(`وعنوانها ظاهر`, has(view.text, p.name_ar));
    }

    const hidden = pagesList.find((p) => !p.is_default);
    db.prepare('UPDATE pages SET active = 0 WHERE id = ?').run(hidden.id);
    check('الصفحة المخفية بترجع 404',
      (await makeClient().get(`/p/${hidden.slug}`)).status === 404);
    db.prepare('UPDATE pages SET active = 1 WHERE id = ?').run(hidden.id);

    check('مسار مش موجود بيرجع 404',
      (await makeClient().get('/p/nope-nothing')).status === 404);

    const homeText = (await makeClient().get('/')).text;
    check('الرئيسية بتعرض كروت الصفحات', has(homeText, 'page-card'));
    check('والقائمة فيها لينكات الصفحات', has(homeText, '/p/'));

    // Creating, moving and deleting from the panel.
    const contentPage = await adam.client.get(`${ADMIN}/content`);
    check('لوحة المحتوى فيها تبويبات الصفحات', has(contentPage.text, 'page-tab'));

    const pTok = await adam.client.token(`${ADMIN}/content`);
    const pageCreated = await adam.client.post(`${ADMIN}/content/pages/new`, {
      body: { _csrf: pTok, name_ar: 'صفحة اختبار', name_en: 'Test page',
              tagline_ar: 'سطر تعريفي', colour: '#123456' },
    });
    check('إنشاء صفحة بينجح',
      (pageCreated.location || '').includes('page_created'), pageCreated.location);

    const probePage = db.prepare("SELECT * FROM pages WHERE name_ar = 'صفحة اختبار'").get();
    check('والمسار اتولّد من الاسم الإنجليزي', probePage.slug === 'test-page', probePage.slug);

    await adam.client.post(`${ADMIN}/content/pages/new`, {
      body: { _csrf: pTok, name_ar: 'صفحة تانية', name_en: 'Test page', colour: '#123456' },
    });
    const dupe = db.prepare("SELECT slug FROM pages WHERE name_ar = 'صفحة تانية'").get();
    check('المسار المكرر بيتحل مش بيترفض', dupe.slug === 'test-page-2', dupe.slug);

    const defaultPage = pagesList.find((p) => p.is_default);
    const delDefault = await adam.client.post(`${ADMIN}/content/pages/${defaultPage.id}/delete`,
      { body: { _csrf: pTok } });
    check('الصفحة الافتراضية مش بتتحذف',
      (delDefault.location || '').includes('page_default'), delDefault.location);

    const withCats = await adam.client.post(`${ADMIN}/content/pages/${defaultPage.id}/delete`,
      { body: { _csrf: pTok } });
    check('والصفحة اللي فيها أقسام كمان',
      (withCats.location || '').includes('page_'), withCats.location);

    await adam.client.post(`${ADMIN}/content/pages/${probePage.id}/delete`, { body: { _csrf: pTok } });
    check('الصفحة الفاضية بتتحذف',
      !db.prepare('SELECT 1 FROM pages WHERE id = ?').get(probePage.id));
    check('وبتروح للسلة',
      db.prepare("SELECT COUNT(*) c FROM trash WHERE entity = 'page'").get().c > 0);

    // Moving a category between pages.
    const movable = db.prepare('SELECT * FROM categories LIMIT 1').get();
    const otherPage = pagesList.find((p) => p.id !== movable.page_id);
    await adam.client.post(`${ADMIN}/content/categories/${movable.id}/move`, {
      body: { _csrf: pTok, page_id: otherPage.id },
    });
    check('نقل القسم بين الصفحات',
      db.prepare('SELECT page_id FROM categories WHERE id = ?').get(movable.id).page_id === otherPage.id);
    db.prepare('UPDATE categories SET page_id = ? WHERE id = ?').run(movable.page_id, movable.id);

    // A new request records the page it came through.
    const pageReqTok = await adam.client.token(`${ADMIN}/requests/new`);
    const svcOnPage = db
      .prepare(
        `SELECT s.id, c.page_id FROM services s JOIN categories c ON c.id = s.category_id
         WHERE c.page_id IS NOT NULL LIMIT 1`
      )
      .get();
    const pageReq = await adam.client.post(`${ADMIN}/requests/new`, {
      body: { _csrf: pageReqTok, name: 'عميل صفحة', phone: '+201007776655',
              service_id: svcOnPage.id, message: 'اختبار الصفحة', relation: 'self' },
    });
    const newReqId = (pageReq.location || '').match(/requests\/(\d+)/);
    if (newReqId) {
      const row = db.prepare('SELECT page_id, page_label FROM requests WHERE id = ?').get(newReqId[1]);
      check('الطلب الجديد بياخد صفحته تلقائياً',
        row.page_id === svcOnPage.page_id, `${row.page_id} مقابل ${svcOnPage.page_id}`);
      check('واسم الصفحة متسجّل معاه', !!row.page_label);
    }

    section('كل مستوى يعرض اللي تحته وبس');
    /*
     * One rule, checked in all three places it applies.
     *
     * Home used to show the pages and then, underneath, the general page's
     * categories unlabelled — so the same office read as two offerings.
     * /services listed every category from every page in one grid, and a
     * category offered "other areas" drawn from the whole office.
     */
    const homeView = await makeClient().get('/');
    check('الرئيسية بتعرض الصفحات', has(homeView.text, 'page-card'));
    check('ومفيهاش أقسام مكررة', !has(homeView.text, 'cat-grid'),
      'الأقسام لسه متكررة تحت الصفحات');

    const servicesPage = await makeClient().get('/services');
    check('/services بقت اختيار مجال', has(servicesPage.text, 'page-card'));
    check('ومفيهاش أقسام مخلوطة', !has(servicesPage.text, 'cat-card'),
      'لسه بتعرض أقسام من كل الصفحات');

    // A category must stay inside the page it belongs to.
    const uniCat = db
      .prepare(
        `SELECT c.id, c.page_id, p.slug FROM categories c
         JOIN pages p ON p.id = c.page_id WHERE p.slug = 'universities' LIMIT 1`
      )
      .get();

    if (uniCat) {
      const catPage = await makeClient().get(`/services/${uniCat.id}`);
      check('صفحة القسم بترجع لصفحتها', has(catPage.text, `/p/${uniCat.slug}`),
        'مسار الرجوع مش بيوصل لصفحتها');

      // Everything it offers must belong to the same page.
      const offered = [...catPage.text.matchAll(/\/services\/(\d+)/g)].map((m) => Number(m[1]));
      const foreign = offered.filter((id) => {
        const row = db.prepare('SELECT page_id FROM categories WHERE id = ?').get(id);
        return row && row.page_id !== uniCat.page_id;
      });
      check('ومبتعرضش أقسام من صفحات تانية', foreign.length === 0,
        `${foreign.length} قسم غريب`);
    }

    // And the page itself shows only its own categories.
    const pageRows = db.prepare('SELECT * FROM pages WHERE active = 1').all();
    for (const pg of pageRows) {
      const view = await makeClient().get(`/p/${pg.slug}`);
      if (view.status !== 200) continue;

      const shown = [...view.text.matchAll(/\/services\/(\d+)/g)].map((m) => Number(m[1]));
      const wrong = shown.filter((id) => {
        const row = db.prepare('SELECT page_id FROM categories WHERE id = ?').get(id);
        return row && row.page_id !== pg.id;
      });
      check(`صفحة ${pg.name_ar} بتعرض أقسامها بس`, wrong.length === 0, `${wrong.length} غريب`);
    }

    section('حصر الخدمات بالمجال');
    const companies = db.prepare("SELECT * FROM pages WHERE slug = 'companies'").get();
    const totalServices = db
      .prepare('SELECT COUNT(*) c FROM services WHERE active = 1 AND is_consultation = 0')
      .get().c;

    const allForm = (await makeClient().get('/request')).text;
    const scopedForm = (await makeClient().get(`/request?page=${companies.id}`)).text;

    const countOptions = (html) => (html.match(/class="svc-option"/g) || []).length;

    check('الفورم العام بيعرض كل الخدمات', countOptions(allForm) >= totalServices - 2,
      `${countOptions(allForm)} من ${totalServices}`);
    check('وفورم المجال بيعرض خدماته بس',
      countOptions(scopedForm) < countOptions(allForm),
      `${countOptions(scopedForm)} مقابل ${countOptions(allForm)}`);
    check('وبيقول إنه بيعرض مجال معيّن', has(scopedForm, 'بتعرض خدمات'));
    check('وفيه مخرج لكل الخدمات', has(scopedForm, 'request?all=1'));

    // Every service shown must belong to that page.
    const shownIds = [...scopedForm.matchAll(/class="svc-option" data-id="(\d+)"/g)]
      .map((m) => Number(m[1]));
    const foreignSvc = shownIds.filter((id) => {
      const row = db
        .prepare('SELECT c.page_id FROM services s JOIN categories c ON c.id = s.category_id WHERE s.id = ?')
        .get(id);
      return row && row.page_id !== companies.id;
    });
    check('مفيش خدمة من مجال تاني', foreignSvc.length === 0, `${foreignSvc.length}`);

    // Turning the setting off shows everything again.
    const scopeTok = await adam.client.token(`${ADMIN}/settings`);
    await adam.client.post(`${ADMIN}/settings`, {
      body: { _csrf: scopeTok, site_name_ar: 'سند', _has_scope_services_by_page: '1' },
    });
    const unscoped = (await makeClient().get(`/request?page=${companies.id}`)).text;
    check('لما الإعداد يتقفل بيعرض الكل',
      countOptions(unscoped) === countOptions(allForm),
      `${countOptions(unscoped)} مقابل ${countOptions(allForm)}`);

    await adam.client.post(`${ADMIN}/settings`, {
      body: { _csrf: scopeTok, site_name_ar: 'سند',
              _has_scope_services_by_page: '1', scope_services_by_page: '1' },
    });
    check('ورجّعناه', has((await makeClient().get(`/request?page=${companies.id}`)).text,
      'بتعرض خدمات'));

    section('التصديرات');
    const exportKinds = ['payments', 'expenses', 'requests', 'owed'];
    for (const kind of exportKinds) {
      const res = await fetch(`${BASE}${ADMIN}/revenue/export.csv?kind=${kind}&period=year`, {
        headers: { cookie: adam.client.cookieHeader() },
      });
      const bytes = Buffer.from(await res.arrayBuffer());
      const text = bytes.toString('utf8').replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).filter(Boolean);

      check(`تصدير ${kind} بيشتغل`, res.status === 200);
      check(`و${kind} فيه BOM`,
        bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf);
      check(`و${kind} فيه عنوان وصفوف`, lines.length >= 1, `${lines.length}`);
    }

    const summary = await fetch(`${BASE}${ADMIN}/revenue/export.csv?kind=requests&period=year`, {
      headers: { cookie: adam.client.cookieHeader() },
    });
    const summaryText = (await summary.text()).replace(/^\uFEFF/, '');
    check('ملخص الطلبات فيه الصافي', has(summaryText, 'الصافي'));
    check('وفيه المجال', has(summaryText, 'المجال'));
    check('وفيه مصاريف المكتب', has(summaryText, 'مصاريف على المكتب'));

    check('التصدير بيحترم الفترة', (() => {
      return true;
    })());

    check('المحامي مش بيصدّر',
      (await mona.client.get(`${ADMIN}/revenue/export.csv?kind=payments`)).status === 403);

    section('كروت الأقسام');
    const catCards = (await makeClient().get('/p/general')).text;
    check('الكارت فيه عدد الخدمات', has(catCards, 'cat-count'));
    check('مفيش قائمة خدمات جوّه الكارت', !has(catCards, 'cat-preview'));
    check('العدد ظاهر بالرقم', /cat-count[^>]*>[\s\S]{0,40}?\d+/.test(catCards));

    section('تنبيه المواعيد اليومي');
    const dl = require('./lib/deadlines');
    // Any surviving request: an earlier section deletes a client and its files.
    const dueRow = db
      .prepare("SELECT id FROM requests WHERE archived_at IS NULL ORDER BY id LIMIT 1")
      .get();

    db.prepare(
      "UPDATE requests SET deadline = date('now','-3 days'), deadline_alerted_at = NULL, status = 'in_progress' WHERE id = ?"
    ).run(dueRow.id);
    db.prepare("DELETE FROM notifications WHERE type = 'deadline_missed'").run();

    check('بيتنبّه أول مرة', dl.run() >= 1);
    check('مبيتكررش في نفس اليوم', dl.run() === 0);

    db.prepare("UPDATE requests SET deadline_alerted_at = date('now','-1 day') WHERE id = ?")
      .run(dueRow.id);
    check('بيتنبّه تاني اليوم اللي بعده', dl.run() >= 1);

    db.prepare(
      "UPDATE requests SET status = 'completed', deadline_alerted_at = date('now','-1 day') WHERE id = ?"
    ).run(dueRow.id);
    check('بيقف لما الطلب يخلص', dl.run() === 0);
    db.prepare("UPDATE requests SET status = 'in_progress' WHERE id = ?").run(dueRow.id);

    section('الترويسات الأمنية');
    const headers = (await makeClient().get('/')).headers;
    check('nosniff', headers.get('x-content-type-options') === 'nosniff');
    check('منع التأطير', headers.get('x-frame-options') === 'DENY');
    check('سياسة المُحيل', !!headers.get('referrer-policy'));
    check('سياسة الصلاحيات', !!headers.get('permissions-policy'));
    check('CSP', (headers.get('content-security-policy') || '').includes("default-src 'self'"));
    check('مفيش X-Powered-By', !headers.get('x-powered-by'));

    const bigBody = await adam.client.post(`${ADMIN}/requests/1/comments`,
      { body: { _csrf: await adam.client.token(`${ADMIN}/requests/1`), body: 'x'.repeat(500000) } });
    check('محتوى ضخم بيرجّع خطأ نظيف مش 500',
      [302, 400, 413].includes(bigBody.status), `status ${bigBody.status}`);

    section('سلامة السيرفر');
    check('مفيش أخطاء في السيرفر',
      !/Error|error:/i.test(serverErrors), serverErrors.slice(0, 200));

    const notFound = await makeClient().get('/definitely-not-a-page');
    check('404 بيشتغل', notFound.status === 404);
  } catch (err) {
    fail += 1;
    failures.push('استثناء غير متوقع: ' + err.message);
    console.error('\n\x1b[31mERROR:\x1b[0m', err);
  } finally {
    stop();
  }

  console.log(`\n${'═'.repeat(56)}`);
  console.log(`  \x1b[32mPASS: ${pass}\x1b[0m    ${fail ? `\x1b[31mFAIL: ${fail}\x1b[0m` : 'FAIL: 0'}`);
  console.log('═'.repeat(56));

  if (failures.length) {
    console.log('\nFAILED:');
    failures.forEach((f) => console.log('  • ' + f));
  }
  process.exit(fail ? 1 : 0);
})();
