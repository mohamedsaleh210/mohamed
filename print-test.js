#!/usr/bin/env node
/**
 * Print/PDF profile regression suite.
 *
 * The four profile-print routes (employee, client, company, single branch)
 * each render through `lib/reporting.profileDoc()` and are meant to expose
 * exactly the same data — and require exactly the same permission — as the
 * detail page they were added next to. This suite proves that over real HTTP
 * against the real server: a role that cannot see the underlying page is
 * refused the print route too, a role that can see it gets clean output, and
 * none of the four leak something the detail page itself withholds
 * (password material or permission checkboxes on the employee print,
 * request/money rows on the client print).
 *
 *   node print-test.js
 */
const path = require('path');
const { createHarness } = require('./test-harness');

const H = createHarness({ port: 4579, label: 'Print/PDF suite' });
const { check, section, loginStaff, ADMIN } = H;

(async () => {
  console.log('\x1b[1mSanad — Print/PDF profile regression suite\x1b[0m\n');
  await H.start();

  const Database = require('better-sqlite3');
  const db = new Database(path.join(H.DATA_DIR, 'sanad.db'));

  try {
    const adamId = db.prepare("SELECT id FROM users WHERE username='adam'").get().id;
    const monaId = db.prepare("SELECT id FROM users WHERE username='mona'").get().id;
    const company = db.prepare("SELECT * FROM companies WHERE name LIKE 'شركة النيل%'").get();
    const branch = db.prepare('SELECT * FROM company_branches WHERE company_id=? ORDER BY id LIMIT 1').get(company.id);
    const client = db.prepare("SELECT * FROM clients WHERE email LIKE '%@demo.sanad' ORDER BY id LIMIT 1").get();

    const adamLogin = await loginStaff('adam', '1234');
    check('تسجيل دخول السوبر أدمن نجح', adamLogin.status === 302, `status=${adamLogin.status}`);
    const adam = adamLogin.client;

    // mona is a plain lawyer: no users.view/users.manage, no clients.directory —
    // exactly the role that should be refused every print route below.
    const monaLogin = await loginStaff('mona', 'demo1234');
    check('تسجيل دخول المحامية منى نجح', monaLogin.status === 302, `status=${monaLogin.status}`);
    const mona = monaLogin.client;

    // ================================================== 1. employee print
    section('١. طباعة ملف الموظف');
    const empPrint = await adam.get(`${ADMIN}/users/${adamId}/print`);
    check('أدمن يقدر يفتح طباعة ملف موظف — 200', empPrint.status === 200, `status=${empPrint.status}`);
    check('طباعة الموظف فيها الاسم الرسمي', empPrint.text.includes('آدم محمد عبد الرحمن الشناوي'));
    check('طباعة الموظف من غير أي حقل باسورد', !/password/i.test(empPrint.text));
    check('طباعة الموظف من غير جدول صلاحيات (checkbox)', !/type="checkbox"/.test(empPrint.text));

    const empPrintDenied = await mona.get(`${ADMIN}/users/${monaId}/print`);
    check('محامية من غير users.view/manage ممنوعة من طباعة ملف موظف — 403',
      empPrintDenied.status === 403, `status=${empPrintDenied.status}`);

    // ================================================== 2. client print
    section('٢. طباعة ملف العميل');
    const clientPrint = await mona.get(`${ADMIN}/clients/${client.id}/print`);
    check('طباعة ملف العميل متاحة لأي موظف (زي صفحة العميل نفسها) — 200',
      clientPrint.status === 200, `status=${clientPrint.status}`);
    check('طباعة العميل فيها اسمه', clientPrint.text.includes(client.full_name));
    check('طباعة العميل من غير جدول طلبات أو مبالغ مالية',
      !/<table/.test(clientPrint.text) && !/ج\.م|EGP/.test(clientPrint.text));

    // ================================================== 3. company print
    section('٣. طباعة ملف الشركة');
    const companyPrintDenied = await mona.get(`${ADMIN}/clients/companies/${company.id}/print`);
    check('محامية من غير clients.directory ممنوعة من طباعة ملف شركة — 403',
      companyPrintDenied.status === 403, `status=${companyPrintDenied.status}`);

    const companyPrint = await adam.get(`${ADMIN}/clients/companies/${company.id}/print`);
    check('أدمن يقدر يفتح طباعة ملف شركة — 200', companyPrint.status === 200, `status=${companyPrint.status}`);
    check('طباعة الشركة فيها اسمها', companyPrint.text.includes(company.name));
    check('طباعة الشركة فيها جدول الفروع', companyPrint.text.includes(branch.name));

    // ================================================== 4. single branch print
    section('٤. طباعة فرع شركة واحد');
    const branchPrintDenied = await mona.get(`${ADMIN}/clients/companies/${company.id}/branches/${branch.id}/print`);
    check('محامية من غير clients.directory ممنوعة من طباعة فرع — 403',
      branchPrintDenied.status === 403, `status=${branchPrintDenied.status}`);

    const branchPrint = await adam.get(`${ADMIN}/clients/companies/${company.id}/branches/${branch.id}/print`);
    check('أدمن يقدر يفتح طباعة فرع — 200', branchPrint.status === 200, `status=${branchPrint.status}`);
    check('طباعة الفرع فيها اسم الفرع', branchPrint.text.includes(branch.name));
    check('طباعة الفرع فيها اسم الشركة كعنوان فرعي', branchPrint.text.includes(company.name));

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
