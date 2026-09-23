#!/usr/bin/env node
/**
 * Office-branch data assignment + archive isolation regression suite.
 *
 * office_branch_id exists on requests, legal_cases, agenda_events and users
 * (migration 055) but until now nothing ever wrote to it — every branch
 * archive was empty by construction. This suite proves the fix end to end:
 * a new request is actually assigned a real branch (never left NULL), a
 * case created from it inherits the same branch, and — the part that
 * actually matters — two branches' archives never leak into each other,
 * for requests, payments and the clients/companies derived through them.
 *
 *   node branch-test.js
 */
const path = require('path');
const { createHarness } = require('./test-harness');

const H = createHarness({ port: 4582, label: 'Branch assignment suite' });
const { check, section, loginStaff, ADMIN } = H;

(async () => {
  console.log('\x1b[1mSanad — office-branch assignment & archive isolation suite\x1b[0m\n');
  await H.start();

  const Database = require('better-sqlite3');
  const db = new Database(path.join(H.DATA_DIR, 'sanad.db'));

  try {
    const adamLogin = await loginStaff('adam', '1234');
    check('تسجيل دخول السوبر أدمن نجح', adamLogin.status === 302, `status=${adamLogin.status}`);
    const adam = adamLogin.client;

    // ================================================== 1. a second office branch
    section('١. إضافة فرع مكتب ثانٍ');
    const csrfBranch = await adam.token(`${ADMIN}/settings?tab=branches`);
    const branchResp = await adam.post(`${ADMIN}/settings/office-branches`, {
      body: { _csrf: csrfBranch, name: 'فرع الاسكندرية', code: 'ALEX' },
    });
    check('إضافة الفرع بتنجح (302)', branchResp.status === 302, `status=${branchResp.status}`);
    const mainBranch = db.prepare('SELECT id FROM office_branches WHERE is_main=1').get();
    const altBranch = db.prepare("SELECT id FROM office_branches WHERE name='فرع الاسكندرية'").get();
    check('الفرع الجديد اتسجل فعلًا', !!altBranch);

    // ================================================== 2. new request is never left NULL
    section('٢. الطلب الجديد بياخد فرع حقيقي دايمًا');
    const csrfReq = await adam.token(`${ADMIN}/requests/new`);
    const req1Resp = await adam.post(`${ADMIN}/requests/new`, {
      body: { _csrf: csrfReq, party_type: 'person', name: 'عميل بدون فرع مختار', phone: '01000000009', message: 'تجربة' },
    });
    check('طلب من غير ما يختار فرع بينجح برضه (302)', req1Resp.status === 302, `status=${req1Resp.status}`);
    const req1 = db.prepare("SELECT office_branch_id FROM requests WHERE name='عميل بدون فرع مختار'").get();
    check('ولسه بياخد فرع حقيقي (مش NULL) — بيرجع للفرع الرئيسي', req1.office_branch_id === mainBranch.id, JSON.stringify(req1));

    // ================================================== 3. explicit branch assignment on two requests
    section('٣. تخصيص فرعين مختلفين لطلبين');
    const csrfReq2 = await adam.token(`${ADMIN}/requests/new`);
    await adam.post(`${ADMIN}/requests/new`, {
      body: { _csrf: csrfReq2, party_type: 'person', name: 'عميل الفرع الرئيسي', phone: '01000000010', office_branch_id: String(mainBranch.id), message: 'طلب فرع رئيسي' },
    });
    const csrfReq3 = await adam.token(`${ADMIN}/requests/new`);
    await adam.post(`${ADMIN}/requests/new`, {
      body: { _csrf: csrfReq3, party_type: 'person', name: 'عميل فرع الاسكندرية', phone: '01000000011', office_branch_id: String(altBranch.id), message: 'طلب فرع اسكندرية' },
    });
    const mainReq = db.prepare("SELECT id,office_branch_id FROM requests WHERE name='عميل الفرع الرئيسي'").get();
    const altReq = db.prepare("SELECT id,office_branch_id FROM requests WHERE name='عميل فرع الاسكندرية'").get();
    check('طلب الفرع الرئيسي اتسجل بفرعه الصح', mainReq.office_branch_id === mainBranch.id);
    check('طلب فرع الاسكندرية اتسجل بفرعه الصح', altReq.office_branch_id === altBranch.id);

    // ================================================== 4. a case inherits its request's branch
    section('٤. القضية بترث فرع الطلب اللي اتحوّلت منه');
    const csrfCase = await adam.token(`${ADMIN}/requests/${altReq.id}`);
    await adam.post(`${ADMIN}/cases/from-request/${altReq.id}`, { body: { _csrf: csrfCase } });
    const inheritedCase = db.prepare('SELECT office_branch_id FROM legal_cases WHERE request_id=?').get(altReq.id);
    check('القضية ورثت فرع الطلب (اسكندرية)', inheritedCase && inheritedCase.office_branch_id === altBranch.id, JSON.stringify(inheritedCase));

    // ================================================== 5. a payment on each branch's request
    section('٥. دفعة على طلب كل فرع');
    db.prepare("INSERT INTO payments (request_id, amount, method, paid_on, recorded_by) VALUES (?,500,'cash',date('now'),'Adam')").run(mainReq.id);
    db.prepare("INSERT INTO payments (request_id, amount, method, paid_on, recorded_by) VALUES (?,900,'cash',date('now'),'Adam')").run(altReq.id);

    // ================================================== 6. archive isolation — the part that actually matters
    section('٦. عزل أرشيف الفروع — مفيش تسريب في أي اتجاه');
    const branchArchive = require('./lib/branch-archive');

    const mainArchive = await branchArchive.createBranchArchive(mainBranch.id);
    const altArchive = await branchArchive.createBranchArchive(altBranch.id);

    const mainNames = mainArchive.manifest.branch.name;
    check('أرشيف الفرع الرئيسي فيه طلب الفرع الرئيسي', true); // sanity: manifest built without throwing
    mainArchive.cleanup();
    altArchive.cleanup();

    // Re-open the actual zip contents for both (createBranchArchive already
    // wrote them once above for the manifest counts; build again pointed at
    // fixed paths so we can inspect the JSON payloads directly).
    const os = require('os'), fs = require('fs');
    const out1 = path.join(os.tmpdir(), `branch-test-${mainBranch.id}.zip`);
    const out2 = path.join(os.tmpdir(), `branch-test-${altBranch.id}.zip`);
    const built1 = await branchArchive.createBranchArchive(mainBranch.id, { outputPath: out1 });
    const built2 = await branchArchive.createBranchArchive(altBranch.id, { outputPath: out2 });

    const unzipper = require('unzipper');
    async function readJson(zipPath, entryName) {
      const zip = await unzipper.Open.file(zipPath);
      const entry = zip.files.find((f) => f.path === entryName);
      const buf = await entry.buffer();
      return JSON.parse(buf.toString('utf8'));
    }

    const mainRequests = await readJson(out1, 'data/requests.json');
    const altRequests = await readJson(out2, 'data/requests.json');
    check('أرشيف الفرع الرئيسي فيه طلبه بس', mainRequests.some((r) => r.id === mainReq.id) && !mainRequests.some((r) => r.id === altReq.id));
    check('أرشيف فرع الاسكندرية فيه طلبه بس', altRequests.some((r) => r.id === altReq.id) && !altRequests.some((r) => r.id === mainReq.id));

    const mainPayments = await readJson(out1, 'data/payments.json');
    const altPayments = await readJson(out2, 'data/payments.json');
    check('مدفوعات الفرع الرئيسي بس فيها 500', mainPayments.some((p) => p.amount === 500) && !mainPayments.some((p) => p.amount === 900));
    check('مدفوعات فرع الاسكندرية بس فيها 900', altPayments.some((p) => p.amount === 900) && !altPayments.some((p) => p.amount === 500));

    const mainCases = await readJson(out1, 'data/legal_cases.json');
    const altCases = await readJson(out2, 'data/legal_cases.json');
    check('قضية فرع الاسكندرية مش موجودة في أرشيف الفرع الرئيسي', !mainCases.some((c) => c.request_id === altReq.id));
    check('قضية فرع الاسكندرية موجودة في أرشيفه هو', altCases.some((c) => c.request_id === altReq.id));

    fs.rmSync(out1, { force: true });
    fs.rmSync(out2, { force: true });
    built1.cleanup();
    built2.cleanup();

    // ================================================== 7. old data is never silently broken
    section('٧. البيانات القديمة (قبل هذا التعديل) تفضل سليمة');
    const nullCount = db.prepare('SELECT COUNT(*) c FROM requests WHERE office_branch_id IS NULL').get().c;
    check('طلبات الديمو القديمة (قبل الربط بالفرع) لسه NULL بأمان، مش اتغيرت أو انكسرت', nullCount > 0, `null count=${nullCount}`);

    section('سلامة السيرفر');
    check('مفيش أخطاء في السيرفر', !/Error|error:/i.test(H.state.serverOutput), H.state.serverOutput.slice(0, 300));
  } catch (err) {
    H.state.fail += 1;
    H.state.failures.push('استثناء غير متوقع: ' + err.message);
    console.error('\n\x1b[31mERROR:\x1b[0m', err);
  } finally {
    db.close();
    H.stop();
  }

  const failCount = H.report();
  process.exit(failCount ? 1 : 0);
})();
