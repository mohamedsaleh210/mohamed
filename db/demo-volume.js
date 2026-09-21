const bcrypt = require('bcryptjs');

/**
 * Volume on top of the showcase.
 *
 * demo-data.js builds ten requests by hand — the ones you walk a client
 * through, where every comment reads like something a person wrote. That is the
 * right shape for a demonstration and the wrong shape for everything else: you
 * cannot see how a list behaves at page four, whether a filter narrows anything,
 * or what the revenue chart looks like across a year, from ten rows.
 *
 * So this adds two years of ordinary history around them. Generated, but not
 * arbitrary: the mix of statuses, the proportion that get paid late, the
 * clients who come back — these follow how the office actually works, because
 * data that is uniformly random tests nothing except that the code runs.
 */

const FIRST_NAMES = [
  'أحمد', 'محمد', 'محمود', 'مصطفى', 'خالد', 'عمرو', 'هشام', 'شريف', 'ياسر',
  'طارق', 'وليد', 'كريم', 'إسلام', 'رامي', 'باسم', 'أيمن', 'حسام', 'عادل',
  'سارة', 'منى', 'هدى', 'نهى', 'دينا', 'ريهام', 'مروة', 'شيماء', 'أميرة',
  'نورا', 'هبة', 'رانيا', 'إيمان', 'فاطمة', 'ندى', 'يارا', 'جيهان',
];

const FAMILY_NAMES = [
  'عبد الرحمن', 'السيد', 'إبراهيم', 'حسن', 'محمود', 'عبد العزيز', 'الشناوي',
  'الديب', 'فهمي', 'رشدي', 'عبد الله', 'الشربيني', 'زكي', 'الغريب', 'سليمان',
  'المنشاوي', 'عوض', 'بدوي', 'صادق', 'الحكيم', 'فوزي', 'الأنصاري', 'قنديل',
];

const FOREIGN_NAMES = [
  ['John Michael Carter', 'john.carter@example.com'],
  ['Maria Elena Rossi', 'm.rossi@example.com'],
  ['Ahmed Hassan Al-Rashid', 'a.rashid@example.com'],
  ['Sophie Laurent', 's.laurent@example.com'],
];

/** Comment bodies that read like an office thread rather than filler. */
const STAFF_NOTES = [
  'راجعت الأوراق، ناقص صورة البطاقة سارية.',
  'كلمت العميل وأكّد إنه هيبعت الورق بكرة.',
  'الملف اتقدّم للجهة، الرد خلال أسبوع تقريباً.',
  'فيه ملاحظة على العنوان في العقد — محتاج تصحيح.',
  'اتواصلت مع الموظف المسؤول، قال محتاجين صورة إضافية.',
  'الرسوم اتسددت، بننتظر رقم القيد.',
  'العميل عدّى على المكتب واستلم صورة من الطلب.',
  'راجعت البيانات مع المخطط، كله سليم.',
  'المعاينة اتحددت الأسبوع الجاي.',
  'الجهة طلبت مستند إضافي — ضفته في المطلوب من العميل.',
  'اتأخر الرد من الجهة، هتابع تاني الأسبوع ده.',
  'خلصنا المرحلة الأولى، باقي التصديق.',
  'العميل بعت الورق ناقص، رجعته له.',
  'تم استلام الموافقة المبدئية.',
  'محتاجين توكيل رسمي عشان نكمل.',
];

const REPLIES = [
  'تمام، متابع معاك.',
  'ماشي — أنا كلمته امبارح وقال هيجي.',
  'شكراً، هستنى الرد.',
  'ظبطها من فضلك وابعتلي.',
  'تمام كده، كمّل.',
  'أنا شايف إننا نستعجل الجهة.',
  'اتفقنا.',
  'محتاج أراجعها معاك قبل ما نبعت.',
];

const REQUIREMENT_TITLES = [
  'صورة بطاقة الرقم القومي سارية',
  'صورة من عقد الملكية',
  'إيصال كهرباء حديث',
  'صورة من الرخصة السابقة',
  'توكيل رسمي',
  'شهادة عدم ممانعة',
  'رسم هندسي معتمد',
  'صورة من عقد الإيجار',
  'مستخرج رسمي حديث',
  'إيصال سداد الرسوم',
];

const TODO_TITLES = [
  'مراجعة الأوراق المستلمة',
  'تجهيز ملف التقديم',
  'تقديم الطلب للجهة',
  'متابعة رقم القيد',
  'استلام الموافقة',
  'تصوير المستندات',
  'مراجعة قانونية للعقد',
  'التواصل مع العميل',
  'سداد الرسوم',
  'استلام النسخة النهائية',
  'تسليم العميل',
];

const SPECIAL_REQUESTS = [
  'العميل محتاج نسخة إضافية مصدّقة للسفارة.',
  'مطلوب إنهاء الإجراءات قبل نهاية الشهر لظروف سفر.',
  'العميل مسنّ ومحتاج نروح له في البيت للتوقيع.',
  'الملف مرتبط بقضية منظورة، ممنوع أي تأخير.',
];

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

/**
 * A seeded generator, so two runs on two machines produce the same history.
 * Debugging something you cannot reproduce is not debugging.
 */
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Weighted choice, so the mix looks like an office rather than a dice roll. */
function weighted(entries, rnd) {
  const total = entries.reduce((n, [, w]) => n + w, 0);
  let roll = rnd() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function generate(db, ctx) {
  const {
    refFor, services, staff, log, MONTHS = 24, REQUESTS = 70,
  } = ctx;

  const rnd = seededRandom(20260819);
  const now = Date.now();
  const day = 86400000;

  const iso = (daysAgo, hour = 10) => {
    const d = new Date(now - daysAgo * day);
    d.setHours(hour, Math.floor(rnd() * 60), 0, 0);
    return d.toISOString().replace('T', ' ').slice(0, 19);
  };
  const dateOnly = (daysAgo) => new Date(now - daysAgo * day).toISOString().slice(0, 10);

  const lawyers = staff.filter((s) => s.role === 'lawyer' && s.active);
  const supervisors = staff.filter((s) => s.role === 'supervisor');

  // ---------------------------------------------------------------- clients
  log('    · clients');

  const insClient = db.prepare(
    `INSERT INTO clients (email, password_hash, full_name, phone, relation, beneficiary_name,
                          email_verified, google_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  );

  const hash = bcrypt.hashSync('demo1234', 8);
  const clients = [];
  const usedPhones = new Set();

  const phoneFor = (i) => {
    let phone;
    do {
      phone = '+2010' + String(20000000 + i * 977 + Math.floor(rnd() * 90)).slice(0, 8);
    } while (usedPhones.has(phone));
    usedPhones.add(phone);
    return phone;
  };

  for (let i = 0; i < 34; i++) {
    const name = `${pick(FIRST_NAMES, rnd)} ${pick(FAMILY_NAMES, rnd)} ${pick(FAMILY_NAMES, rnd)}`;
    const registeredDaysAgo = Math.floor(rnd() * MONTHS * 30);

    // Roughly a third never create an account — they phone or walk in. Their
    // requests still have to group together by phone number.
    const hasAccount = rnd() > 0.34;
    const email = hasAccount ? `client${i + 20}@demo.sanad` : null;

    if (hasAccount) {
      const id = Number(
        insClient.run(
          email, hash, name, phoneFor(i),
          weighted([['self', 7], ['guardian', 2], ['agent', 1], ['relative', 1]], rnd),
          null,
          rnd() > 0.25 ? 1 : 0,
          // A few arrived through Google rather than a password.
          rnd() > 0.85 ? `demo-google-${i}` : null,
          iso(registeredDaysAgo)
        ).lastInsertRowid
      );
      clients.push({ id, name, phone: phoneFor(i + 500), email, since: registeredDaysAgo });
    } else {
      clients.push({ id: null, name, phone: phoneFor(i + 900), email: null, since: registeredDaysAgo });
    }
  }

  // Foreign clients, because the English side of the site has to be exercised.
  FOREIGN_NAMES.forEach(([name, email], i) => {
    const id = Number(
      insClient.run(email, hash, name, phoneFor(700 + i), 'self', null, 1, null, iso(200 + i * 30))
        .lastInsertRowid
    );
    clients.push({ id, name, phone: phoneFor(760 + i), email, since: 200 + i * 30 });
  });

  // ---------------------------------------------------------------- requests
  log('    · requests and their history');

  const insRequest = db.prepare(
    `INSERT INTO requests (ref, name, phone, email, client_id, service_id, service_label,
                           title, message, status, relation, beneficiary_name, special_request,
                           deadline, upload_token, opened_by, source, is_critical,
                           critical_reason, critical_by, critical_at, archived_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );

  const insComment = db.prepare(
    `INSERT INTO comments (request_id, parent_id, author_id, author_label, author_role,
                           body, deleted_at, deleted_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  );
  const insTodo = db.prepare(
    `INSERT INTO todos (request_id, title, done, done_by, done_at, done_on, sort, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  );
  const insReq = db.prepare(
    `INSERT INTO requirements (request_id, title, status, created_by, created_at)
     VALUES (?,?,?,?,?)`
  );
  const insFee = db.prepare(
    'INSERT INTO fee_items (request_id, label, amount, sort, created_by) VALUES (?,?,?,?,?)'
  );
  const insPayment = db.prepare(
    `INSERT INTO payments (request_id, amount, method, paid_on, reference, note,
                           recorded_by, created_at)
     VALUES (?,?,?,?,?,?,?,?)`
  );
  const insAssignee = db.prepare(
    'INSERT INTO request_assignees (request_id, user_id, assigned_by) VALUES (?,?,?)'
  );
  const insAudit = db.prepare(
    `INSERT INTO audit_log (user_label, action, entity_type, entity_id, entity_label, details, created_at)
     VALUES (?,?,?,?,?,?,?)`
  );

  const FEE_LINES = [
    ['أتعاب المكتب', [3000, 15000]],
    ['رسوم حكومية', [500, 4000]],
    ['مصاريف تصديق', [300, 1500]],
    ['مصاريف انتقالات', [200, 800]],
  ];

  const METHODS = [
    ['cash', 5], ['bank', 4], ['instapay', 3], ['wallet', 2],
    ['bank_intl', 1], ['remittance', 1], ['cheque', 1],
  ];

  let created = 0;

  for (let i = 0; i < REQUESTS; i++) {
    const client = pick(clients, rnd);
    const service = pick(services, rnd);

    // Spread across the whole window, weighted towards recent months so the
    // short filters have something to show.
    const ageDays = Math.floor(Math.pow(rnd(), 1.6) * MONTHS * 30);

    // Older requests are mostly finished; recent ones are mostly live. That
    // ratio is what makes the partial indexes and the "open" filter meaningful.
    const status =
      ageDays > 120
        ? weighted([['completed', 8], ['cancelled', 1], ['in_progress', 1]], rnd)
        : ageDays > 45
          ? weighted([['completed', 4], ['in_progress', 3], ['awaiting_payment', 2], ['cancelled', 1]], rnd)
          : weighted([
              ['new', 3], ['reviewing', 2], ['in_progress', 4],
              ['awaiting_docs', 2], ['awaiting_payment', 2], ['completed', 2],
            ], rnd);

    const closed = ['completed', 'cancelled'].includes(status);
    const critical = !closed && rnd() > 0.9;

    // Deadlines: some passed, some today, some months out, some absent.
    let deadline = null;
    if (rnd() > 0.25) {
      const offset = weighted(
        [[-Math.floor(rnd() * 60) - 1, 2], [0, 1], [Math.floor(rnd() * 7) + 1, 3],
         [Math.floor(rnd() * 60) + 8, 3], [Math.floor(rnd() * 150) + 70, 1]],
        rnd
      );
      deadline = dateOnly(-offset);
    }

    const ref = refFor();
    const relation = weighted([['self', 8], ['guardian', 2], ['agent', 1], ['relative', 1]], rnd);

    const requestId = Number(
      insRequest.run(
        ref,
        client.name,
        client.phone,
        client.email,
        client.id,
        service.id,
        `${service.title_ar} / ${service.title_en}`,
        rnd() > 0.6 ? `${service.title_ar} — ${pick(['الشيخ زايد', 'المعادي', 'مدينة نصر', 'الرحاب', 'أكتوبر', 'التجمع'], rnd)}` : null,
        `${service.title_ar} — ${pick(['محتاج أعرف الخطوات والمستندات المطلوبة.', 'الملف عندي جاهز ومحتاج أبدأ فوراً.', 'كلمت المكتب قبل كده وقالوا أقدّم الطلب أونلاين.', 'محتاج استشارة قبل ما أبدأ الإجراءات.'], rnd)}`,
        status,
        relation,
        relation === 'self' ? null : `${pick(FIRST_NAMES, rnd)} ${pick(FAMILY_NAMES, rnd)}`,
        rnd() > 0.88 ? pick(SPECIAL_REQUESTS, rnd) : null,
        deadline,
        require('crypto').randomBytes(24).toString('hex'),
        rnd() > 0.8 ? pick(supervisors, rnd).display_name : null,
        rnd() > 0.8 ? 'office' : 'website',
        critical ? 1 : 0,
        critical ? pick(['العميل مسافر الأسبوع الجاي.', 'مرتبط بموعد نهائي في الجهة.', 'الملف متأخر ومحتاج إنهاء عاجل.'], rnd) : null,
        critical ? pick(supervisors, rnd).display_name : null,
        critical ? iso(Math.max(1, ageDays - 2)) : null,
        // A slice of the finished work is archived, which is what the archive
        // tab and the partial indexes exist for.
        closed && ageDays > 200 && rnd() > 0.5 ? iso(Math.max(1, ageDays - 30)) : null,
        iso(ageDays, 9 + Math.floor(rnd() * 8))
      ).lastInsertRowid
    );

    created += 1;

    // ---- assignment
    if (status !== 'new' && lawyers.length) {
      const lead = pick(lawyers, rnd);
      insAssignee.run(requestId, lead.id, pick(supervisors, rnd).display_name);

      // Occasionally two lawyers share a file.
      if (rnd() > 0.85) {
        const second = pick(lawyers, rnd);
        if (second.id !== lead.id) {
          try {
            insAssignee.run(requestId, second.id, pick(supervisors, rnd).display_name);
          } catch (_) {
            /* the pair already exists */
          }
        }
      }
    }

    // ---- the conversation
    const threadSize = weighted([[0, 1], [1, 2], [2, 3], [3, 3], [5, 2], [8, 1]], rnd);
    let lastRoot = null;

    for (let c = 0; c < threadSize; c++) {
      const author = rnd() > 0.4 ? pick(lawyers, rnd) : pick(supervisors, rnd);
      const when = Math.max(0, ageDays - Math.floor((c + 1) * (ageDays / (threadSize + 2))));

      // A struck comment now and then, so the moderation path has real data.
      const struck = rnd() > 0.94;

      const commentId = Number(
        insComment.run(
          requestId, null, author.id, author.display_name, author.role,
          pick(STAFF_NOTES, rnd),
          struck ? iso(Math.max(0, when - 1)) : null,
          struck ? pick(supervisors, rnd).display_name : null,
          iso(when, 10 + Math.floor(rnd() * 7))
        ).lastInsertRowid
      );
      lastRoot = commentId;

      // Replies hang off a root comment — the thread shape is the point.
      const replyCount = weighted([[0, 5], [1, 3], [2, 1]], rnd);
      for (let r = 0; r < replyCount; r++) {
        const replier = rnd() > 0.5 ? pick(supervisors, rnd) : pick(lawyers, rnd);
        insComment.run(
          requestId, lastRoot, replier.id, replier.display_name, replier.role,
          pick(REPLIES, rnd), null, null,
          iso(Math.max(0, when - 1), 12 + r)
        );
      }
    }

    // ---- checklist
    const todoCount = weighted([[0, 1], [2, 3], [4, 4], [6, 2]], rnd);
    for (let t = 0; t < todoCount; t++) {
      // Finished requests have finished checklists; live ones are partly done.
      const done = closed ? rnd() > 0.05 : rnd() > 0.55;
      const doneAge = Math.max(0, ageDays - Math.floor(rnd() * ageDays));
      insTodo.run(
        requestId, pick(TODO_TITLES, rnd),
        done ? 1 : 0,
        done ? pick(lawyers, rnd).display_name : null,
        done ? iso(doneAge) : null,
        done ? dateOnly(doneAge) : null,
        t,
        pick(supervisors, rnd).display_name,
        iso(ageDays)
      );
    }

    // ---- what the client still owes us
    if (rnd() > 0.45) {
      const count = 1 + Math.floor(rnd() * 3);
      const titles = [...REQUIREMENT_TITLES].sort(() => rnd() - 0.5).slice(0, count);
      titles.forEach((title) => {
        insReq.run(
          requestId, title,
          closed || rnd() > 0.45 ? 'received' : 'pending',
          pick(supervisors, rnd).display_name,
          iso(Math.max(0, ageDays - 1))
        );
      });
    }

    // ---- money
    if (status !== 'new' && rnd() > 0.12) {
      const lineCount = 1 + Math.floor(rnd() * 3);
      let total = 0;

      for (let f = 0; f < lineCount; f++) {
        const [label, [min, max]] = FEE_LINES[f % FEE_LINES.length];
        const amount = Math.round((min + rnd() * (max - min)) / 50) * 50;
        total += amount;
        insFee.run(requestId, label, amount, f, pick(supervisors, rnd).display_name);
      }

      db.prepare('UPDATE requests SET total_amount = ? WHERE id = ?').run(total, requestId);

      // How much actually came in, and in how many instalments.
      const collected = closed
        ? weighted([[total, 8], [Math.round(total * 0.6), 1], [0, 1]], rnd)
        : weighted([[0, 3], [Math.round(total * 0.3), 3], [Math.round(total * 0.7), 2], [total, 2]], rnd);

      if (collected > 0) {
        const instalments = collected === total && rnd() > 0.5 ? 2 : 1;
        let left = collected;

        for (let p = 0; p < instalments; p++) {
          const amount = p === instalments - 1 ? left : Math.round(collected / instalments / 50) * 50;
          left -= amount;
          if (amount <= 0) continue;

          const method = weighted(METHODS, rnd);
          const paidAge = Math.max(0, ageDays - Math.floor(rnd() * Math.max(1, ageDays)));

          insPayment.run(
            requestId, amount, method, dateOnly(paidAge),
            ['cash', 'other'].includes(method)
              ? null
              : `${method.toUpperCase().slice(0, 3)}-${Math.floor(rnd() * 900000) + 100000}`,
            rnd() > 0.7 ? pick(['دفعة مقدّمة', 'دفعة تانية', 'تسوية نهائية'], rnd) : null,
            pick(supervisors, rnd).display_name,
            iso(paidAge)
          );
        }
      }

      // A handful of old unpaid files get written off, which is what keeps the
      // receivable figure honest.
      if (closed && collected < total && ageDays > 240 && rnd() > 0.5) {
        db.prepare(
          `UPDATE requests SET written_off = ?, write_off_reason = ?, write_off_by = ?,
                               write_off_at = ?
           WHERE id = ?`
        ).run(
          total - collected,
          pick(['العميل مش بيرد من شهور والمبلغ صغير.', 'اتفقنا على إعفائه لظروفه.', 'الملف اتقفل والمبلغ مش هيتحصّل.'], rnd),
          pick(supervisors, rnd).display_name,
          iso(Math.max(1, ageDays - 60)),
          requestId
        );
      }

      // Occasional discount, always with a reason.
      if (rnd() > 0.9) {
        db.prepare('UPDATE requests SET discount = ?, discount_reason = ? WHERE id = ?').run(
          Math.round(total * 0.1 / 50) * 50,
          pick(['عميل قديم', 'خصم متفق عليه', 'تعويض عن تأخير'], rnd),
          requestId
        );
      }
    }

    // ---- a trail worth reading later
    insAudit.run(
      'النظام', 'request.create', 'request', requestId, ref,
      'وصل طلب جديد من الموقع', iso(ageDays)
    );
    if (status !== 'new') {
      insAudit.run(
        pick(supervisors, rnd).display_name, 'request.update', 'request', requestId, ref,
        `غيّر الحالة إلى ${status}`, iso(Math.max(0, ageDays - 2))
      );
    }
  }

  // ---------------------------------------------------------------- errands
  log('    · destinations and trips');

  const destinations = db.prepare('SELECT id, name FROM destinations').all();
  const openRequests = db
    .prepare("SELECT id FROM requests WHERE status NOT IN ('completed','cancelled') AND archived_at IS NULL")
    .all();

  const insDest = db.prepare(
    `INSERT INTO request_destinations (request_id, destination_id, task, status, added_by,
                                       done_by, done_on, created_at)
     VALUES (?,?,?,?,?,?,?,?)`
  );

  const DEST_TASKS = [
    'تقديم الملف ومتابعة القيد',
    'استخراج مستخرج رسمي',
    'تصديق المستندات',
    'متابعة المعاينة',
    'سداد الرسوم واستلام الإيصال',
    'استلام الموافقة النهائية',
    'تسليم الأوراق الأصلية',
  ];

  openRequests.forEach((r) => {
    if (rnd() > 0.55) return;
    const count = 1 + (rnd() > 0.75 ? 1 : 0);
    for (let d = 0; d < count; d++) {
      const dest = pick(destinations, rnd);
      const done = rnd() > 0.65;
      const doneAge = Math.floor(rnd() * 40);
      insDest.run(
        r.id, dest.id, pick(DEST_TASKS, rnd),
        done ? 'done' : 'pending',
        pick(supervisors, rnd).display_name,
        done ? pick(lawyers, rnd).display_name : null,
        done ? dateOnly(doneAge) : null,
        iso(Math.floor(rnd() * 60))
      );
    }
  });

  // A few past trips and a couple ahead, so the history and the plan both show.
  const insTrip = db.prepare(
    `INSERT INTO trips (destination_id, trip_date, assignee_id, assignee_name, status, note,
                        created_by, created_at, closed_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  );

  for (let t = 0; t < 8; t++) {
    const dest = pick(destinations, rnd);
    const past = t < 6;
    const age = past ? 7 + Math.floor(rnd() * 120) : -(1 + Math.floor(rnd() * 10));
    const who = pick(lawyers, rnd);

    insTrip.run(
      dest.id, dateOnly(age), who.id, who.display_name,
      past ? 'done' : 'planned',
      rnd() > 0.5 ? pick(['الدور التالت — شباك ٤', 'من ٩ لـ ١٢ بس', 'الأتوبيس من أمام المكتب ٨ الصبح'], rnd) : null,
      pick(supervisors, rnd).display_name,
      iso(Math.abs(age) + 2),
      past ? iso(Math.max(0, age - 1)) : null
    );
  }

  // Attach the pending work at each destination to the trip planned for it.
  db.prepare(
    `UPDATE request_destinations
     SET trip_id = (SELECT t.id FROM trips t
                     WHERE t.destination_id = request_destinations.destination_id
                       AND t.status = 'planned' LIMIT 1)
     WHERE status = 'pending'
       AND EXISTS (SELECT 1 FROM trips t2
                    WHERE t2.destination_id = request_destinations.destination_id
                      AND t2.status = 'planned')`
  ).run();

  // ---------------------------------------------------------------- documents
  log('    · documents');

  const insDoc = db.prepare(
    `INSERT INTO documents (request_id, name, kind, note, uploaded_by, uploaded_by_id,
                            source, internal, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  );
  const insFile = db.prepare(
    `INSERT INTO document_files (document_id, stored_name, original_name, mime, size,
                                 page_no, side, original_size, was_converted, width, height)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  );

  const DOC_NAMES = [
    'بطاقة الرقم القومي', 'عقد الملكية', 'إيصال الكهرباء', 'الرسم الهندسي',
    'التوكيل الرسمي', 'إيصال سداد الرسوم', 'شهادة عدم الممانعة', 'عقد الإيجار',
  ];

  // A shared placeholder rather than thousands of generated images: what is
  // being demonstrated is the record and the thumbnail layout, not the pixels.
  const placeholder = db.prepare('SELECT stored_name FROM document_files LIMIT 1').get();

  if (placeholder) {
    const withDocs = db
      .prepare('SELECT id, created_at FROM requests ORDER BY id DESC LIMIT 45')
      .all();

    withDocs.forEach((r) => {
      if (rnd() > 0.6) return;
      const count = 1 + Math.floor(rnd() * 3);

      for (let d = 0; d < count; d++) {
        const fromClient = rnd() > 0.35;
        const docId = Number(
          insDoc.run(
            r.id, pick(DOC_NAMES, rnd), 'images',
            rnd() > 0.7 ? 'الصورة واضحة والبيانات مقروءة' : null,
            fromClient ? 'العميل' : pick(supervisors, rnd).display_name,
            fromClient ? null : pick(supervisors, rnd).id,
            fromClient ? 'client' : 'staff',
            !fromClient && rnd() > 0.7 ? 1 : 0,
            r.created_at
          ).lastInsertRowid
        );

        const pages = rnd() > 0.5 ? 2 : 1;
        for (let pg = 0; pg < pages; pg++) {
          const after = 90000 + Math.floor(rnd() * 200000);
          insFile.run(
            docId, placeholder.stored_name,
            `IMG_${1000 + Math.floor(rnd() * 8000)}.jpg`,
            'image/jpeg', after, pg + 1, pg === 0 ? 'front' : 'back',
            after * (2 + Math.floor(rnd() * 6)), 0, 2000, 1400 + Math.floor(rnd() * 600)
          );
        }
      }
    });
  }

  // ---------------------------------------------------------------- inbox
  log('    · notifications and devices');

  const insNotif = db.prepare(
    `INSERT INTO notifications (user_id, type, request_id, text, priority, seen_at, created_at)
     VALUES (?,?,?,?,?,?,?)`
  );

  const liveRequests = db
    .prepare(
      `SELECT id, ref, name FROM requests
       WHERE status NOT IN ('completed','cancelled') AND archived_at IS NULL
       ORDER BY id DESC LIMIT 30`
    )
    .all();

  staff.filter((u) => u.active).forEach((member) => {
    liveRequests.slice(0, 12).forEach((r, i) => {
      if (rnd() > 0.5) return;
      const age = Math.floor(rnd() * 20);
      // Most are read; the unread ones are what the badge counts.
      const seen = rnd() > 0.3;

      const kinds = [
        ['comment', `${pick(lawyers, rnd).display_name} علّق على ${r.ref}`, 'normal'],
        ['upload', `العميل رفع مستند على ${r.ref}`, 'normal'],
        ['new_request', `طلب جديد ${r.ref} — ${r.name}`, 'normal'],
        ['payment', `💰 دفعة جديدة على ${r.ref}`, 'normal'],
        ['deadline_missed', `⚠ ${r.ref} متأخر عن موعد التسليم — ${r.name}`, 'critical'],
      ];
      const [type, text, priority] = pick(kinds, rnd);

      // Accountants only ever hear about money.
      if (member.role === 'accountant' && !['payment', 'payment_complete'].includes(type)) return;
      if (member.role === 'lawyer' && type === 'payment') return;

      insNotif.run(
        member.id, type, r.id, text, priority,
        seen ? iso(Math.max(0, age - 1)) : null,
        iso(age, 8 + (i % 10))
      );
    });
  });

  const insDevice = db.prepare(
    `INSERT OR IGNORE INTO known_devices (user_id, fingerprint, label, ip, first_seen, last_seen, seen_count)
     VALUES (?,?,?,?,?,?,?)`
  );

  const DEVICES = [
    ['كمبيوتر|Chrome|Windows 10/11', 'كمبيوتر · Chrome · Windows 10/11'],
    ['موبايل|Safari|iOS', 'موبايل · Safari · iOS'],
    ['موبايل|Chrome|Android', 'موبايل · Chrome · Android'],
    ['كمبيوتر|Firefox|macOS', 'كمبيوتر · Firefox · macOS'],
  ];

  const admins = staff.filter((u) => u.role === 'admin' && u.active);

  staff.filter((u) => u.active).forEach((member, i) => {
    const count = 1 + Math.floor(rnd() * 2);

    for (let d = 0; d < count; d++) {
      const [fingerprint, label] = DEVICES[(i + d) % DEVICES.length];
      const firstSeen = Math.max(2, 200 - i * 10 - d * 40);
      const ip = `41.${40 + i}.${10 + d}.${100 + Math.floor(rnd() * 100)}`;

      insDevice.run(
        member.id, fingerprint, label, ip,
        iso(firstSeen), iso(Math.floor(rnd() * 5)),
        5 + Math.floor(rnd() * 120)
      );

      // The alert the admins would have received the first time that device
      // appeared. The first device on an account is not news — it is the person
      // signing in — so only the later ones raise one.
      if (d > 0) {
        admins.forEach((boss) => {
          if (boss.id === member.id) return;
          insNotif.run(
            boss.id, 'new_device', null,
            `🔐 ${member.display_name} دخل من جهاز جديد: ${label} — ${ip}`,
            'critical',
            firstSeen > 30 ? iso(firstSeen - 1) : null,
            iso(firstSeen)
          );
        });
      }
    }
  });

  // One recent sign-in from an unfamiliar device, left unread — the case the
  // feature exists for, sitting where an admin will actually see it.
  const recentMember = staff.find((u) => u.role === 'lawyer' && u.active);
  if (recentMember && admins.length) {
    const label = 'موبايل · Safari · iOS';
    const ip = '197.44.18.203';

    insDevice.run(recentMember.id, 'موبايل|Safari|iOS-new', label, ip, iso(1), iso(1), 1);

    admins.forEach((boss) => {
      insNotif.run(
        boss.id, 'new_device', null,
        `🔐 ${recentMember.display_name} دخل من جهاز جديد: ${label} — ${ip}`,
        'critical', null, iso(1, 21)
      );
    });
  }

  // ---------------------------------------------------------------- expenses
  log('    · expenses');

  const insExpense = db.prepare(
    `INSERT INTO expenses (request_id, amount, reason, category, spent_on, on_client,
                           paid_by, paid_by_id, reimbursed_at, reimbursed_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  );

  const EXPENSE_REASONS = {
    government: ['رسوم استخراج مستخرج رسمي', 'رسوم تقديم الملف', 'رسوم معاينة', 'رسوم تصديق'],
    transport: ['انتقالات للحي', 'انتقالات للشهر العقاري', 'مواصلات للجهة', 'تاكسي للمعاينة'],
    stamps: ['دمغات على العقد', 'طوابع التقديم'],
    printing: ['طباعة الرسومات الهندسية', 'تصوير المستندات', 'طباعة نسخ إضافية'],
    translation: ['ترجمة معتمدة للعقد', 'ترجمة شهادة'],
    courier: ['شحن الأوراق للعميل', 'بريد سريع'],
    other: ['مصاريف نثرية', 'مصروف متنوع'],
  };

  const catKeys = Object.keys(EXPENSE_REASONS);

  db.prepare("SELECT id, created_at, status FROM requests WHERE is_demo = 1 OR 1=1")
    .all()
    .forEach((r) => {
      if (rnd() > 0.45) return;

      const ageDays = Math.max(
        0,
        Math.round((now - new Date(String(r.created_at).replace(' ', 'T') + 'Z').getTime()) / day)
      );
      const count = 1 + Math.floor(rnd() * 3);

      for (let e = 0; e < count; e++) {
        const cat = pick(catKeys, rnd);
        const spentAge = Math.max(0, ageDays - Math.floor(rnd() * Math.max(1, ageDays)));

        // Small out-of-pocket sums, the kind staff actually front.
        const amount = Math.round((80 + rnd() * 1400) / 10) * 10;

        // Older ones have mostly been paid back; recent ones are still owed.
        const reimbursed = spentAge > 45 ? rnd() > 0.15 : rnd() > 0.7;
        const who = pick(lawyers, rnd);

        insExpense.run(
          r.id, amount, pick(EXPENSE_REASONS[cat], rnd), cat, dateOnly(spentAge),
          rnd() > 0.55 ? 1 : 0,
          who.display_name, who.id,
          reimbursed ? iso(Math.max(0, spentAge - 5)) : null,
          reimbursed ? pick(supervisors, rnd).display_name : null,
          iso(spentAge)
        );
      }
    });

  // ---------------------------------------------------------------- totals
  db.prepare(
    `UPDATE requests SET paid_amount =
       (SELECT COALESCE(SUM(amount),0) FROM payments p
         WHERE p.request_id = requests.id AND p.voided_at IS NULL)`
  ).run();

  return { requests: created, clients: clients.length };
}

module.exports = { generate };
