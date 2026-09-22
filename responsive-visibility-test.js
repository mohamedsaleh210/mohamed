#!/usr/bin/env node
/**
 * Responsive-visibility regression suite.
 *
 * Boots the real server against a throwaway database (same pattern as
 * test.js) and drives it with a real browser (Playwright) so it can assert
 * on *computed* styles, not just the `hidden` IDL property. A plain
 * `element.hidden === true` assertion is not sufficient here: the bug this
 * suite guards against is exactly a case where `hidden` was `true` while the
 * element was still painted on screen, because a responsive CSS rule set
 * `display` on it without a `:not([hidden])` guard (author-origin CSS always
 * beats the browser's own `[hidden]{display:none}` default, regardless of
 * specificity). See admin.css's root `[hidden]{display:none!important}` rule
 * for the fix this suite protects.
 *
 *   node responsive-visibility-test.js
 *
 * Requires the `playwright` package with a Chromium build available
 * (PLAYWRIGHT_BROWSERS_PATH / a prior `npx playwright install chromium`).
 * If Playwright can't launch a browser, the suite reports that clearly and
 * exits non-zero rather than silently reporting 0 checks.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.TEST_PORT || 4057;
const ADMIN = process.env.ADMIN_PATH || '/office-panel';
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sanad-rvtest-'));
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

(async () => {
  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    console.log('\x1b[33mSKIPPED\x1b[0m — the `playwright` package is not installed.');
    console.log('Install it (npm i -D playwright && npx playwright install chromium) to run this suite.');
    process.exit(0);
  }

  console.log('\x1b[1mSanad — responsive-visibility regression suite\x1b[0m');
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
    try { server.kill('SIGKILL'); } catch (_) {}
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) {}
  };

  for (let i = 0; i < 40; i++) {
    try { await fetch(BASE + '/'); break; } catch (_) { await new Promise((r) => setTimeout(r, 250)); }
  }

  let browser;
  try {
    browser = await playwright.chromium.launch();
  } catch (e) {
    console.log('\x1b[31mFAILED TO LAUNCH CHROMIUM\x1b[0m — ' + e.message);
    stop();
    process.exit(1);
  }

  try {
    // -------------------------------------------------- shared login helper
    async function loginPage(width, height = 900) {
      const ctx = await browser.newContext({ viewport: { width, height } });
      const page = await ctx.newPage();
      await page.goto(`${BASE}${ADMIN}/login`);
      await page.fill('input[name="username"]', 'adam');
      await page.fill('input[name="password"]', '1234');
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
      return { ctx, page };
    }

    // ================================================== 1. global [hidden] safety net
    section('١. الحماية العامة لـ [hidden]');
    {
      const { ctx, page } = await loginPage(390);
      // Any element with the boolean `hidden` attribute must compute display:none,
      // regardless of which responsive rule would otherwise apply to it.
      await page.goto(`${BASE}${ADMIN}/payroll/runs/1`, { waitUntil: 'networkidle' });
      const rule = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.className = 'tbl-wrap emp-table-wrap'; // the exact class combo that broke this before
        document.body.appendChild(probe);
        const inner = document.createElement('tr');
        inner.setAttribute('hidden', '');
        probe.appendChild(inner);
        const display = getComputedStyle(inner).display;
        probe.remove();
        return display;
      });
      check('عنصر [hidden] داخل جدول متجاوب display:none برضه', rule === 'none', `display=${rule}`);
      await ctx.close();
    }

    // ================================================== 2. Payroll Run master/detail
    section('٢. تفاصيل سند صرف المرتبات — إخفاء حقيقي');
    for (const width of [390, 768, 820, 900, 901, 1024]) {
      const { ctx, page } = await loginPage(width);
      await page.goto(`${BASE}${ADMIN}/payroll/runs/1`, { waitUntil: 'networkidle' });

      const initial = await page.evaluate(() => [...document.querySelectorAll('.payroll-detail-row')].map((r) => ({
        id: r.id, hiddenAttr: r.hidden, display: getComputedStyle(r).display, visible: r.offsetParent !== null,
      })));
      check(`[${width}px] كل صفوف التفاصيل مخفية فعليًا عند التحميل`,
        initial.length > 0 && initial.every((r) => r.hiddenAttr && r.display === 'none' && !r.visible),
        JSON.stringify(initial));

      const ids = initial.map((r) => r.id);
      await page.click(`[data-toggle-detail="${ids[0]}"]`);
      await page.waitForTimeout(150);
      const afterOpen = await page.evaluate((allIds) => allIds.map((id) => {
        const r = document.getElementById(id);
        return { id, hiddenAttr: r.hidden, display: getComputedStyle(r).display, visible: r.offsetParent !== null };
      }), ids);
      const opened = afterOpen.find((r) => r.id === ids[0]);
      const othersHidden = afterOpen.filter((r) => r.id !== ids[0]).every((r) => r.hiddenAttr && r.display === 'none' && !r.visible);
      check(`[${width}px] فتح موظف واحد بيظهره هو بس`, !opened.hiddenAttr && opened.visible && othersHidden, JSON.stringify(afterOpen));

      const aria = await page.evaluate((id) => document.querySelector(`[data-toggle-detail="${id}"]`).getAttribute('aria-expanded'), ids[0]);
      check(`[${width}px] aria-expanded=true بعد الفتح`, aria === 'true', `aria-expanded=${aria}`);

      await page.click(`[data-toggle-detail="${ids[0]}"]`);
      await page.waitForTimeout(150);
      const closed = await page.evaluate((id) => {
        const r = document.getElementById(id);
        return { hiddenAttr: r.hidden, display: getComputedStyle(r).display, visible: r.offsetParent !== null };
      }, ids[0]);
      check(`[${width}px] الإغلاق بيرجّعه مخفي فعليًا`, closed.hiddenAttr && closed.display === 'none' && !closed.visible, JSON.stringify(closed));

      await ctx.close();
    }

    // ================================================== 3. Employees reset-password disclosure
    section('٣. فورم كلمة السر الجديدة في صفحة الموظفين — إخفاء حقيقي');
    for (const width of [390, 820, 850, 900, 1024]) {
      const { ctx, page } = await loginPage(width);
      await page.goto(`${BASE}${ADMIN}/users`, { waitUntil: 'networkidle' });

      const initial = await page.evaluate(() => [...document.querySelectorAll('[id^="reset-tr-"], [id^="reset-card-"]')].map((r) => ({
        id: r.id, hiddenAttr: r.hidden, display: getComputedStyle(r).display, visible: r.offsetParent !== null,
      })));
      check(`[${width}px] كل فورمات تغيير كلمة السر مخفية فعليًا عند التحميل`,
        initial.length > 0 && initial.every((r) => r.hiddenAttr && r.display === 'none' && !r.visible),
        JSON.stringify(initial.filter((r) => !(r.hiddenAttr && r.display === 'none' && !r.visible))));

      const prefix = width <= 820 ? 'card-' : 'tr-';
      const triggers = await page.evaluate((p) => [...document.querySelectorAll(`[data-reset^="${p}"]`)].map((b) => b.getAttribute('data-reset')), prefix);
      if (triggers.length >= 2) {
        await page.click(`[data-reset="${triggers[0]}"]`);
        await page.waitForTimeout(150);
        const afterOpen = await page.evaluate((ids) => ids.map((id) => {
          const r = document.getElementById('reset-' + id);
          return { id, hiddenAttr: r.hidden, display: getComputedStyle(r).display, visible: r.offsetParent !== null };
        }), triggers);
        const opened = afterOpen.find((r) => r.id === triggers[0]);
        const othersHidden = afterOpen.filter((r) => r.id !== triggers[0]).every((r) => r.hiddenAttr && r.display === 'none' && !r.visible);
        check(`[${width}px] فتح موظف واحد بيظهر فورمه هو بس`, !opened.hiddenAttr && opened.visible && othersHidden, JSON.stringify(afterOpen));

        const aria = await page.evaluate((id) => document.querySelector(`[data-reset="${id}"]`).getAttribute('aria-expanded'), triggers[0]);
        check(`[${width}px] aria-expanded=true بعد الفتح`, aria === 'true', `aria-expanded=${aria}`);

        await page.click(`#reset-${triggers[0]} [data-close-reset]`);
        await page.waitForTimeout(150);
        const closed = await page.evaluate((id) => {
          const r = document.getElementById('reset-' + id);
          const trigger = document.querySelector(`[data-reset="${id}"]`);
          return { hiddenAttr: r.hidden, display: getComputedStyle(r).display, visible: r.offsetParent !== null, aria: trigger.getAttribute('aria-expanded'), focusReturned: trigger === document.activeElement };
        }, triggers[0]);
        check(`[${width}px] الإلغاء بيقفل الفورم ويرجّع التركيز للزرار`, closed.hiddenAttr && closed.display === 'none' && !closed.visible && closed.aria === 'false' && closed.focusReturned, JSON.stringify(closed));
      }
      await ctx.close();
    }

    // ================================================== 4. #empNoResults
    section('٤. رسالة "مفيش موظف مطابق" — تظهر لما لازم بس');
    {
      const { ctx, page } = await loginPage(1280);
      await page.goto(`${BASE}${ADMIN}/users`, { waitUntil: 'networkidle' });
      const readState = () => page.evaluate(() => {
        const el = document.getElementById('empNoResults');
        return { hidden: el.hidden, visible: el.offsetParent !== null, rows: [...document.querySelectorAll('#empTable tbody tr')].filter((r) => r.offsetParent !== null).length };
      });

      let s = await readState();
      check('أ. التحميل الأولي: الرسالة مخفية وفيه صفوف', s.hidden && !s.visible && s.rows > 0, JSON.stringify(s));

      await page.fill('#empSearch', 'Adam');
      await page.waitForTimeout(250);
      s = await readState();
      check('ب. بحث بنتيجة واحدة: الرسالة مخفية', s.hidden && !s.visible && s.rows === 1, JSON.stringify(s));

      await page.fill('#empSearch', 'zzz_no_such_employee_zzz');
      await page.waitForTimeout(250);
      s = await readState();
      check('ج. بحث بدون نتائج: الرسالة ظاهرة وصفر صفوف', !s.hidden && s.visible && s.rows === 0, JSON.stringify(s));

      await page.fill('#empSearch', '');
      await page.waitForTimeout(250);
      s = await readState();
      check('د. مسح البحث: النتائج ترجع والرسالة تختفي', s.hidden && !s.visible && s.rows > 0, JSON.stringify(s));

      await ctx.close();
    }

    // ================================================== 5. Checkpoint 2 P2 fixes
    section('٥. عرض المحتوى على الديسكتوب وعداد المراحل (Checkpoint 2)');
    {
      const { ctx, page } = await loginPage(1024);
      await page.goto(`${BASE}${ADMIN}/`, { waitUntil: 'networkidle' });
      const widthInfo = await page.evaluate(() => {
        const mainInner = document.querySelector('.main-inner');
        const sidebar = document.getElementById('sidebar');
        const mr = mainInner.getBoundingClientRect();
        const sr = sidebar.getBoundingClientRect();
        const overlap = Math.max(0, Math.min(mr.right, sr.right) - Math.max(mr.left, sr.left));
        return { width: mr.width, overlap, viewport: window.innerWidth };
      });
      // Exactly one 246px sidebar reservation, not two: available column should be
      // viewport - 246, not viewport - 492 (the P2-A double-reservation bug).
      check('عمود المحتوى بعرضه الكامل بدون حجز مضاعف لمساحة القائمة الجانبية',
        Math.abs(widthInfo.width - (1024 - 246)) <= 10 && widthInfo.overlap <= 1,
        JSON.stringify(widthInfo));

      await page.goto(`${BASE}${ADMIN}/payroll/runs/1`, { waitUntil: 'networkidle' });
      const journeyInfo = await page.evaluate(() => {
        const spans = [...document.querySelectorAll('.payroll-journey span')];
        return spans.map((s) => s.getBoundingClientRect().width);
      });
      check('خطوات سند المرتب مقروءة عند 1024px (مفيش عمود أضيق من 90px)',
        journeyInfo.length > 0 && journeyInfo.every((w) => w >= 90), JSON.stringify(journeyInfo));
      await ctx.close();
    }

    section('سلامة السيرفر');
    check('مفيش أخطاء في السيرفر', !/Error|error:/i.test(serverErrors), serverErrors.slice(0, 200));
  } catch (err) {
    fail += 1;
    failures.push('استثناء غير متوقع: ' + err.message);
    console.error('\n\x1b[31mERROR:\x1b[0m', err);
  } finally {
    await browser.close();
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
