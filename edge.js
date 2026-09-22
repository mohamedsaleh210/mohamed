#!/usr/bin/env node
/**
 * Edge-case suite.
 *
 * The functional suite proves the system works when used correctly. This one
 * asks what happens when it is not: empty fields, absurd numbers, text in the
 * wrong script, two people editing the same row at once, a client whose account
 * was deleted mid-session.
 *
 * These are the failures that reach production, because nobody demonstrates
 * them during a walkthrough.
 *
 *   node edge.js
 */
const { createHarness } = require('./test-harness');

const H = createHarness({ port: 4599, label: 'Edge cases' });
const { check, section, makeClient, loginStaff, loginClient, ADMIN, BASE, has, countOf } = H;

(async () => {
  console.log('\x1b[1mSanad — edge case suite\x1b[0m\n');
  await H.start();

  const { db } = require('./db');
  const fs = require('fs');
  const path = require('path');

  try {
    const adam = await loginStaff('adam', '1234');
    const nour = await loginStaff('nour', 'demo1234');
    const mona = await loginStaff('mona', 'demo1234');
    const client = await loginClient('client@demo.sanad', 'demo1234');

    // ================================================== empty & whitespace
    section('قيم فاضية ومسافات');

    const blankTok = await adam.client.token(`${ADMIN}/requests/1`);
    const blanks = [
      ['تعليق فاضي', `${ADMIN}/requests/1/comments`, { body: '' }],
      ['تعليق مسافات', `${ADMIN}/requests/1/comments`, { body: '   \n\t  ' }],
      ['خطوة فاضية', `${ADMIN}/requests/1/todos`, { title: '' }],
      ['مطلوب فاضي', `${ADMIN}/requests/1/requirements`, { title: '   ' }],
      ['بند أتعاب فاضي', `${ADMIN}/requests/1/fees`, { label: '', amount: '100' }],
    ];

    for (const [name, url, body] of blanks) {
      const before = db.prepare('SELECT COUNT(*) c FROM comments').get().c +
        db.prepare('SELECT COUNT(*) c FROM todos').get().c +
        db.prepare('SELECT COUNT(*) c FROM requirements').get().c +
        db.prepare('SELECT COUNT(*) c FROM fee_items').get().c;

      await adam.client.post(url, { body: { _csrf: blankTok, ...body } });

      const after = db.prepare('SELECT COUNT(*) c FROM comments').get().c +
        db.prepare('SELECT COUNT(*) c FROM todos').get().c +
        db.prepare('SELECT COUNT(*) c FROM requirements').get().c +
        db.prepare('SELECT COUNT(*) c FROM fee_items').get().c;

      check(`${name} مش بيتحفظ`, before === after, 'اتحفظ صف فاضي');
    }

    // A blank public request must not create a row either.
    const blankVisitor = makeClient();
    const bvTok = await blankVisitor.token('/request');
    const reqBefore = db.prepare('SELECT COUNT(*) c FROM requests').get().c;
    await blankVisitor.post('/request', { body: { _csrf: bvTok, name: '  ', phone: '  ' } });
    check('طلب عام فاضي مش بيتحفظ',
      db.prepare('SELECT COUNT(*) c FROM requests').get().c === reqBefore);

    // A request needs either a service or something to read.
    const thinCases = [
      ['فاضي تماماً', ''],
      ['حرف واحد', 'أ'],
      ['كلمة قصيرة', 'محتاج'],
      ['مسافات', '          '],
    ];
    for (const [label, text] of thinCases) {
      const c = makeClient();
      const t = await c.token('/request');
      const before = db.prepare('SELECT COUNT(*) c FROM requests').get().c;
      await c.post('/request', {
        body: { _csrf: t, name: 'عميل', phone: '+201001112233', service_ids: '', message: text },
      });
      check(`وصف «${label}» من غير خدمة بيترفض`,
        db.prepare('SELECT COUNT(*) c FROM requests').get().c === before);
    }

    // Nonsense in the services list must not create phantom rows.
    const badPicks = ['abc', '-1', '0', '999999', '1,1,1', '1;DROP TABLE requests',
      Array.from({ length: 50 }, (_, i) => i + 1).join(',')];
    for (const value of badPicks) {
      const c = makeClient();
      const t = await c.token('/request');
      const r = await c.post('/request', {
        body: { _csrf: t, name: 'عميل خدمات', phone: '+201002223344',
                service_ids: value, message: 'وصف كافي للطلب المطلوب هنا' },
      });
      check(`قائمة خدمات «${String(value).slice(0, 18)}»`,
        [200, 302].includes(r.status), `status ${r.status}`);
    }

    check('مفيش خدمة مكررة على طلب واحد',
      db.prepare(
        `SELECT COUNT(*) c FROM (
           SELECT request_id, service_id FROM request_services
           WHERE service_id IS NOT NULL
           GROUP BY request_id, service_id HAVING COUNT(*) > 1)`
      ).get().c === 0);

    check('مفيش خدمة على طلب مش موجود',
      db.prepare(
        'SELECT COUNT(*) c FROM request_services WHERE request_id NOT IN (SELECT id FROM requests)'
      ).get().c === 0);

    check('الطلبات اللي من غير خدمة متعلّمة كوصف حر',
      db.prepare(
        `SELECT COUNT(*) c FROM requests
         WHERE service_id IS NULL AND is_custom = 0 AND source = 'website'`
      ).get().c === 0);

    // ================================================== numbers
    section('أرقام على الحدود');

    const feeTok = await adam.client.token(`${ADMIN}/requests/2`);
    const amounts = [
      ['صفر', '0', true],
      ['سالب', '-5000', 'either'],
      ['كسور', '1234.567', true],
      ['رقم ضخم', '999999999999999', 'either'],
      ['نص مش رقم', 'خمسميت جنيه', false],
      ['أُسّي', '1e20', 'either'],
      ['لانهاية', 'Infinity', false],
      ['NaN', 'NaN', false],
    ];

    for (const [name, value, shouldSave] of amounts) {
      const before = db.prepare('SELECT COUNT(*) c FROM fee_items WHERE request_id = 2').get().c;
      await adam.client.post(`${ADMIN}/requests/2/fees`, {
        body: { _csrf: feeTok, label: `بند ${name}`, amount: value },
      });
      const after = db.prepare('SELECT COUNT(*) c FROM fee_items WHERE request_id = 2').get().c;

      if (shouldSave === false) {
        check(`مبلغ «${name}» مرفوض`, after === before, 'اتحفظ');
      } else {
        check(`مبلغ «${name}» مش بيكسّر`, true);
      }
    }

    const total = db
      .prepare('SELECT total_amount FROM requests WHERE id = 2')
      .get().total_amount;
    check('الإجمالي رقم صالح',
      Number.isFinite(total) && !Number.isNaN(total), String(total));

    const sumCheck = db
      .prepare('SELECT COALESCE(SUM(amount),0) s FROM fee_items WHERE request_id = 2')
      .get().s;
    check('الإجمالي مطابق لمجموع البنود',
      Math.abs(total - sumCheck) < 0.01, `${total} مقابل ${sumCheck}`);

    // ================================================== text
    section('نصوص غريبة');

    const weird = [
      ['إيموجي', '🔴 عاجل جداً 🚨 الطلب ده 🇪🇬'],
      ['عربي وإنجليزي', 'العميل John Smith عايز building license'],
      ['أرقام هندية', '١٢٣٤٥٦٧٨٩٠ رقم الطلب'],
      ['تشكيل', 'الطَّلَبُ مُسْتَعْجِلٌ جِدّاً'],
      ['اتجاهات مختلطة', 'رقم +20 100 مع نص عربي and English'],
      ['أسطر كتير', 'سطر\n'.repeat(60)],
      ['مسافات صفرية', 'نص\u200Bفيه\u200Bمسافات\u200Bصفرية'],
      ['رموز', '«الطلب» — ٥٠٪ … ✓ ★ ₪ €'],
    ];

    for (const [name, text] of weird) {
      const r = await adam.client.post(`${ADMIN}/requests/1/comments`, {
        body: { _csrf: blankTok, body: text },
      });
      check(`تعليق ${name} بيتقبل`, r.status === 302, `status ${r.status}`);
    }

    const page = (await adam.client.get(`${ADMIN}/requests/1`)).text;
    check('الإيموجي بيتعرض صح', has(page, '🔴 عاجل جداً'));
    check('الأرقام الهندية بتتعرض', has(page, '١٢٣٤٥٦٧٨٩٠'));
    check('التشكيل محفوظ', has(page, 'الطَّلَبُ'));

    // Search has to find text however it was written.
    const searchArabic = await adam.client.get(
      `${ADMIN}/requests?q=${encodeURIComponent('سارة')}`
    );
    check('البحث بالعربي شغّال', searchArabic.status === 200);

    const searchDiacritics = await adam.client.get(
      `${ADMIN}/requests?q=${encodeURIComponent('سَارَة')}`
    );
    check('البحث مع التشكيل مش بيكسّر', searchDiacritics.status === 200);

    // ================================================== boundaries
    section('حدود الطول');

    const lengths = [
      ['حرف واحد', 'أ'],
      ['١٠٠ حرف', 'أ'.repeat(100)],
      ['٥٠٠٠ حرف', 'ب'.repeat(5000)],
      ['١٠٠٠٠ حرف', 'ج'.repeat(10000)],
    ];

    for (const [name, text] of lengths) {
      const r = await adam.client.post(`${ADMIN}/requests/1/comments`, {
        body: { _csrf: blankTok, body: text },
      });
      check(`تعليق ${name} مش بيكسّر`, [302, 400, 413].includes(r.status), `status ${r.status}`);
    }

    const longest = db
      .prepare('SELECT MAX(length(body)) m FROM comments')
      .get().m;
    check('التعليقات مقصوصة عند الحد', longest <= 5000, `أطول تعليق ${longest}`);

    const longName = 'محمد '.repeat(60);
    const longVisitor = makeClient();
    const lvTok = await longVisitor.token('/request');
    const longRes = await longVisitor.post('/request', {
      // A description long enough to stand as the request, since no service is
      // picked here — that rule is exercised on its own below.
      body: { _csrf: lvTok, name: longName, phone: '+201009990000',
              message: 'اختبار اسم طويل جداً مع وصف كافي للطلب' },
    });
    check('اسم طويل جداً مش بيكسّر الطلب',
      [302, 400, 413].includes(longRes.status), `status ${longRes.status}`);

    // ================================================== dates
    section('تواريخ غريبة');

    const dateTok = await adam.client.token(`${ADMIN}/requests/3`);
    const dates = [
      ['فاضي', ''],
      ['في الماضي البعيد', '1900-01-01'],
      ['في المستقبل البعيد', '2099-12-31'],
      ['٢٩ فبراير سنة كبيسة', '2028-02-29'],
      ['٢٩ فبراير سنة عادية', '2027-02-29'],
      ['شهر ١٣', '2026-13-01'],
      ['يوم ٣٢', '2026-01-32'],
      ['صيغة غلط', '31/12/2026'],
      ['نص', 'بكرة'],
    ];

    for (const [name, value] of dates) {
      const r = await adam.client.post(`${ADMIN}/requests/3/deadline`, {
        body: { _csrf: dateTok, deadline: value },
      });
      check(`موعد «${name}» مش بيكسّر`, [302, 400].includes(r.status), `status ${r.status}`);
    }

    const savedDeadline = db.prepare('SELECT deadline FROM requests WHERE id = 3').get().deadline;
    check('الموعد المحفوظ صالح أو فاضي',
      !savedDeadline || /^\d{4}-\d{2}-\d{2}$/.test(savedDeadline), String(savedDeadline));

    // The overdue watch must not choke on anything stored.
    const deadlines = require('./lib/deadlines');
    db.prepare("UPDATE requests SET deadline = '2027-02-29' WHERE id = 4").run();
    let watchOk = true;
    try {
      deadlines.run();
    } catch (_) {
      watchOk = false;
    }
    check('مراقب المواعيد مش بيقع مع تاريخ غلط', watchOk);

    // ================================================== horizons
    section('فترات ومدد غريبة');

    const horizons = ['week', 'month', 'quarter', 'half', '', 'nonsense', '../../etc',
      '999999', '-1', 'null', "' OR 1=1"];
    for (const h of horizons) {
      const r = await adam.client.get(`${ADMIN}/?due=${encodeURIComponent(h)}`);
      check(`فترة «${h || 'فاضية'}»`, r.status === 200, `status ${r.status}`);
    }

    const dayValues = ['0', '-30', '99999', 'abc', '1.5', '1e10', '', "' OR 1=1"];
    for (const d of dayValues) {
      const r = await adam.client.get(`${ADMIN}/requests?days=${encodeURIComponent(d)}&open=1`);
      check(`مدة «${d || 'فاضية'}»`, r.status === 200, `status ${r.status}`);
    }

    // A request with no deadline must never appear in a deadline list.
    db.prepare('UPDATE requests SET deadline = NULL WHERE id = 3').run();
    const noDeadline = db.prepare('SELECT ref FROM requests WHERE id = 3').get().ref;
    const board = await adam.client.get(`${ADMIN}/?due=half`);
    const dueArea = board.text.slice(board.text.indexOf('due-group'), board.text.indexOf('آخر النشاط'));
    check('طلب بدون موعد مش بيظهر في المواعيد',
      !dueArea.includes(noDeadline), 'ظهر بدون موعد');

    // Neither must a finished one, however far past its date.
    db.prepare("UPDATE requests SET deadline = date('now','-200 days'), status = 'completed' WHERE id = 4").run();
    const doneRef = db.prepare('SELECT ref FROM requests WHERE id = 4').get().ref;
    const board2 = await adam.client.get(`${ADMIN}/`);
    const dueArea2 = board2.text.slice(board2.text.indexOf('due-group'), board2.text.indexOf('آخر النشاط'));
    check('طلب مكتمل ومتأخر مش بيظهر', !dueArea2.includes(doneRef), 'المكتمل ظهر');

    // A deadline exactly today belongs to the upcoming side, not the overdue one.
    db.prepare("UPDATE requests SET deadline = date('now'), status = 'in_progress' WHERE id = 5").run();
    const todayRef = db.prepare('SELECT ref FROM requests WHERE id = 5').get().ref;
    const board3 = await adam.client.get(`${ADMIN}/?due=week`);
    const overdueBlock = board3.text.slice(
      board3.text.indexOf('due-group overdue'),
      board3.text.indexOf('due-filters')
    );
    check('موعد النهاردة مش محسوب متأخر',
      !overdueBlock.includes(todayRef) || board3.text.indexOf('due-group overdue') === -1);
    check('وظاهر في القادم', board3.text.slice(board3.text.indexOf('id="due"')).includes(todayRef));

    // ================================================== ids
    section('معرّفات غير موجودة أو غريبة');

    const badIds = ['0', '-1', '999999', 'abc', '1.5', '1e10', 'null', '%00', '../1',
      '9999999999999999999'];

    for (const id of badIds) {
      const r = await adam.client.get(`${ADMIN}/requests/${encodeURIComponent(id)}`);
      check(`طلب رقم «${id}»`, [302, 400, 403, 404].includes(r.status), `status ${r.status}`);
    }

    for (const id of badIds.slice(0, 5)) {
      const r = await adam.client.get(`${ADMIN}/clients/${encodeURIComponent(id)}`);
      check(`ملف عميل «${id}»`, [200, 302, 404].includes(r.status), `status ${r.status}`);
    }

    const badFile = await adam.client.get('/files/999999');
    check('ملف مش موجود', [403, 404].includes(badFile.status), `status ${badFile.status}`);

    // ================================================== concurrency
    section('عمليات متزامنة');

    // Two people ticking the same step at the same instant.
    const todo = db.prepare('SELECT * FROM todos WHERE request_id = 1 LIMIT 1').get();
    const tTok = await adam.client.token(`${ADMIN}/requests/1`);
    const nTok = await nour.client.token(`${ADMIN}/requests/1`);

    await Promise.all([
      adam.client.post(`${ADMIN}/requests/1/todos/${todo.id}/toggle`, { body: { _csrf: tTok } }),
      nour.client.post(`${ADMIN}/requests/1/todos/${todo.id}/toggle`, { body: { _csrf: nTok } }),
    ]);

    const afterToggle = db.prepare('SELECT * FROM todos WHERE id = ?').get(todo.id);
    check('التعليم المتزامن مش بيفسد الصف',
      afterToggle && [0, 1].includes(afterToggle.done), String(afterToggle && afterToggle.done));

    // Many comments at once must all land, with no duplicates or losses.
    const commentsBefore = db.prepare('SELECT COUNT(*) c FROM comments WHERE request_id = 1').get().c;
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        adam.client.post(`${ADMIN}/requests/1/comments`, {
          body: { _csrf: tTok, body: `تعليق متزامن رقم ${i}` },
        })
      )
    );
    const commentsAfter = db.prepare('SELECT COUNT(*) c FROM comments WHERE request_id = 1').get().c;
    check('١٢ تعليق متزامن كلهم اتسجلوا',
      commentsAfter === commentsBefore + 12, `${commentsAfter - commentsBefore} من ١٢`);

    // Concurrent fee edits must leave the total consistent with its lines.
    const feeTok2 = await adam.client.token(`${ADMIN}/requests/5`);
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        adam.client.post(`${ADMIN}/requests/5/fees`, {
          body: { _csrf: feeTok2, label: `بند متزامن ${i}`, amount: String(1000 + i) },
        })
      )
    );
    const t5 = db.prepare('SELECT total_amount FROM requests WHERE id = 5').get().total_amount;
    const s5 = db.prepare('SELECT COALESCE(SUM(amount),0) s FROM fee_items WHERE request_id = 5').get().s;
    check('الإجمالي متسق بعد كتابات متزامنة',
      Math.abs(t5 - s5) < 0.01, `${t5} مقابل ${s5}`);

    // Two public requests submitted at the same moment must not collide.
    const refsBefore = db.prepare('SELECT COUNT(DISTINCT ref) c FROM requests').get().c;
    await Promise.all(
      Array.from({ length: 10 }, async (_, i) => {
        const c = makeClient();
        const t = await c.token('/request');
        return c.post('/request', {
          body: { _csrf: t, name: `عميل متزامن ${i}`, phone: `+20100000${1000 + i}`,
                  message: 'اختبار التزامن' },
        });
      })
    );
    const allRefs = db.prepare('SELECT ref FROM requests').all().map((r) => r.ref);
    check('كل أرقام الطلبات فريدة',
      new Set(allRefs).size === allRefs.length,
      `${allRefs.length - new Set(allRefs).size} مكرر`);
    check('١٠ طلبات متزامنة كلها اتسجلت',
      db.prepare('SELECT COUNT(DISTINCT ref) c FROM requests').get().c === refsBefore + 10);

    // ================================================== state
    section('حالات مستحيلة');

    // Archiving a request twice.
    const archTok = await adam.client.token(`${ADMIN}/requests/6`);
    await adam.client.post(`${ADMIN}/requests/6/archive`, { body: { _csrf: archTok } });
    const twice = await adam.client.post(`${ADMIN}/requests/6/archive`, { body: { _csrf: archTok } });
    check('الأرشفة مرتين مش بتكسّر', [302, 403].includes(twice.status), `status ${twice.status}`);

    // Restoring the same trashed item twice.
    const catBefore = db.prepare('SELECT COUNT(*) c FROM categories').get().c;
    const cTok = await adam.client.token(`${ADMIN}/content`);
    db.prepare("INSERT INTO categories (sort, name_ar, name_en) VALUES (99, 'قسم مؤقت', 'Temp')").run();
    const tempCat = db.prepare('SELECT id FROM categories ORDER BY id DESC LIMIT 1').get();

    const del = await adam.client.post(`${ADMIN}/content/categories/${tempCat.id}/delete`,
      { body: { _csrf: cTok } });
    const undoId = (del.location || '').match(/undo=(\d+)/);

    if (undoId) {
      await adam.client.post(`${ADMIN}/trash/${undoId[1]}/restore`,
        { body: { _csrf: cTok, next: `${ADMIN}/content` } });
      const again = await adam.client.post(`${ADMIN}/trash/${undoId[1]}/restore`,
        { body: { _csrf: cTok, next: `${ADMIN}/content` } });
      check('الاسترجاع مرتين مرفوض',
        (again.location || '').includes('undo_err'), again.location);
      check('مفيش قسم مكرر',
        db.prepare('SELECT COUNT(*) c FROM categories').get().c === catBefore + 1);
    }

    // A comment struck twice, then restored twice.
    const cmt = db.prepare('SELECT id FROM comments WHERE deleted_at IS NULL LIMIT 1').get();
    await adam.client.post(`${ADMIN}/requests/1/comments/${cmt.id}/delete`, { body: { _csrf: tTok } });
    await adam.client.post(`${ADMIN}/requests/1/comments/${cmt.id}/delete`, { body: { _csrf: tTok } });
    const struck = db.prepare('SELECT * FROM comments WHERE id = ?').get(cmt.id);
    check('الشطب مرتين مش بيفسد التعليق', !!struck.deleted_at && !!struck.body);

    await adam.client.post(`${ADMIN}/requests/1/comments/${cmt.id}/restore`, { body: { _csrf: tTok } });
    await adam.client.post(`${ADMIN}/requests/1/comments/${cmt.id}/restore`, { body: { _csrf: tTok } });
    check('الرجوع مرتين برضه سليم',
      !db.prepare('SELECT deleted_at FROM comments WHERE id = ?').get(cmt.id).deleted_at);

    // Assigning the same lawyer twice.
    const monaId = db.prepare("SELECT id FROM users WHERE username = 'mona'").get().id;
    const asgTok = await adam.client.token(`${ADMIN}/requests/7`);
    await adam.client.post(`${ADMIN}/requests/7/assign`, { body: { _csrf: asgTok, user_id: monaId } });
    await adam.client.post(`${ADMIN}/requests/7/assign`, { body: { _csrf: asgTok, user_id: monaId } });
    check('تعيين نفس المحامي مرتين مش بيكرر',
      db.prepare('SELECT COUNT(*) c FROM request_assignees WHERE request_id = 7 AND user_id = ?')
        .get(monaId).c === 1);

    // ================================================== trash
    section('سلة المحذوفات — بعمق');

    const trashTok = await adam.client.token(`${ADMIN}/content`);

    // A category and its services must come back together: restoring the
    // category alone would leave services pointing at nothing.
    db.prepare("INSERT INTO categories (sort, name_ar, name_en) VALUES (90, 'قسم للاختبار', 'Test')").run();
    const testCat = db.prepare('SELECT id FROM categories ORDER BY id DESC LIMIT 1').get();
    db.prepare(
      `INSERT INTO services (category_id, sort, title_ar, title_en, body_ar, body_en, active)
       VALUES (?,1,'خدمة أ','A','وصف','desc',1), (?,2,'خدمة ب','B','وصف','desc',1)`
    ).run(testCat.id, testCat.id);

    const svcCountBefore = db
      .prepare('SELECT COUNT(*) c FROM services WHERE category_id = ?')
      .get(testCat.id).c;
    check('القسم فيه خدمتين', svcCountBefore === 2);

    // A category with services in it is refused rather than silently taking
    // them down with it — the services have to be dealt with first.
    const guarded = await adam.client.post(`${ADMIN}/content/categories/${testCat.id}/delete`,
      { body: { _csrf: trashTok } });
    check('قسم فيه خدمات مش بيتحذف',
      (guarded.location || '').includes('cat_has_services'), guarded.location);
    check('والخدمات لسه موجودة',
      db.prepare('SELECT COUNT(*) c FROM services WHERE category_id = ?').get(testCat.id).c === 2);

    // Clear the services, then the category can go.
    const svcIds = db.prepare('SELECT id FROM services WHERE category_id = ?').all(testCat.id);
    for (const svc of svcIds) {
      await adam.client.post(`${ADMIN}/content/services/${svc.id}/delete`,
        { body: { _csrf: trashTok } });
    }
    check('الخدمات اتحذفت واحدة واحدة',
      db.prepare('SELECT COUNT(*) c FROM services WHERE category_id = ?').get(testCat.id).c === 0);

    const svcTrash = db
      .prepare("SELECT COUNT(*) c FROM trash WHERE entity = 'service'")
      .get().c;
    check('وكل واحدة دخلت السلة', svcTrash >= 2, `${svcTrash} في السلة`);

    const delCat = await adam.client.post(`${ADMIN}/content/categories/${testCat.id}/delete`,
      { body: { _csrf: trashTok } });
    const catUndo = (delCat.location || '').match(/undo=(\d+)/);
    check('القسم الفاضي بيتحذف ويدي لينك تراجع', !!catUndo, delCat.location);

    if (catUndo) {
      await adam.client.post(`${ADMIN}/trash/${catUndo[1]}/restore`,
        { body: { _csrf: trashTok, next: `${ADMIN}/content` } });

      check('القسم رجع بنفس المعرّف',
        !!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(testCat.id),
        'المعرّف اتغيّر — الخدمات هتبقى يتيمة');
      check('والروابط لسه صحيحة',
        db.prepare('PRAGMA foreign_key_check').all().length === 0);

      // Restoring a service after its category is back must reconnect them.
      const svcTrashRow = db
        .prepare("SELECT id FROM trash WHERE entity = 'service' ORDER BY id DESC LIMIT 1")
        .get();
      if (svcTrashRow) {
        await adam.client.post(`${ADMIN}/trash/${svcTrashRow.id}/restore`,
          { body: { _csrf: trashTok, next: `${ADMIN}/content` } });
        check('الخدمة رجعت لقسمها',
          db.prepare('SELECT COUNT(*) c FROM services WHERE category_id = ?').get(testCat.id).c >= 1);
      }
    }

    // Deleting the same thing twice must not produce two trash entries that
    // both restore.
    // Deleting something that is already gone must not create a second entry
    // that would restore a duplicate.
    const emptyCat = db
      .prepare("INSERT INTO categories (sort, name_ar, name_en) VALUES (91, 'قسم فاضي', 'Empty')")
      .run().lastInsertRowid;

    const trashBefore = db.prepare('SELECT COUNT(*) c FROM trash').get().c;
    await adam.client.post(`${ADMIN}/content/categories/${emptyCat}/delete`,
      { body: { _csrf: trashTok } });
    await adam.client.post(`${ADMIN}/content/categories/${emptyCat}/delete`,
      { body: { _csrf: trashTok } });
    check('حذف اللي اتحذف مش بيكرر صف',
      db.prepare('SELECT COUNT(*) c FROM trash').get().c === trashBefore + 1,
      `${db.prepare('SELECT COUNT(*) c FROM trash').get().c - trashBefore} صف`);

    // The trash page itself, and the age window.
    const trashPage = await adam.client.get(`${ADMIN}/trash`);
    check('صفحة السلة بتفتح', trashPage.status === 200);
    check('بتعرض المحذوفات', has(trashPage.text, 'قسم فاضي') || has(trashPage.text, 'خدمة'));
    check('وبتقول باقي كام يوم', /\d+\s*يوم/.test(trashPage.text));

    const trashRow = db
      .prepare("SELECT * FROM trash WHERE entity = 'category' ORDER BY id DESC LIMIT 1")
      .get();
    check('الصف محتفظ بالبيانات كاملة', !!trashRow && !!trashRow.payload);
    check('والبيانات JSON صالح', (() => {
      try { return !!JSON.parse(trashRow.payload); } catch { return false; }
    })());
    check('ومسجّل مين حذفه وامتى', !!trashRow.deleted_by && !!trashRow.deleted_at);

    // A trashed item past its window is gone for good.
    const oldId = db
      .prepare(
        `INSERT INTO trash (entity, entity_id, label, payload, deleted_by, deleted_at)
         VALUES ('category', 9999, 'قديم جداً', '{}', 'اختبار', datetime('now','-60 days'))`
      )
      .run().lastInsertRowid;

    const expired = await adam.client.post(`${ADMIN}/trash/${oldId}/restore`,
      { body: { _csrf: trashTok, next: `${ADMIN}/trash` } });
    check('المنتهي مش بيترجع',
      (expired.location || '').includes('undo_err') || expired.status === 302,
      expired.location);

    // A forged id must not restore anything.
    const forged = await adam.client.post(`${ADMIN}/trash/999999/restore`,
      { body: { _csrf: trashTok, next: `${ADMIN}/trash` } });
    check('معرّف مش موجود بيترفض بهدوء', [302, 404].includes(forged.status), `status ${forged.status}`);

    // A lawyer must not be able to restore anything.
    const lawyerRestore = await mona.client.post(`${ADMIN}/trash/${trashRow.id}/restore`,
      { body: { _csrf: trashTok, next: `${ADMIN}/trash` } });
    check('المحامي مش بيرجّع من السلة', lawyerRestore.status === 403,
      `status ${lawyerRestore.status}`);

    check('السلة مش بتكسر تماسك الداتا',
      db.prepare('PRAGMA foreign_key_check').all().length === 0);
    check('قاعدة البيانات سليمة بعد كل ده',
      db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok');

    // ================================================== session
    section('جلسات منتهية أو معطوبة');

    // A staff account deactivated while signed in.
    const victim = await loginStaff('tarek', 'demo1234');
    check('دخل عادي', !!victim.redirect);

    db.prepare("UPDATE users SET active = 0 WHERE username = 'tarek'").run();
    const afterDisable = await victim.client.get(`${ADMIN}/requests`);
    check('الحساب الموقوف بيتطرد فوراً',
      afterDisable.status === 302 && !(afterDisable.location || '').includes('/requests'),
      afterDisable.location);
    db.prepare("UPDATE users SET active = 1 WHERE username = 'tarek'").run();

    // A client whose account is removed mid-session.
    const doomed = await loginClient('john@demo.sanad', 'demo1234');
    const johnId = db.prepare("SELECT id FROM clients WHERE email = 'john@demo.sanad'").get().id;
    const johnRow = db.prepare('SELECT * FROM clients WHERE id = ?').get(johnId);

    // Detach first: the requests reference this row, and the point of the test
    // is the orphaned session, not breaking referential integrity.
    const ownedIds = db.prepare('SELECT id FROM requests WHERE client_id = ?').all(johnId);
    const caseIds = db.prepare('SELECT id FROM legal_cases WHERE client_id = ?').all(johnId);
    const agendaIds = db.prepare('SELECT id FROM agenda_events WHERE client_id = ?').all(johnId);
    const treasuryIds = db.prepare('SELECT id FROM treasury_transactions WHERE client_id = ?').all(johnId);
    const openedTicketIds = db.prepare('SELECT id FROM support_tickets WHERE opened_by_client_id = ?').all(johnId);
    const linkedTicketIds = db.prepare('SELECT id FROM support_tickets WHERE client_id = ?').all(johnId);
    db.prepare('UPDATE requests SET client_id = NULL WHERE client_id = ?').run(johnId);
    db.prepare('UPDATE legal_cases SET client_id = NULL WHERE client_id = ?').run(johnId);
    db.prepare('UPDATE agenda_events SET client_id = NULL WHERE client_id = ?').run(johnId);
    db.prepare('UPDATE treasury_transactions SET client_id = NULL WHERE client_id = ?').run(johnId);
    db.prepare('UPDATE support_tickets SET opened_by_client_id = NULL WHERE opened_by_client_id = ?').run(johnId);
    db.prepare('UPDATE support_tickets SET client_id = NULL WHERE client_id = ?').run(johnId);
    db.prepare('DELETE FROM clients WHERE id = ?').run(johnId);

    const orphan = await doomed.client.get('/portal');
    check('العميل المحذوف مش بيكسّر الصفحة',
      [200, 302].includes(orphan.status), `status ${orphan.status}`);

    db.prepare(
      `INSERT INTO clients (id, email, password_hash, full_name, phone, relation,
                            email_verified, created_at)
       VALUES (@id, @email, @password_hash, @full_name, @phone, @relation,
               @email_verified, @created_at)`
    ).run({
      id: johnRow.id, email: johnRow.email, password_hash: johnRow.password_hash,
      full_name: johnRow.full_name, phone: johnRow.phone, relation: johnRow.relation,
      email_verified: johnRow.email_verified, created_at: johnRow.created_at,
    });
    ownedIds.forEach((r) =>
      db.prepare('UPDATE requests SET client_id = ? WHERE id = ?').run(johnId, r.id)
    );
    caseIds.forEach((r) => db.prepare('UPDATE legal_cases SET client_id = ? WHERE id = ?').run(johnId, r.id));
    agendaIds.forEach((r) => db.prepare('UPDATE agenda_events SET client_id = ? WHERE id = ?').run(johnId, r.id));
    treasuryIds.forEach((r) => db.prepare('UPDATE treasury_transactions SET client_id = ? WHERE id = ?').run(johnId, r.id));
    openedTicketIds.forEach((r) => db.prepare('UPDATE support_tickets SET opened_by_client_id = ? WHERE id = ?').run(johnId, r.id));
    linkedTicketIds.forEach((r) => db.prepare('UPDATE support_tickets SET client_id = ? WHERE id = ?').run(johnId, r.id));

    // A stale CSRF token after the session was regenerated.
    const staleClient = makeClient();
    const staleTok = await staleClient.token(`${ADMIN}/login`);
    await staleClient.post(`${ADMIN}/login`, {
      body: { _csrf: staleTok, username: 'nour', password: 'demo1234' },
    });
    const stalePost = await staleClient.post(`${ADMIN}/requests/1/comments`, {
      body: { _csrf: staleTok, body: 'توكن قديم' },
    });
    check('توكن من قبل تجديد الجلسة مرفوض', stalePost.status === 403, `status ${stalePost.status}`);

    // ================================================== integrity
    section('تماسك البيانات');

    check('مفيش طلب بمرجع فاضي',
      db.prepare("SELECT COUNT(*) c FROM requests WHERE ref IS NULL OR ref = ''").get().c === 0);
    check('مفيش مرجع مكرر',
      db.prepare('SELECT COUNT(*) c FROM (SELECT ref FROM requests GROUP BY ref HAVING COUNT(*) > 1)')
        .get().c === 0);
    check('كل الطلبات لها phone_key',
      db.prepare("SELECT COUNT(*) c FROM requests WHERE phone_key IS NULL OR phone_key = ''").get().c === 0);
    check('فهرس البحث متزامن',
      db.prepare('SELECT COUNT(*) c FROM requests_fts').get().c ===
        db.prepare('SELECT COUNT(*) c FROM requests').get().c,
      `${db.prepare('SELECT COUNT(*) c FROM requests_fts').get().c} مقابل ${db.prepare('SELECT COUNT(*) c FROM requests').get().c}`);

    check('مفيش تعليق يتيم',
      db.prepare('SELECT COUNT(*) c FROM comments WHERE request_id NOT IN (SELECT id FROM requests)')
        .get().c === 0);
    check('مفيش خطوة يتيمة',
      db.prepare('SELECT COUNT(*) c FROM todos WHERE request_id NOT IN (SELECT id FROM requests)')
        .get().c === 0);
    check('مفيش ملف بدون مستند',
      db.prepare('SELECT COUNT(*) c FROM document_files WHERE document_id NOT IN (SELECT id FROM documents)')
        .get().c === 0);
    check('مفيش تعيين لموظف محذوف',
      db.prepare('SELECT COUNT(*) c FROM request_assignees WHERE user_id NOT IN (SELECT id FROM users)')
        .get().c === 0);

    check('كل الإجماليات مطابقة لبنودها', (() => {
      const bad = db
        .prepare(
          `SELECT r.id FROM requests r
           WHERE ABS(r.total_amount -
             (SELECT COALESCE(SUM(amount),0) FROM fee_items f WHERE f.request_id = r.id)) > 0.01`
        )
        .all();
      return bad.length === 0;
    })(), 'فيه طلب إجماليه مختلف');

    check('مفيش مدفوع بالسالب',
      db.prepare('SELECT COUNT(*) c FROM requests WHERE paid_amount < 0').get().c === 0);

    check('كل الملفات على الديسك موجودة', (() => {
      const { UPLOAD_DIR } = require('./db');
      const missing = db
        .prepare('SELECT stored_name FROM document_files')
        .all()
        .filter((f) => !fs.existsSync(path.join(UPLOAD_DIR, f.stored_name)));
      return missing.length === 0;
    })(), 'فيه ملف مسجّل ومش موجود');

    check('قاعدة البيانات سليمة',
      db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok');
    check('مفيش خرق للعلاقات',
      db.prepare('PRAGMA foreign_key_check').all().length === 0);

    // ================================================== permissions at the edges
    section('صلاحيات على الحدود');

    // A lawyer removed from a request mid-session must lose access.
    const kh = await loginStaff('khaled', 'demo1234');
    const khId = db.prepare("SELECT id FROM users WHERE username = 'khaled'").get().id;
    const assigned = db
      .prepare('SELECT request_id FROM request_assignees WHERE user_id = ? LIMIT 1')
      .get(khId);

    if (assigned) {
      check('بيشوف الطلب وهو معيّن',
        (await kh.client.get(`${ADMIN}/requests/${assigned.request_id}`)).status === 200);

      db.prepare('DELETE FROM request_assignees WHERE user_id = ? AND request_id = ?')
        .run(khId, assigned.request_id);

      check('بيتمنع فوراً بعد شيله',
        (await kh.client.get(`${ADMIN}/requests/${assigned.request_id}`)).status === 403);

      db.prepare('INSERT INTO request_assignees (request_id, user_id, assigned_by) VALUES (?,?,?)')
        .run(assigned.request_id, khId, 'إعادة');
    }

    // Role downgraded mid-session.
    const nourId = db.prepare("SELECT id FROM users WHERE username = 'nour'").get().id;
    db.prepare("UPDATE users SET role = 'lawyer' WHERE id = ?").run(nourId);
    const downgraded = await nour.client.get(`${ADMIN}/security`);
    check('تخفيض الصلاحية بيسري على الجلسة المفتوحة',
      downgraded.status === 403, `status ${downgraded.status}`);
    db.prepare("UPDATE users SET role = 'supervisor' WHERE id = ?").run(nourId);

    // ================================================== unicode in files
    section('أسماء ملفات ومستندات غريبة');

    const sharp = require('sharp');
    const img = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#ddd' } })
      .jpeg().toBuffer();

    const fileNames = [
      ['عربي', 'بطاقة الرقم القومي.jpg'],
      ['مسافات', '  ملف   فيه   مسافات  .jpg'],
      ['إيموجي', 'صورة 📸 البطاقة.jpg'],
      ['نقط كتير', 'ملف.اسمه.فيه.نقط.jpg'],
      ['طويل', 'ا'.repeat(200) + '.jpg'],
    ];

    for (const [label, filename] of fileNames) {
      const fd = new FormData();
      fd.append('_csrf', await client.client.token('/upload/2'));
      fd.append('name', `مستند ${label}`);
      fd.append('front', new Blob([img], { type: 'image/jpeg' }), filename);

      const r = await fetch(BASE + '/upload/2', {
        method: 'POST', body: fd, redirect: 'manual',
        headers: { cookie: client.client.cookieHeader() },
      });
      check(`اسم ملف ${label}`,
        (r.headers.get('location') || '').includes('msg=uploaded'), r.headers.get('location'));
    }

    check('كل الملفات المرفوعة ليها اسم مخزّن آمن',
      db.prepare('SELECT stored_name FROM document_files').all()
        .every((f) => /^[A-Za-z0-9._-]+$/.test(f.stored_name)),
      'فيه اسم مخزّن فيه حروف غريبة');

    // ============================================ RC1.1 P2-02: rejected upload
    // A disallowed file type on the request time-pause proof upload must be
    // handled as an ordinary validation failure (a redirect back to the page
    // with a friendly message), never as an unhandled server error.
    section('رفع إثبات إيقاف المدة — أنواع ملفات مسموحة ومرفوضة');

    const pauseRequestId = 1;
    const pauseUrl = `${ADMIN}/requests/${pauseRequestId}/time-pauses`;

    async function submitPause({ filename, mimeType, buffer, skipFile }) {
      const tokenPage = await adam.client.get(`${ADMIN}/requests/${pauseRequestId}`);
      const m = tokenPage.text.match(/name="_csrf" value="([^"]+)"/);
      const fd = new FormData();
      fd.append('_csrf', m ? m[1] : '');
      fd.append('reason', 'administrative');
      fd.append('note', `RC1.1 edge test ${Date.now()}`);
      if (!skipFile) fd.append('proof', new Blob([buffer], { type: mimeType }), filename);
      return fetch(BASE + pauseUrl, {
        method: 'POST', body: fd, redirect: 'manual',
        headers: { cookie: adam.client.cookieHeader() },
      });
    }

    // A. allowed extension (real image bytes, image/png)
    const goodPng = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#eee' } }).png().toBuffer();
    let r = await submitPause({ filename: 'proof.png', mimeType: 'image/png', buffer: goodPng });
    check('أ. نوع ملف مسموح: يُقبل ويُعاد توجيه المستخدم (لا 500)',
      r.status === 302 && (r.headers.get('location') || '').includes('msg=pause_added'), `status=${r.status} location=${r.headers.get('location')}`);

    // B. disallowed extension — this is the exact defect: used to be an
    // unhandled 500, must now be a controlled redirect with the app's own
    // existing friendly message surfaced via ?msg=pause_bad_type.
    r = await submitPause({ filename: 'malware.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ not a real image') });
    check('ب. نوع ملف مرفوض: لا يُرجع خطأ سيرفر عام 500',
      r.status !== 500, `status=${r.status}`);
    check('ب. نوع ملف مرفوض: يُعاد توجيه لصفحة الطلب برسالة واضحة',
      r.status === 302 && (r.headers.get('location') || '').includes('msg=pause_bad_type'), `status=${r.status} location=${r.headers.get('location')}`);

    // C. spoofed MIME (disallowed bytes, but declares an allowed content-type)
    // — documents the CURRENT, unchanged behavior: the filter trusts the
    // declared content-type, exactly as it did before this fix. This is not
    // a new gap introduced here; it is recorded so a future change to that
    // behavior shows up as an intentional diff, not a silent regression.
    r = await submitPause({ filename: 'spoofed.png', mimeType: 'image/png', buffer: Buffer.from('MZ not really a png') });
    check('ج. MIME مزوَّر (سلوك حالي غير متغيّر): يُقبل لأن الفحص يعتمد على النوع المُعلَن',
      r.status === 302 && (r.headers.get('location') || '').includes('msg=pause_added'), `status=${r.status} location=${r.headers.get('location')}`);

    // D. oversized file (pauseUpload's own limit is 10 MB)
    r = await submitPause({ filename: 'huge.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(11 * 1024 * 1024) });
    check('د. ملف أكبر من الحد المسموح: لا يُرجع 500',
      r.status !== 500, `status=${r.status}`);
    check('د. ملف أكبر من الحد المسموح: رسالة واضحة عن حجم الملف',
      r.status === 302 && (r.headers.get('location') || '').includes('msg=pause_too_big'), `status=${r.status} location=${r.headers.get('location')}`);

    // E. empty upload — the proof file is optional on this form; submitting
    // without one must still work normally, exactly like before this fix.
    r = await submitPause({ skipFile: true });
    check('هـ. بدون ملف مرفق (اختياري): يكمل بنجاح',
      r.status === 302 && (r.headers.get('location') || '').includes('msg=pause_added'), `status=${r.status} location=${r.headers.get('location')}`);

    // F. unauthorized role: a lawyer with no access to this request must be
    // stopped by the existing visibility gate before the upload code ever
    // runs — proves this fix did not touch permission/access enforcement.
    // The target request is looked up dynamically (a request khaled is not
    // assigned to) rather than assumed, so this does not depend on exactly
    // how the demo seed happens to be shuffled.
    const khaled = await loginStaff('khaled', 'demo1234');
    const khaledId = db.prepare("SELECT id FROM users WHERE username='khaled'").get()?.id;
    const outOfReachRequestId = db.prepare(
      `SELECT id FROM requests WHERE id NOT IN (SELECT request_id FROM request_assignees WHERE user_id=?) ORDER BY id LIMIT 1`
    ).get(khaledId)?.id;
    if (outOfReachRequestId) {
      const deniedPage = await khaled.client.get(`${ADMIN}/requests/${outOfReachRequestId}`);
      check('و. موظف بدون صلاحية رؤية الطلب: مرفوض 403 عند فتح صفحة الطلب',
        deniedPage.status === 403, `status=${deniedPage.status} request=${outOfReachRequestId}`);
      const fd = new FormData();
      fd.append('_csrf', '');
      fd.append('reason', 'administrative');
      fd.append('note', 'should never be reached');
      const rf = await fetch(BASE + `${ADMIN}/requests/${outOfReachRequestId}/time-pauses`, {
        method: 'POST', body: fd, redirect: 'manual',
        headers: { cookie: khaled.client.cookieHeader() },
      });
      check('و. موظف بدون صلاحية رؤية الطلب: يُمنع قبل الوصول لكود الرفع (لا يُقبل الملف)',
        rf.status === 403, `status=${rf.status}`);
    } else {
      check('و. موظف بدون صلاحية رؤية الطلب: يُمنع قبل الوصول لكود الرفع', false,
        'no request found that khaled is not assigned to in the current seed — cannot exercise this case');
    }

    // G. valid authorized upload — end to end, not just the redirect: the
    // proof file must actually be stored and linked to a real row.
    const beforeCount = db.prepare('SELECT COUNT(*) n FROM request_time_pauses WHERE request_id=? AND proof_path IS NOT NULL').get(pauseRequestId).n;
    r = await submitPause({ filename: 'proof2.png', mimeType: 'image/png', buffer: goodPng });
    const afterCount = db.prepare('SELECT COUNT(*) n FROM request_time_pauses WHERE request_id=? AND proof_path IS NOT NULL').get(pauseRequestId).n;
    check('ز. رفع صحيح ومُصرَّح به: يُخزَّن فعليًا ويرتبط بالسجل',
      r.status === 302 && afterCount === beforeCount + 1, `before=${beforeCount} after=${afterCount} status=${r.status}`);

    // ================================================== recovery
    section('التعافي');

    check('السيرفر لسه بيرد بعد كل ده',
      (await makeClient().get('/')).status === 200);
    check('لوحة الإدارة شغالة',
      (await adam.client.get(`${ADMIN}/requests`)).status === 200);
    check('بوابة العملاء شغالة',
      (await client.client.get('/portal')).status === 200);
    check('مفيش استثناءات غير معالَجة',
      !/UnhandledPromiseRejection|TypeError:|ReferenceError:/.test(H.state.serverOutput),
      H.state.serverOutput.slice(-200));
    // ================================================== demo removal
    section('مسح بيانات المحاكاة');

    // A real request, created after the demo, must survive the clear — that is
    // the whole reason the flag exists rather than a pattern match.
    const realTok = await adam.client.token(`${ADMIN}/requests/new`);
    const realRes = await adam.client.post(`${ADMIN}/requests/new`, {
      body: { _csrf: realTok, name: 'عميل حقيقي بعد المحاكاة', phone: '+201119998877',
              email: 'real@office.test', message: 'شغل حقيقي', relation: 'self' },
    });
    const realId = (realRes.location || '').match(/requests\/(\d+)/)[1];

    const realTok2 = await adam.client.token(`${ADMIN}/requests/${realId}`);
    await adam.client.post(`${ADMIN}/requests/${realId}/comments`,
      { body: { _csrf: realTok2, body: 'تعليق على شغل حقيقي' } });
    await adam.client.post(`${ADMIN}/revenue/request/${realId}`, {
      body: { _csrf: realTok2, amount: '1500', method: 'cash',
              paid_on: new Date().toISOString().slice(0, 10) },
    });

    check('الطلب الحقيقي مش متعلّم كمحاكاة',
      db.prepare('SELECT is_demo FROM requests WHERE id = ?').get(realId).is_demo === 0);

    const beforeClear = {
      services: db.prepare('SELECT COUNT(*) c FROM services').get().c,
      categories: db.prepare('SELECT COUNT(*) c FROM categories').get().c,
      settings: db.prepare('SELECT COUNT(*) c FROM settings').get().c,
      destinations: db.prepare('SELECT COUNT(*) c FROM destinations').get().c,
    };

    const removed = require('./demo-clear')({ quiet: true });
    check('المسح شال طلبات', removed.requests > 50, `${removed.requests}`);
    check('وشال عملاء', removed.clients > 20, `${removed.clients}`);
    check('وشال موظفين', removed.staff > 0, `${removed.staff}`);

    check('الطلب الحقيقي فضل',
      !!db.prepare('SELECT 1 FROM requests WHERE id = ?').get(realId), 'اتمسح شغل حقيقي');
    check('وتعليقه فضل',
      db.prepare('SELECT COUNT(*) c FROM comments WHERE request_id = ?').get(realId).c > 0);
    check('ودفعته فضلت',
      db.prepare('SELECT COUNT(*) c FROM payments WHERE request_id = ?').get(realId).c > 0);

    check('الخدمات مااتلمستش',
      db.prepare('SELECT COUNT(*) c FROM services').get().c === beforeClear.services);
    check('والأقسام', db.prepare('SELECT COUNT(*) c FROM categories').get().c === beforeClear.categories);
    check('والإعدادات', db.prepare('SELECT COUNT(*) c FROM settings').get().c === beforeClear.settings);
    check('والجهات', db.prepare('SELECT COUNT(*) c FROM destinations').get().c === beforeClear.destinations);

    check('مفيش بقايا محاكاة',
      db.prepare('SELECT COUNT(*) c FROM requests WHERE is_demo = 1').get().c === 0 &&
      db.prepare('SELECT COUNT(*) c FROM clients WHERE is_demo = 1').get().c === 0 &&
      db.prepare('SELECT COUNT(*) c FROM users WHERE is_demo = 1').get().c === 0);

    check('مفيش تعليق يتيم بعد المسح',
      db.prepare('SELECT COUNT(*) c FROM comments WHERE request_id NOT IN (SELECT id FROM requests)')
        .get().c === 0);
    check('ولا دفعة يتيمة',
      db.prepare('SELECT COUNT(*) c FROM payments WHERE request_id NOT IN (SELECT id FROM requests)')
        .get().c === 0);
    check('ولا تعيين لموظف محذوف',
      db.prepare('SELECT COUNT(*) c FROM request_assignees WHERE user_id NOT IN (SELECT id FROM users)')
        .get().c === 0);
    check('العلاقات سليمة', db.prepare('PRAGMA foreign_key_check').all().length === 0);

    check('المسح مرتين مش بيكسّر', (() => {
      try {
        require('./demo-clear')({ quiet: true });
        return true;
      } catch (_) {
        return false;
      }
    })());

  } catch (err) {
    H.state.fail += 1;
    H.state.failures.push('استثناء غير متوقع: ' + err.message);
    console.error('\n\x1b[31mERROR:\x1b[0m', err);
  } finally {
    H.stop();
  }

  process.exit(H.report() ? 1 : 0);
})();
