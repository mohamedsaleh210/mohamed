/**
 * Builds the demo scenario: staff accounts at every role, clients, requests
 * with uploaded documents, lawyer assignment, threaded conversations,
 * requirements, todos, payments and notifications.
 *
 * Exposed as a function so it can run two ways — from the command line via
 * `npm run demo`, or automatically on first boot when SEED_DEMO=1. Managed
 * hosts often do not let you run commands at all, and without the second path
 * the demo accounts would exist only on a developer's laptop.
 *
 * Safe to re-run: it clears its own rows first and leaves the service
 * catalogue and settings alone.
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const zlib = require('zlib');
const refLib = require('../lib/ref');

function seedDemo({ quiet = false, writeAccountsFile = true } = {}) {
  const log = quiet ? () => {} : console.log;

  /**
   * Demo accounts ship with documented passwords so the system can be walked
   * through immediately. On a production server that is a set of known
   * credentials, so every demo account is required to replace its password on
   * first sign-in there — the login still works, it just cannot stay as it is.
   *
   * Locally the forced change would only get in the way of testing.
   */
  const FORCE_CHANGE = process.env.NODE_ENV === 'production' ? 1 : 0;
  const { migrate } = require('./migrate');
  migrate({ quiet: true });

  const { db, UPLOAD_DIR, setSetting } = require('./index');
  require('./seed')();

  // ---------------------------------------------------------------- helpers
  const now = new Date();
  const daysAgo = (n) => {
    const d = new Date(now.getTime() - n * 86400000);
    return d.toISOString().slice(0, 19).replace('T', ' ');
  };
  const dateIn = (n) => new Date(now.getTime() + n * 86400000).toISOString().slice(0, 10);

  /**
   * Writes a small placeholder "scan" as a real PNG, built byte by byte so the
   * demo needs no image library and works completely offline.
   */
  function writePng(filename, label, rgb) {
    const W = 480;
    const H = 640;
    const raw = Buffer.alloc((W * 3 + 1) * H);

    let p = 0;
    for (let y = 0; y < H; y++) {
      raw[p++] = 0; // filter byte per scanline
      for (let x = 0; x < W; x++) {
        const border = x < 12 || x > W - 12 || y < 12 || y > H - 12;
        // A few horizontal bands so the thumbnail reads as a document, not a blank square.
        const line = y % 42 > 32 && x > 48 && x < W - 48 && y > 90 && y < H - 120;
        if (border) {
          raw[p++] = rgb[0]; raw[p++] = rgb[1]; raw[p++] = rgb[2];
        } else if (line) {
          raw[p++] = 205; raw[p++] = 210; raw[p++] = 214;
        } else {
          raw[p++] = 250; raw[p++] = 249; raw[p++] = 245;
        }
      }
    }

    const chunk = (type, data) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
      const crcBuf = Buffer.alloc(4);
      crcBuf.writeUInt32BE(crc32(body) >>> 0);
      return Buffer.concat([len, body, crcBuf]);
    };

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(W, 0);
    ihdr.writeUInt32BE(H, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 2;  // colour type: truecolour
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]);

    fs.writeFileSync(path.join(UPLOAD_DIR, filename), png);
    return png.length;
  }

  let crcTable = null;
  function crc32(buf) {
    if (!crcTable) {
      crcTable = [];
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c;
      }
    }
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return c ^ 0xffffffff;
  }

  /** A minimal but genuinely valid one-page PDF. */
  function writePdf(filename, title) {
    const content = `BT /F1 20 Tf 60 720 Td (${title}) Tj ET`;
    const objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];

    let pdf = '%PDF-1.4\n';
    const offsets = [];
    objs.forEach((o, i) => {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach((o) => (pdf += `${String(o).padStart(10, '0')} 00000 n \n`));
    pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

    fs.writeFileSync(path.join(UPLOAD_DIR, filename), pdf, 'latin1');
    return Buffer.byteLength(pdf, 'latin1');
  }

  // ---------------------------------------------------------------- reset
  log('\n  Clearing previous demo data…');

  const realUsernames=['amr.awad','ayman.hussein','abdelrahman.alamir','hend.wagih','rehab.ali','hossam.gerwani','mostafa.hamdy','adel.zaki','hassan.farag','sara.galal','ahmed.gerwani','fatma.yahia','nesma.abdeldayem','zeinab.hany','ezz.mahmoud','abdelwahed.dahy','amira.kamel','omnia.abdelnasser','eman.ezz','mohamed.adel','abeer.atwa','menna.waleed','yasmin.afify','assem.farhat','mohamed.osran','sama.abdelmonem','amr.mostafa','khaled.mostafa','mahmoud.gad','omar.khaled'];
  const demoUsernames = ['nour', 'khaled', 'mona', 'tarek', 'yasmin', 'omar','samia',...realUsernames];
  db.transaction(() => {
    require('./demo-complete').clearCompleteDemo(db);
    // Device alerts are addressed to the permanent administrator and have no
    // request_id, so deleting the demo employee alone cannot cascade them.
    // Remove only alerts whose employee name belongs to this demo set.
    demoUsernames.forEach((username) => {
      const employee = db.prepare('SELECT display_name FROM users WHERE username=?').get(username);
      if (employee && employee.display_name) {
        db.prepare("DELETE FROM notifications WHERE type='new_device' AND text LIKE ?")
          .run(`%${employee.display_name}%دخل من جهاز جديد:%`);
      }
    });
    // Demo requests are identified by their demo client addresses rather than
    // by a reference pattern, now that references are random.
    const demoReq = db
      .prepare(
        `SELECT id FROM requests
         WHERE is_demo=1 OR email LIKE '%@demo.sanad' OR email IN ('hala@example.com','walid@example.com')`
      )
      .all();
    demoReq.forEach((r) => {
      db.prepare('DELETE FROM notifications WHERE request_id = ?').run(r.id);
      db.prepare('DELETE FROM comments WHERE request_id = ?').run(r.id);
      db.prepare('DELETE FROM requirements WHERE request_id = ?').run(r.id);
      db.prepare('DELETE FROM todos WHERE request_id = ?').run(r.id);
      db.prepare('DELETE FROM request_assignees WHERE request_id = ?').run(r.id);
      db.prepare(
        'DELETE FROM document_files WHERE document_id IN (SELECT id FROM documents WHERE request_id = ?)'
      ).run(r.id);
      db.prepare('DELETE FROM documents WHERE request_id = ?').run(r.id);
      db.prepare('DELETE FROM audit_log WHERE entity_type = ? AND entity_id = ?').run('request', r.id);
      db.prepare('DELETE FROM requests WHERE id = ?').run(r.id);
    });
    demoUsernames.forEach((u) => db.prepare('DELETE FROM users WHERE username = ?').run(u));
    db.prepare("DELETE FROM clients WHERE email LIKE '%@demo.sanad' OR email IN ('john.carter@example.com','m.rossi@example.com','a.rashid@example.com','s.laurent@example.com')").run();
    db.prepare("DELETE FROM trash WHERE deleted_by LIKE '%عبد الرحمن%' OR deleted_by = 'Adam'").run();
  })();

  // ---------------------------------------------------------------- staff
  log('  Staff accounts…');

  // Staff need an address on file, otherwise "forgot my password" has nowhere
  // to send the link — which is exactly the kind of gap demo data should expose
  // rather than hide.
  /**
   * Realistic staff records.
   *
   * Generated national numbers and birth dates read as noise, and noise makes a
   * walkthrough feel like a walkthrough. Each person here has a full legal name
   * that matches their national number's birth date, a plausible governorate
   * code, and a phone in a real Egyptian range — so a screen showing an employee
   * file looks like an employee file.
   *
   * National number layout: century · YYMMDD · governorate · serial · check.
   */
  const STAFF_DETAILS = {
    adam: {
      legal: 'آدم محمد عبد الرحمن الشناوي',
      birth: '1984-03-17', nid: '28403171201573', phone: '+201001234567',
      email: 'adam.shennawy@sanad.com.eg',
    },
    nour: {
      legal: 'نور عبد الرحمن حسن فهمي',
      birth: '1989-11-02', nid: '28911022100846', phone: '+201002345678',
      email: 'nour.fahmy@sanad.com.eg',
    },
    tarek: {
      legal: 'طارق سمير الديب رشدي',
      birth: '1982-06-25', nid: '28206251302491', phone: '+201003456789',
      email: 'tarek.eldeeb@sanad.com.eg',
    },
    khaled: {
      legal: 'خالد سمير حسن عبد العزيز',
      birth: '1991-09-08', nid: '29109081100237', phone: '+201004567890',
      email: 'khaled.abdelaziz@sanad.com.eg',
    },
    mona: {
      legal: 'منى فتحي إبراهيم المنشاوي',
      birth: '1993-01-30', nid: '29301302101654', phone: '+201005678901',
      email: 'mona.elmenshawy@sanad.com.eg',
    },
    yasmin: {
      legal: 'ياسمين عادل زكي الغريب',
      birth: '1990-07-14', nid: '29007141200938', phone: '+201006789012',
      email: 'yasmin.elghareb@sanad.com.eg',
    },
    omar: {
      legal: 'عمر وليد قنديل سليمان',
      birth: '1995-12-03', nid: '29512032100785', phone: '+201007890123',
      email: 'omar.kandil@sanad.com.eg',
    },
    samia: {
      legal: 'سامية رأفت بدوي الأنصاري',
      birth: '1986-04-21', nid: '28604211301462', phone: '+201008901234',
      email: 'samia.ansary@sanad.com.eg',
    },
  };

  const mkUser = (username, name, role, pass) => {
    const info = db
      .prepare(
        `INSERT INTO users (username, password_hash, role, display_name, email, active,
                            must_change_password, created_by)
         VALUES (?,?,?,?,?,1,?,?)`
      )
      .run(
        username, bcrypt.hashSync(pass, 10), role, name, `${username}@demo.sanad`,
        FORCE_CHANGE, 'Adam'
      );

    const id = Number(info.lastInsertRowid);
    const d = STAFF_DETAILS[username];

    // Complete profiles, otherwise every demo login lands on the "finish your
    // profile" gate instead of the panel.
    db.prepare(
      `UPDATE users SET phone = ?, national_id = ?, birth_date = ?, legal_name = ?,
                        email = ?, profile_completed = 1
       WHERE id = ?`
    ).run(
      d ? d.phone : '+2010' + String(10000000 + id * 137).slice(0, 8),
      d ? d.nid : String(28000000000000 + id * 971).slice(0, 14),
      d ? d.birth : `19${80 + (id % 15)}-0${1 + (id % 9)}-1${id % 10}`,
      d ? d.legal : `${name} حسن`,
      d ? d.email : `${username}@sanad.com.eg`,
      id
    );
    return id;
  };

  const supervisorId = mkUser('nour', 'نور عبد الرحمن', 'supervisor', 'demo1234');
  const supervisor2Id = mkUser('tarek', 'طارق الديب', 'supervisor', 'demo1234');
  const lawyer1Id = mkUser('khaled', 'خالد سمير', 'lawyer', 'demo1234');
  const lawyer2Id = mkUser('mona', 'منى فتحي', 'lawyer', 'demo1234');
  // An accountant, so the read-only money role is visible in the demo.
  mkUser('samia', 'سامية رأفت', 'accountant', 'demo1234');
  const lawyer3Id = mkUser('yasmin', 'ياسمين رأفت', 'lawyer', 'demo1234');

  // An account the admin just created — still on its temporary password, so the
  // forced-change screen can be seen without setting it up by hand.
  const freshId = mkUser('omar', 'عمر الشناوي', 'lawyer', 'demo1234');
  db.prepare('UPDATE users SET must_change_password = 1 WHERE id = ?').run(freshId);

  // Current office staff. Every account starts with one temporary password,
  // then the employee must replace it and complete the official profile and
  // upload their photo and ID before any work screen opens.
  const CURRENT_STAFF=[
    ['amr.awad','عمرو احمد عوض','supervisor','محامي نقض — مدير المكتب'],
    ['ayman.hussein','ايمن حسين محمد','lawyer','محامي بالنقض'],
    ['abdelrahman.alamir','عبدالرحمن الشافعي الامير','lawyer','محامي'],
    ['hend.wagih','هند محمد وجيه','lawyer','محامي بالنقض'],
    ['rehab.ali','رحاب علي السيد مصطفى','lawyer','بوفيه'],
    ['hossam.gerwani','حسام عبدالحميد محمد الجرواني','supervisor','محامي — مدير القسم الإداري'],
    ['mostafa.hamdy','مصطفى حمدي ابو العلا شلبي','lawyer','محامي'],
    ['adel.zaki','عادل مصطفى زكي مصطفى','lawyer','محامي'],
    ['hassan.farag','حسن فرج يوسف حسن','lawyer','محامي'],
    ['sara.galal','سارة محمد جلال متولي','lawyer','محامي'],
    ['ahmed.gerwani','احمد سلامة محمد الجرواني','lawyer','محامي'],
    ['fatma.yahia','فاطمة يحي امين','lawyer','محامي'],
    ['nesma.abdeldayem','نسمة محمد عبدالدايم','lawyer','محامي'],
    ['zeinab.hany','زينب هاني محمد عبدالفتاح','lawyer','سكرتيرة'],
    ['ezz.mahmoud','عز الدين محمود','accountant','محاسب'],
    ['abdelwahed.dahy','عبدالواحد ضاحي هلالي','lawyer','محامي'],
    ['amira.kamel','اميرة كامل عبدالمنعم','lawyer','محامية'],
    ['omnia.abdelnasser','امنية عبدالناصر','lawyer','محامية'],
    ['eman.ezz','ايمان حسين عز الدين','lawyer','محامية'],
    ['mohamed.adel','محمد عادل مصطفى عبدالباقي','lawyer','محامي'],
    ['abeer.atwa','عبير عاطوه رجائي','lawyer','محامية'],
    ['menna.waleed','منة الله وليد شوقي','lawyer','محامية'],
    ['yasmin.afify','ياسمين عبدالمؤمن عفيفي','lawyer','محامية'],
    ['assem.farhat','عاصم محمد فرحات','lawyer','محامي'],
    ['mohamed.osran','محمد عسران','lawyer','موظف'],
    ['sama.abdelmonem','سما محمد عبدالمنعم','lawyer','محامي'],
    ['amr.mostafa','عمرو مصطفى محمد احمد','lawyer','محامي'],
    ['khaled.mostafa','خالد مصطفى حسن','lawyer','محامي'],
    ['mahmoud.gad','محمود احمد جاد الرب','lawyer','محامي'],
    ['omar.khaled','عمر خالد','lawyer','محامي']
  ];
  // Keep the walkthrough accounts above separate from the imported office
  // staff.  Reusing their ids used to rename nour/khaled/mona/... and made the
  // documented demo logins disappear before the server even started.
  db.transaction(()=>{
    CURRENT_STAFF.forEach((s)=>{
      let row=db.prepare('SELECT id FROM users WHERE username=?').get(s[0]);
      let id=row&&row.id;
      if(!id){id=Number(db.prepare(`INSERT INTO users(username,password_hash,role,display_name,legal_name,job_title,active,must_change_password,profile_completed,created_by) VALUES(?,?,?,?,?,?,1,1,0,'Adam')`).run(s[0],bcrypt.hashSync('Sanad@2026',10),s[2],s[1],s[1],s[3]).lastInsertRowid)}
      db.prepare(`UPDATE users SET username=?,password_hash=?,role=?,display_name=?,legal_name=?,job_title=?,email=NULL,phone=NULL,national_id=NULL,birth_date=NULL,photo=NULL,id_front=NULL,id_back=NULL,active=1,must_change_password=1,profile_completed=0,deactivated_at=NULL WHERE id=?`).run(s[0],bcrypt.hashSync('Sanad@2026',10),s[2],s[1],s[1],s[3],id);
    });
    // Preserve one disabled account in the walkthrough so suspension and
    // historical ownership can be tested without disabling the other demos.
    db.prepare("UPDATE users SET active=0 WHERE username='yasmin'").run();
  })();

  // The current staff list intentionally has no fabricated deactivated employee.
  const admin = db.prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();

  // On a real install the seeded admin must change its password before doing
  // anything. In the demo that would block the documented adam/1234 login, so
  // it is cleared here — omar still demonstrates the forced-change screen.
  if (admin) {
    db.prepare('UPDATE users SET must_change_password = ? WHERE id = ?').run(FORCE_CHANGE, admin.id);
    // Without an address on file the admin has no way back in after forgetting
    // the password — the one account that can least afford to be locked out.
    if (true) {
      db.prepare(
        `UPDATE users SET email = ?, phone = ?, national_id = ?, birth_date = ?,
                          legal_name = ?, profile_completed = 1
         WHERE id = ?`
      ).run(
        STAFF_DETAILS.adam.email, STAFF_DETAILS.adam.phone, STAFF_DETAILS.adam.nid,
        STAFF_DETAILS.adam.birth, STAFF_DETAILS.adam.legal, admin.id
      );
    }
  }

  // ---------------------------------------------------------------- client
  log('  Client accounts…');

  // No language is stored: the office replies in whatever language the client
  // wrote in, so a saved preference would only be a second thing to keep true.
  const mkClient = (email, name, phone, relation, beneficiary, verified, _lang, at) =>
    Number(
      db
        .prepare(
          `INSERT INTO clients (email, password_hash, full_name, phone, relation, beneficiary_name,
                                email_verified, created_at)
           VALUES (?,?,?,?,?,?,?,?)`
        )
        .run(email, bcrypt.hashSync('demo1234', 10), name, phone, relation, beneficiary,
             verified, at).lastInsertRowid
    );

  const clientId = mkClient('client@demo.sanad', 'أحمد محمود السيد', '+201001234567',
    'guardian', 'ياسين أحمد محمود', 1, 'ar', daysAgo(40));

  // A company representative with several parallel requests.
  const clientCoId = mkClient('sara@demo.sanad', 'سارة إبراهيم منصور', '+201119876543',
    'agent', 'شركة النيل للتطوير العقاري', 1, 'ar', daysAgo(33));

  // An English-speaking client, to check the site's second language end to end.
  const clientEnId = mkClient('john@demo.sanad', 'John Michael Carter', '+447700900123',
    'self', null, 1, 'en', daysAgo(25));

  // Registered but never confirmed — shows the pending-verification state.
  const clientNewId = mkClient('mostafa@demo.sanad', 'مصطفى كمال الدين', '+201227778899',
    'self', null, 0, 'ar', daysAgo(2));

  // ---------------------------------------------------------------- requests
  log('  Requests…');

  const svc = (needle) =>
    db.prepare('SELECT * FROM services WHERE title_ar LIKE ? LIMIT 1').get(`%${needle}%`);

  // Demo references use the same generator as real ones, so what you see in
  // testing is exactly what a client will be reading over the phone.
  const takenRefs = new Set();
  const nextRef = () =>
    refLib.generate((c) => takenRefs.has(c) || !!db.prepare('SELECT 1 FROM requests WHERE ref = ?').get(c));

  function makeRequest(o) {
    const service = o.service || null;
    const ref = nextRef();
    takenRefs.add(ref);
    const info = db
      .prepare(
        `INSERT INTO requests (ref, name, phone, email, client_id, service_id, service_label, message,
                               status, relation, beneficiary_name, total_amount, paid_amount,
                               deadline, archived_at, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        ref, o.name, o.phone, o.email, o.clientId || null,
        service ? service.id : null,
        service ? `${service.title_ar} / ${service.title_en}` : null,
        o.message, o.status, o.relation || 'self', o.beneficiary || null,
        o.total || 0, o.paid || 0, o.deadline || null, o.archived || null, o.createdAt
      );
    return Number(info.lastInsertRowid);
  }

  // A spread across every status, so each filter and colour in the admin has
  // something behind it.
  const r1 = makeRequest({
    ref: 'SND-9001', name: 'أحمد محمود السيد', phone: '+201001234567',
    email: 'client@demo.sanad', clientId, service: svc('تراخيص البناء'),
    message:
      'عندي قطعة أرض ٣٥٠ متر في الشيخ زايد وعايز أستخرج ترخيص بناء لفيلا دورين.\nالرسم الهندسي جاهز من المكتب الاستشاري، ومحتاج حد يتابع الإجراءات في الحي.',
    status: 'in_progress', relation: 'self',
    total: 45000, paid: 20000, deadline: dateIn(9), createdAt: daysAgo(21),
  });

  const r2 = makeRequest({
    ref: 'SND-9002', name: 'أحمد محمود السيد', phone: '+201001234567',
    email: 'client@demo.sanad', clientId, service: svc('توصيل الكهرباء'),
    message: 'محتاج أوصّل كهرباء وأركّب عداد للفيلا بعد ما البناء يخلص.',
    status: 'awaiting_docs', relation: 'self',
    total: 12000, paid: 0, deadline: dateIn(0), createdAt: daysAgo(6),
  });

  const r3 = makeRequest({
    ref: 'SND-9003', name: 'سارة إبراهيم منصور', phone: '+201119876543',
    email: 'sara@demo.sanad', clientId: clientCoId, service: svc('عقود المقاولات'),
    message:
      'شركتنا داخلة في مشروع تشطيب ٤٠ وحدة في مدينة نصر.\nمحتاجين عقد مقاولات محكم يغطي التأخير والغرامات ونطاق الأعمال بالتفصيل.',
    status: 'reviewing', relation: 'agent', beneficiary: 'شركة النيل للتطوير العقاري',
    total: 60000, paid: 60000, deadline: dateIn(4), createdAt: daysAgo(11),
  });

  const r4 = makeRequest({
    ref: 'SND-9004', name: 'سارة إبراهيم منصور', phone: '+201119876543',
    email: 'sara@demo.sanad', clientId: clientCoId, service: svc('زيادة القدرة'),
    message: 'محتاجين نزوّد القدرة الكهربائية للمقر الإداري من ٦٠ لـ ١٥٠ كيلو وات.',
    status: 'awaiting_payment', relation: 'agent', beneficiary: 'شركة النيل للتطوير العقاري',
    total: 18000, paid: 5000, deadline: dateIn(14), createdAt: daysAgo(8),
  });

  // Overdue on purpose — the dashboard should be shouting about this one.
  const r5 = makeRequest({
    ref: 'SND-9005', name: 'سارة إبراهيم منصور', phone: '+201119876543',
    email: 'sara@demo.sanad', clientId: clientCoId, service: svc('تصحيح أوضاع'),
    message: 'مبنى إداري قديم في وسط البلد محتاج توفيق أوضاع قبل ما نأجّره.',
    status: 'in_progress', relation: 'agent', beneficiary: 'شركة النيل للتطوير العقاري',
    total: 85000, paid: 40000, deadline: dateIn(-5), createdAt: daysAgo(45),
  });

  const r6 = makeRequest({
    ref: 'SND-9006', name: 'John Michael Carter', phone: '+447700900123',
    email: 'john@demo.sanad', clientId: clientEnId, service: svc('عقود الإيجار'),
    message:
      'I am leasing an apartment in Maadi for two years and want the contract reviewed before I sign.\nPlease check the renewal and exit clauses carefully.',
    status: 'completed', relation: 'self',
    total: 9000, paid: 9000, deadline: dateIn(-12), createdAt: daysAgo(38),
  });

  const r7 = makeRequest({
    ref: 'SND-9007', name: 'John Michael Carter', phone: '+447700900123',
    email: 'john@demo.sanad', clientId: clientEnId, service: svc('الفحص القانوني'),
    message: 'Considering buying a property in New Cairo. I need full due diligence before paying anything.',
    status: 'new', relation: 'self',
    total: 0, paid: 0, createdAt: daysAgo(1),
  });

  // Cancelled, so a rejected/dropped case is visible in the list.
  const r8 = makeRequest({
    ref: 'SND-9008', name: 'مصطفى كمال الدين', phone: '+201227778899',
    email: 'mostafa@demo.sanad', clientId: clientNewId, service: svc('تغيير استخدام'),
    message: 'عايز أحوّل شقة سكنية لعيادة في المهندسين.',
    status: 'cancelled', relation: 'self',
    total: 15000, paid: 0, createdAt: daysAgo(16),
  });

  // Archived, so the archive tab is not empty.
  const r9 = makeRequest({
    ref: 'SND-9009', name: 'هالة سعد الطنطاوي', phone: '+201005556677',
    email: 'hala@example.com', clientId: null, service: svc('توصيل المياه'),
    message: 'توصيل مياه وصرف صحي لمحل تجاري في فيصل.',
    status: 'completed', relation: 'self',
    total: 7500, paid: 7500, deadline: dateIn(-30), archived: daysAgo(14), createdAt: daysAgo(60),
  });

  // A guest request with no account at all — the "register later to track" case.
  const r10 = makeRequest({
    ref: 'SND-9010', name: 'وليد عصام الغريب', phone: '+201558889900',
    email: 'walid@example.com', clientId: null, service: svc('مذكرات التفاهم'),
    message: 'محتاج NDA بين شركتين قبل ما نبدأ مفاوضات شراكة.',
    status: 'new', relation: 'self',
    total: 0, paid: 0, createdAt: daysAgo(0),
  });

  // ---------------------------------------------------------------- documents
  log('  Uploaded documents…');

  function addDocument(requestId, name, kind, files, uploader, createdAt) {
    const docId = Number(
      db
        .prepare(
          'INSERT INTO documents (request_id, name, kind, uploaded_by, source, created_at) VALUES (?,?,?,?,?,?)'
        )
        .run(requestId, name, kind, uploader, 'client', createdAt).lastInsertRowid
    );

    files.forEach((f, i) => {
      const stored = `demo-${docId}-${i + 1}${f.ext}`;
      const size = f.ext === '.pdf' ? writePdf(stored, f.title) : writePng(stored, f.title, f.rgb);

      db.prepare(
        `INSERT INTO document_files (document_id, stored_name, original_name, mime, size, page_no, side, created_at)
         VALUES (?,?,?,?,?,?,?,?)`
      ).run(docId, stored, f.original, f.ext === '.pdf' ? 'application/pdf' : 'image/png',
            size, f.page || 1, f.side || 'front', createdAt);
    });
    return docId;
  }

  const BLUE = [47, 123, 191];
  const GREEN = [58, 157, 107];
  const PURPLE = [138, 99, 201];
  const BRASS = [201, 162, 75];

  addDocument(r1, 'بطاقة الرقم القومي', 'images', [
    { ext: '.png', original: 'IMG_2041.png', title: 'National ID front', side: 'front', rgb: BLUE },
    { ext: '.png', original: 'IMG_2042.png', title: 'National ID back', side: 'back', rgb: BLUE },
  ], 'أحمد محمود السيد', daysAgo(21));

  addDocument(r1, 'عقد ملكية الأرض', 'images', [
    { ext: '.png', original: 'IMG_2043.png', title: 'Deed page 1', side: 'front', page: 1, rgb: GREEN },
    { ext: '.png', original: 'IMG_2044.png', title: 'Stamps on back', side: 'back', page: 1, rgb: GREEN },
    { ext: '.png', original: 'IMG_2045.png', title: 'Deed page 2', side: 'front', page: 2, rgb: GREEN },
  ], 'أحمد محمود السيد', daysAgo(21));

  addDocument(r1, 'الرسم الهندسي المعتمد', 'pdf', [
    { ext: '.pdf', original: 'architectural-drawings.pdf', title: 'Architectural Drawings' },
  ], 'أحمد محمود السيد', daysAgo(20));

  addDocument(r3, 'كراسة الشروط والمواصفات', 'pdf', [
    { ext: '.pdf', original: 'specs-booklet.pdf', title: 'Specifications Booklet' },
  ], 'سارة إبراهيم منصور', daysAgo(11));

  addDocument(r3, 'السجل التجاري والبطاقة الضريبية', 'images', [
    { ext: '.png', original: 'commercial-register.png', title: 'Commercial Register', side: 'front', rgb: BRASS },
    { ext: '.png', original: 'tax-card.png', title: 'Tax Card', side: 'front', page: 2, rgb: BRASS },
  ], 'سارة إبراهيم منصور', daysAgo(11));

  addDocument(r5, 'محضر معاينة المبنى', 'pdf', [
    { ext: '.pdf', original: 'inspection-report.pdf', title: 'Building Inspection Report' },
  ], 'سارة إبراهيم منصور', daysAgo(44));

  addDocument(r6, 'Draft lease agreement', 'pdf', [
    { ext: '.pdf', original: 'lease-draft.pdf', title: 'Draft Lease Agreement' },
  ], 'John Michael Carter', daysAgo(38));

  addDocument(r6, 'Passport copy', 'images', [
    { ext: '.png', original: 'passport.png', title: 'Passport', side: 'front', rgb: PURPLE },
  ], 'John Michael Carter', daysAgo(38));

  addDocument(r2, 'إيصال الكهرباء القديم', 'images', [
    { ext: '.png', original: 'old-bill.png', title: 'Old electricity bill', side: 'front', rgb: BLUE },
  ], 'أحمد محمود السيد', daysAgo(6));

  // ---------------------------------------------------------------- assignment
  log('  Lawyer assignments…');

  const assign = (requestId, userId, by, at) =>
    db
      .prepare(
        'INSERT INTO request_assignees (request_id, user_id, assigned_by, created_at) VALUES (?,?,?,?)'
      )
      .run(requestId, userId, by, at);

  assign(r1, lawyer1Id, 'نور عبد الرحمن', daysAgo(20));
  assign(r1, lawyer2Id, 'خالد سمير', daysAgo(15)); // a lawyer pulling in a colleague
  assign(r2, lawyer1Id, 'نور عبد الرحمن', daysAgo(5));
  assign(r3, lawyer2Id, 'طارق الديب', daysAgo(10));
  assign(r4, lawyer1Id, 'طارق الديب', daysAgo(7));
  assign(r5, lawyer2Id, 'نور عبد الرحمن', daysAgo(44));
  assign(r5, lawyer1Id, 'منى فتحي', daysAgo(30));
  assign(r6, lawyer2Id, 'نور عبد الرحمن', daysAgo(37));
  assign(r8, lawyer1Id, 'طارق الديب', daysAgo(15));
  assign(r9, lawyer1Id, 'نور عبد الرحمن', daysAgo(58));
  // r7 and r10 stay unassigned on purpose — brand-new requests nobody picked up.

  // ---------------------------------------------------------------- comments
  log('  Comment threads…');

  function comment(requestId, parentId, userId, label, role, body, at) {
    return Number(
      db
        .prepare(
          `INSERT INTO comments (request_id, parent_id, author_id, author_label, author_role, body, created_at)
           VALUES (?,?,?,?,?,?,?)`
        )
        .run(requestId, parentId, userId, label, role, body, at).lastInsertRowid
    );
  }

  // --- SND-9001: the long, healthy thread ---
  const a1 = comment(r1, null, supervisorId, 'نور عبد الرحمن', 'supervisor',
    'راجعت أوراق العميل. الملكية سليمة والرسم الهندسي معتمد من نقابة المهندسين.\nخالد، ابدأ في تقديم الملف للحي.', daysAgo(20));
  comment(r1, a1, lawyer1Id, 'خالد سمير', 'lawyer',
    'تمام. قدّمت الملف النهاردة ورقم الوارد 4471. المعاينة متوقعة خلال أسبوعين.', daysAgo(19));
  comment(r1, a1, lawyer2Id, 'منى فتحي', 'lawyer',
    '@خالد سمير خد بالك إن الحي ده بيطلب موافقة الحماية المدنية للفيلات فوق دورين. الفيلا دورين بالظبط فيمكن تعدي، بس الأحسن نجهّزها.', daysAgo(15));
  comment(r1, a1, lawyer1Id, 'خالد سمير', 'lawyer',
    '@منى فتحي كلمت المهندس المسؤول وقال مش مطلوبة في الحالة دي. سجّلت ده في المحضر تحسباً.', daysAgo(14));

  const a2 = comment(r1, null, lawyer1Id, 'خالد سمير', 'lawyer',
    'ضفت منى على الطلب — عندها خبرة في اشتراطات الشيخ زايد أكتر مني.', daysAgo(15));
  comment(r1, a2, admin ? admin.id : null, admin ? admin.display_name : 'Adam', 'admin',
    'كويس. خلّوا بالكم إن العميل مستعجل لأن التمويل البنكي مربوط بتاريخ الترخيص.', daysAgo(14));

  const a3 = comment(r1, null, lawyer2Id, 'منى فتحي', 'lawyer',
    'المعاينة اتعملت النهاردة. المهندس طلب تعديل بسيط في ارتدادات الجراج قبل الاعتماد.', daysAgo(6));
  comment(r1, a3, supervisorId, 'نور عبد الرحمن', 'supervisor',
    '@منى فتحي كلمي المكتب الاستشاري يعدّل الرسم ويبعتهولنا. وأنا هبلّغ العميل بالتأخير.', daysAgo(6));
  comment(r1, a3, lawyer2Id, 'منى فتحي', 'lawyer',
    'تم. المكتب قال يومين شغل. مدّيت الموعد النهائي أسبوع.', daysAgo(5));

  const gone1 = comment(r1, null, supervisorId, 'نور عبد الرحمن', 'supervisor',
    'تعليق اتكتب على الطلب الغلط.', daysAgo(18));
  db.prepare("UPDATE comments SET deleted_at = ?, deleted_by = ? WHERE id = ?")
    .run(daysAgo(18), 'نور عبد الرحمن', gone1);

  // --- SND-9005: the overdue one, with visible friction ---
  const b1 = comment(r5, null, supervisorId, 'نور عبد الرحمن', 'supervisor',
    'الملف ده واقف من ٣ أسابيع. الحي رافض الطلب مرتين بسبب نقص في محضر المعاينة.', daysAgo(12));
  comment(r5, b1, lawyer2Id, 'منى فتحي', 'lawyer',
    'الرفض التاني كان بسبب إن المهندس كتب مساحة مختلفة عن اللي في العقد. طلبنا تصحيح المحضر.', daysAgo(11));
  comment(r5, b1, lawyer1Id, 'خالد سمير', 'lawyer',
    '@منى فتحي أنا دخلت على الملف. هروح الحي بنفسي بكرة وأقعد مع رئيس القسم.', daysAgo(9));
  comment(r5, b1, supervisorId, 'نور عبد الرحمن', 'supervisor',
    'الموعد اللي اتقال للعميل عدّى. لازم حد يكلّم سارة النهاردة ويشرح لها الموقف قبل ما تتصل هي.', daysAgo(4));

  comment(r5, null, supervisor2Id, 'طارق الديب', 'supervisor',
    'كلمت سارة وشرحت لها. متفهمة بس عايزة موعد جديد مكتوب. حددنا أسبوعين من النهاردة.', daysAgo(3));

  // --- SND-9003 ---
  const c1 = comment(r3, null, supervisor2Id, 'طارق الديب', 'supervisor',
    'العقد ده كبير — ٤٠ وحدة. منى، ركّزي على بند الغرامات وبند التسليم على مراحل.', daysAgo(10));
  comment(r3, c1, lawyer2Id, 'منى فتحي', 'lawyer',
    'خلصت المسودة الأولى. حطيت غرامة تأخير ٠.٥% أسبوعياً بحد أقصى ١٠% من قيمة العقد.', daysAgo(6));
  comment(r3, c1, supervisor2Id, 'طارق الديب', 'supervisor',
    '@منى فتحي الحد الأقصى ١٠% قليّل لمشروع بالحجم ده. خليه ١٥% ونتفاوض عليه.', daysAgo(5));

  // --- SND-9008: the cancelled one, with the reason on record ---
  const d1 = comment(r8, null, lawyer1Id, 'خالد سمير', 'lawyer',
    'راجعت الموقع. الشقة في عقار سكني خالص ومفيش فيه أي وحدة إدارية أو طبية.', daysAgo(14));
  comment(r8, d1, supervisor2Id, 'طارق الديب', 'supervisor',
    'يعني تغيير الاستخدام هيحتاج موافقة كل ملاك العقار + الحي، والاحتمال ضعيف جداً.', daysAgo(13));
  comment(r8, d1, lawyer1Id, 'خالد سمير', 'lawyer',
    'كلمت العميل وشرحت له. قرر يلغي الطلب ويدوّر على مكان بترخيص إداري جاهز. مرجعناش أي مبلغ لأنه مدفعش.', daysAgo(12));

  // --- SND-9006: completed cleanly ---
  const e1 = comment(r6, null, lawyer2Id, 'منى فتحي', 'lawyer',
    'راجعت العقد. فيه بندين خطرين: التجديد التلقائي بزيادة ١٥%، وغرامة خروج مبكر ٣ شهور.', daysAgo(35));
  comment(r6, e1, supervisorId, 'نور عبد الرحمن', 'supervisor',
    '@منى فتحي اكتبي للعميل التعديلات المقترحة بالإنجليزي وابعتيهاله.', daysAgo(35));
  comment(r6, e1, lawyer2Id, 'منى فتحي', 'lawyer',
    'المالك وافق على تخفيض التجديد لـ ٧% وإلغاء غرامة الخروج. العميل وقّع والملف اتقفل.', daysAgo(30));

  comment(r2, null, supervisorId, 'نور عبد الرحمن', 'supervisor',
    'مستنيين شهادة إتمام البناء من العميل. من غيرها شركة الكهرباء مش هتقبل الطلب أصلاً.', daysAgo(4));

  comment(r4, null, supervisor2Id, 'طارق الديب', 'supervisor',
    'الدراسة الفنية خلصت والتكلفة اتحددت. مستنيين باقي الدفعة قبل ما نقدّم.', daysAgo(3));

  // ---------------------------------------------------------------- requirements
  log('  Client requirements…');

  const requirement = (requestId, title, by, at, receivedBy, receivedAt) =>
    db
      .prepare(
        `INSERT INTO requirements (request_id, title, status, created_by, created_at, received_at, received_by)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(requestId, title, receivedBy ? 'received' : 'pending', by, at, receivedAt || null,
           receivedBy || null);

  requirement(r1, 'صورة بطاقة الرقم القومي (وجه وظهر)', 'نور عبد الرحمن', daysAgo(21), 'نور عبد الرحمن', daysAgo(21));
  requirement(r1, 'عقد ملكية الأرض مسجّل', 'نور عبد الرحمن', daysAgo(21), 'خالد سمير', daysAgo(20));
  requirement(r1, 'الرسم الهندسي معتمد من النقابة', 'خالد سمير', daysAgo(20), 'خالد سمير', daysAgo(20));
  requirement(r1, 'الرسم المعدّل بعد ملاحظة ارتدادات الجراج', 'منى فتحي', daysAgo(6));

  requirement(r2, 'شهادة إتمام البناء', 'نور عبد الرحمن', daysAgo(5));
  requirement(r2, 'إيصال كهرباء قديم لعقار مجاور', 'نور عبد الرحمن', daysAgo(6), 'نور عبد الرحمن', daysAgo(6));
  requirement(r2, 'صورة عقد الملكية', 'خالد سمير', daysAgo(4));

  requirement(r3, 'السجل التجاري والبطاقة الضريبية', 'طارق الديب', daysAgo(11), 'طارق الديب', daysAgo(11));
  requirement(r3, 'كراسة الشروط والمواصفات', 'طارق الديب', daysAgo(11), 'منى فتحي', daysAgo(10));
  requirement(r3, 'خطاب تفويض بالتوقيع عن الشركة', 'منى فتحي', daysAgo(5));

  requirement(r5, 'محضر معاينة مصحّح بالمساحة الصحيحة', 'منى فتحي', daysAgo(11));
  requirement(r5, 'إقرار من الملاك بعدم الاعتراض', 'خالد سمير', daysAgo(9));

  requirement(r6, 'Draft lease agreement', 'نور عبد الرحمن', daysAgo(38), 'منى فتحي', daysAgo(37));
  requirement(r6, 'Passport copy', 'نور عبد الرحمن', daysAgo(38), 'منى فتحي', daysAgo(37));

  // ---------------------------------------------------------------- todos
  log('  Checklists…');

  const todo = (requestId, title, sort, by, doneBy, at, fromTemplate = 1) =>
    db
      .prepare(
        `INSERT INTO todos (request_id, title, done, sort, created_by, done_by, done_at, created_at, from_template)
         VALUES (?,?,?,?,?,?,?,?,?)`
      )
      .run(requestId, title, doneBy ? 1 : 0, sort, by, doneBy || null, doneBy ? at : null, at,
           fromTemplate);

  // r1: mostly done, generated from the template then extended by hand.
  todo(r1, 'استلام ومراجعة أوراق العميل', 1, 'نور عبد الرحمن', 'نور عبد الرحمن', daysAgo(20));
  todo(r1, 'مراجعة الرسم الهندسي واعتماد النقابة', 2, 'نور عبد الرحمن', 'خالد سمير', daysAgo(19));
  todo(r1, 'تقديم الملف للحي وأخذ رقم الوارد', 3, 'نور عبد الرحمن', 'خالد سمير', daysAgo(19));
  todo(r1, 'متابعة المعاينة الهندسية', 4, 'نور عبد الرحمن', 'منى فتحي', daysAgo(6));
  todo(r1, 'تعديل ارتدادات الجراج في الرسم', 5, 'منى فتحي', null, daysAgo(6), 0);
  todo(r1, 'سداد الرسوم واستلام إيصال', 6, 'نور عبد الرحمن', null, daysAgo(20));
  todo(r1, 'استلام الترخيص وتسليمه للعميل', 7, 'نور عبد الرحمن', null, daysAgo(20));

  todo(r2, 'استلام شهادة إتمام البناء وعقد الملكية', 1, 'نور عبد الرحمن', null, daysAgo(5));
  todo(r2, 'تقديم طلب التوصيل لشركة الكهرباء', 2, 'نور عبد الرحمن', null, daysAgo(5));
  todo(r2, 'متابعة المعاينة الفنية', 3, 'نور عبد الرحمن', null, daysAgo(5));

  todo(r3, 'اجتماع تحديد نطاق الأعمال مع العميل', 1, 'طارق الديب', 'طارق الديب', daysAgo(10));
  todo(r3, 'إعداد المسودة الأولى', 2, 'طارق الديب', 'منى فتحي', daysAgo(6));
  todo(r3, 'مراجعة داخلية للبنود المالية والغرامات', 3, 'طارق الديب', null, daysAgo(10));
  todo(r3, 'إرسال المسودة للطرف الآخر', 4, 'طارق الديب', null, daysAgo(10));
  todo(r3, 'دمج التعديلات وإصدار النسخة النهائية', 5, 'طارق الديب', null, daysAgo(10));
  todo(r3, 'حضور التوقيع وتسليم النسخ', 6, 'طارق الديب', null, daysAgo(10));

  todo(r5, 'فحص الموقف القانوني والترخيصي للمبنى', 1, 'نور عبد الرحمن', 'منى فتحي', daysAgo(42));
  todo(r5, 'حصر المخالفات وتقدير الرسوم', 2, 'نور عبد الرحمن', 'منى فتحي', daysAgo(38));
  todo(r5, 'إعداد ملف التصالح', 3, 'نور عبد الرحمن', 'منى فتحي', daysAgo(30));
  todo(r5, 'تصحيح محضر المعاينة بعد الرفض', 4, 'منى فتحي', null, daysAgo(11), 0);
  todo(r5, 'تقديم الملف ومتابعة اللجنة', 5, 'نور عبد الرحمن', null, daysAgo(44));
  todo(r5, 'سداد رسوم التصالح', 6, 'نور عبد الرحمن', null, daysAgo(44));
  todo(r5, 'استلام قرار توفيق الأوضاع', 7, 'نور عبد الرحمن', null, daysAgo(44));

  // r6 is finished — every step ticked.
  todo(r6, 'مراجعة بنود العقد', 1, 'نور عبد الرحمن', 'منى فتحي', daysAgo(35), 0);
  todo(r6, 'إعداد التعديلات المقترحة بالإنجليزي', 2, 'نور عبد الرحمن', 'منى فتحي', daysAgo(34), 0);
  todo(r6, 'التفاوض مع المالك', 3, 'منى فتحي', 'منى فتحي', daysAgo(31), 0);
  todo(r6, 'حضور التوقيع', 4, 'منى فتحي', 'منى فتحي', daysAgo(30), 0);

  todo(r4, 'إعداد الدراسة الفنية للحمل الكهربائي', 1, 'طارق الديب', 'خالد سمير', daysAgo(5), 0);
  todo(r4, 'تحديد التكلفة وإبلاغ العميل', 2, 'طارق الديب', 'طارق الديب', daysAgo(3), 0);
  todo(r4, 'تقديم الطلب بعد سداد باقي الأتعاب', 3, 'طارق الديب', null, daysAgo(3), 0);

  const adminId0 = admin ? admin.id : null;

  // ---------------------------------------------------------------- fee items
  log('  Fee lines…');

  const fee = (requestId, label, amount, sort, by) =>
    db
      .prepare('INSERT INTO fee_items (request_id, label, amount, sort, created_by) VALUES (?,?,?,?,?)')
      .run(requestId, label, amount, sort, by);

  fee(r1, 'أتعاب متابعة ترخيص البناء', 30000, 1, 'نور عبد الرحمن');
  fee(r1, 'رسوم الحي والمعاينة', 12000, 2, 'نور عبد الرحمن');
  fee(r1, 'مصاريف تصوير ومستندات', 3000, 3, 'خالد سمير');

  fee(r2, 'أتعاب توصيل الكهرباء', 8000, 1, 'نور عبد الرحمن');
  fee(r2, 'رسوم شركة الكهرباء', 4000, 2, 'نور عبد الرحمن');

  fee(r3, 'صياغة عقد المقاولات', 50000, 1, 'طارق الديب');
  fee(r3, 'مراجعة قانونية إضافية', 10000, 2, 'طارق الديب');

  fee(r4, 'أتعاب زيادة القدرة', 12000, 1, 'طارق الديب');
  fee(r4, 'الدراسة الفنية', 6000, 2, 'طارق الديب');

  fee(r5, 'أتعاب توفيق الأوضاع', 55000, 1, 'نور عبد الرحمن');
  fee(r5, 'رسوم لجنة التصالح', 30000, 2, 'منى فتحي');

  fee(r6, 'مراجعة عقد الإيجار', 9000, 1, 'نور عبد الرحمن');
  fee(r9, 'أتعاب توصيل المياه', 7500, 1, 'نور عبد الرحمن');

  // Keep the stored total in step with the lines.
  db.prepare(
    `UPDATE requests SET total_amount =
       (SELECT COALESCE(SUM(amount),0) FROM fee_items WHERE request_id = requests.id)`
  ).run();

  // A free-text special request, replacing the multi-service idea.
  db.prepare('UPDATE requests SET special_request = ? WHERE id = ?').run(
    'العميلة طلبت كمان إننا نراجع عقد إيجار المحل اللي تحت المبنى، ونشوف لو فيه مشكلة قانونية تمنع توفيق الأوضاع.\nاتفقنا على 8000 جنيه زيادة، واتحطت كبند في الأتعاب.',
    r5
  );

  // ---------------------------------------------------------------- social
  log('  Social links…');

  db.prepare("DELETE FROM social_links").run();
  const socialRow = db.prepare(
    'INSERT INTO social_links (platform, url, label, sort, active) VALUES (?,?,?,?,1)'
  );
  [
    ['facebook', 'https://facebook.com/sanadlaw', 'صفحتنا الرسمية', 1],
    ['instagram', 'https://instagram.com/sanadlaw', null, 2],
    ['youtube', 'https://youtube.com/@sanadlaw', null, 3],
    ['linkedin', 'https://linkedin.com/company/sanadlaw', null, 4],
  ].forEach((r) => socialRow.run(...r));

  // ---------------------------------------------------------------- payments
  log('  Payments…');

  const payRow = db.prepare(
    `INSERT INTO payments (request_id, amount, method, paid_on, reference, note,
                           recorded_by, created_at)
     VALUES (?,?,?,?,?,?,?,?)`
  );
  const payDate = (d) => daysAgo(d).slice(0, 10);

  [
    // A deposit then an instalment — how most files actually get paid.
    [r1, 20000, 'bank', 18, 'TRX-99401', 'دفعة مقدّمة', 'نور عبد الرحمن'],
    [r1, 10000, 'instapay', 6, 'IP-77213', 'دفعة تانية', 'نور عبد الرحمن'],
    [r3, 30000, 'bank_intl', 10, 'SWIFT-4471', 'تحويل من الخارج', 'طارق الديب'],
    [r3, 30000, 'bank', 4, 'TRX-88120', null, 'طارق الديب'],
    [r4, 5000, 'cash', 7, null, 'كاش في المكتب', 'طارق الديب'],
    [r5, 25000, 'cheque', 40, 'CHQ-1102', null, 'نور عبد الرحمن'],
    [r5, 15000, 'wallet', 12, 'VF-55019', 'محفظة فودافون', 'منى فتحي'],
    [r6, 9000, 'remittance', 32, 'WU-3391', 'حوالة', 'نور عبد الرحمن'],
    [r9, 7500, 'cash', 55, null, null, 'نور عبد الرحمن'],
    // Recent activity, so the revenue page has something in every period.
    [r1, 5000, 'cash', 1, null, 'دفعة اليوم', 'نور عبد الرحمن'],
    [r4, 3000, 'instapay', 0, 'IP-90188', null, 'طارق الديب'],
  ].forEach(([id, amount, method, ago, ref, note, by]) =>
    payRow.run(id, amount, method, payDate(ago), ref, note, by, daysAgo(ago))
  );

  // A voided entry, so the reversal path is visible without creating one.
  const voided = Number(
    payRow.run(r2, 4000, 'cash', payDate(3), null, 'اتسجلت بالغلط', 'نور عبد الرحمن', daysAgo(3))
      .lastInsertRowid
  );
  db.prepare(
    "UPDATE payments SET voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ?"
  ).run(daysAgo(2), 'طارق الديب', 'اتسجلت على الطلب الغلط', voided);

  // A discount with its reason on record.
  db.prepare('UPDATE requests SET discount = ?, discount_reason = ? WHERE id = ?')
    .run(5000, 'عميل قديم — خصم متفق عليه', r5);

  // The stored figure is always the sum of live payments.
  db.prepare(
    `UPDATE requests SET paid_amount =
       (SELECT COALESCE(SUM(amount),0) FROM payments p
         WHERE p.request_id = requests.id AND p.voided_at IS NULL)`
  ).run();

  // ---------------------------------------------------------------- errands
  log('  Destinations and errands…');

  const destOf = (name) =>
    db.prepare('SELECT id FROM destinations WHERE name = ?').get(name);

  const rdRow = db.prepare(
    `INSERT INTO request_destinations (request_id, destination_id, task, status, added_by,
                                       done_by, done_on)
     VALUES (?,?,?,?,?,?,?)`
  );

  [
    [r1, 'الحي', 'تقديم ملف الترخيص ومتابعة المعاينة', 'pending', null, null],
    [r1, 'الشهر العقاري', 'استخراج صورة رسمية من عقد الملكية', 'done', 'خالد سمير', payDate(14)],
    [r2, 'شركة الكهرباء', 'تقديم طلب التوصيل', 'pending', null, null],
    [r3, 'السجل التجاري', 'استخراج مستخرج حديث', 'pending', null, null],
    [r5, 'الحي', 'متابعة لجنة التصالح', 'pending', null, null],
    [r5, 'مصلحة الضرائب', 'شهادة موقف ضريبي', 'pending', null, null],
    [r6, 'وزارة الخارجية', 'تصديق العقد للاستخدام بالخارج', 'pending', null, null],
    [r7, 'وزارة الخارجية', 'تصديق التوكيل', 'pending', null, null],
    [r9, 'شركة المياه', 'استلام بيانات العداد', 'done', 'خالد سمير', payDate(20)],
  ].forEach(([reqId, destName, task, status, doneBy, doneOn]) => {
    const d = destOf(destName);
    if (d) rdRow.run(reqId, d.id, task, status, 'نور عبد الرحمن', doneBy, doneOn);
  });

  // One planned trip, with its stops already attached.
  const foreign = destOf('وزارة الخارجية');
  if (foreign) {
    const tripId = Number(
      db
        .prepare(
          `INSERT INTO trips (destination_id, trip_date, assignee_id, assignee_name, note, created_by)
           VALUES (?,?,?,?,?,?)`
        )
        .run(
          foreign.id,
          new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
          lawyer1Id, 'خالد سمير',
          'الدور التالت — شباك التصديقات، من ٩ لـ ١٢',
          'نور عبد الرحمن'
        ).lastInsertRowid
    );
    db.prepare(
      "UPDATE request_destinations SET trip_id = ? WHERE destination_id = ? AND status = 'pending'"
    ).run(tripId, foreign.id);
  }

  // ---------------------------------------------------------------- login history
  log('  Sign-in history…');

  const loginRow = db.prepare(
    `INSERT INTO login_history (user_id, username, ip, user_agent, device, browser, os, success, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  );
  const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36';
  const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) Version/17 Mobile Safari/604.1';
  const UA_AND = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) Chrome/120 Mobile Safari/537.36';

  [
    [adminId0, 'adam', '41.33.108.22', UA_PC, 'كمبيوتر', 'Chrome', 'Windows 10/11', 1, daysAgo(0)],
    [adminId0, 'adam', '41.33.108.22', UA_PC, 'كمبيوتر', 'Chrome', 'Windows 10/11', 1, daysAgo(1)],
    [adminId0, 'adam', '156.203.44.9', UA_IOS, 'موبايل', 'Safari', 'iOS', 1, daysAgo(2)],
    [supervisorId, 'nour', '41.33.108.22', UA_PC, 'كمبيوتر', 'Chrome', 'Windows 10/11', 1, daysAgo(0)],
    [supervisorId, 'nour', '41.33.108.22', UA_PC, 'كمبيوتر', 'Chrome', 'Windows 10/11', 1, daysAgo(1)],
    [supervisorId, 'nour', '197.55.12.180', UA_AND, 'موبايل', 'Chrome', 'Android 14', 1, daysAgo(3)],
    [supervisor2Id, 'tarek', '41.33.108.22', UA_PC, 'كمبيوتر', 'Edge', 'Windows 10/11', 1, daysAgo(1)],
    [lawyer1Id, 'khaled', '156.203.90.14', UA_IOS, 'موبايل', 'Safari', 'iOS', 1, daysAgo(0)],
    [lawyer1Id, 'khaled', '41.33.108.22', UA_PC, 'كمبيوتر', 'Chrome', 'Windows 10/11', 1, daysAgo(2)],
    [lawyer2Id, 'mona', '197.55.201.7', UA_AND, 'موبايل', 'Chrome', 'Android 14', 1, daysAgo(1)],
    // Failed attempts from one address — exactly the pattern the page flags.
    [null, 'admin', '185.220.101.44', UA_PC, 'كمبيوتر', 'أداة آلية', 'Linux', 0, daysAgo(1)],
    [null, 'administrator', '185.220.101.44', UA_PC, 'كمبيوتر', 'أداة آلية', 'Linux', 0, daysAgo(1)],
    [null, 'root', '185.220.101.44', UA_PC, 'كمبيوتر', 'أداة آلية', 'Linux', 0, daysAgo(1)],
    [adminId0, 'adam', '185.220.101.44', UA_PC, 'كمبيوتر', 'أداة آلية', 'Linux', 0, daysAgo(1)],
    [lawyer2Id, 'mona', '197.55.201.7', UA_AND, 'موبايل', 'Chrome', 'Android 14', 0, daysAgo(4)],
  ].forEach((l) => loginRow.run(...l));

  db.prepare("UPDATE users SET last_login_at = ?, last_login_ip = ? WHERE username = 'adam'")
    .run(daysAgo(0), '41.33.108.22');

  // ---------------------------------------------------------------- audit trail
  log('  Audit trail…');

  const logRow = db.prepare(
    `INSERT INTO audit_log (user_id, user_label, action, entity_type, entity_id, entity_label, details, created_at)
     VALUES (?,?,?,?,?,?,?,?)`
  );
  const adminId = adminId0;
  const adminName = admin ? admin.display_name : 'Adam';

  [
    [supervisorId, 'نور عبد الرحمن', 'request.update', r1, 'SND-9001', 'الحالة: «جديد» ← «قيد المراجعة»', daysAgo(21)],
    [supervisorId, 'نور عبد الرحمن', 'request.assign', r1, 'SND-9001', 'عيّن المحامي خالد سمير على الطلب', daysAgo(20)],
    [supervisorId, 'نور عبد الرحمن', 'request.update', r1, 'SND-9001', 'الأتعاب: 0 ← 45000', daysAgo(20)],
    [lawyer1Id, 'خالد سمير', 'request.update', r1, 'SND-9001', 'الحالة: «قيد المراجعة» ← «جارٍ التنفيذ»', daysAgo(19)],
    [lawyer1Id, 'خالد سمير', 'request.assign', r1, 'SND-9001', 'عيّن المحامي منى فتحي على الطلب', daysAgo(15)],
    [supervisorId, 'نور عبد الرحمن', 'request.update', r1, 'SND-9001', 'المدفوع: 0 ← 20000', daysAgo(15)],
    [lawyer2Id, 'منى فتحي', 'request.deadline', r1, 'SND-9001', `الموعد النهائي: ${dateIn(2)} ← ${dateIn(9)}`, daysAgo(5)],
    [supervisor2Id, 'طارق الديب', 'request.assign', r3, 'SND-9003', 'عيّن المحامي منى فتحي على الطلب', daysAgo(10)],
    [supervisor2Id, 'طارق الديب', 'request.update', r3, 'SND-9003', 'المدفوع: 0 ← 60000', daysAgo(9)],
    [supervisorId, 'نور عبد الرحمن', 'request.deadline', r5, 'SND-9005', `الموعد النهائي: ${dateIn(-20)} ← ${dateIn(-5)}`, daysAgo(20)],
    [lawyer1Id, 'خالد سمير', 'request.update', r8, 'SND-9008', 'الحالة: «قيد المراجعة» ← «ملغى»', daysAgo(12)],
    [lawyer2Id, 'منى فتحي', 'request.update', r6, 'SND-9006', 'الحالة: «جارٍ التنفيذ» ← «مكتمل»', daysAgo(30)],
    [supervisorId, 'نور عبد الرحمن', 'request.archive', r9, 'SND-9009', 'أرشف الطلب', daysAgo(14)],
    [adminId, adminName, 'user.create', null, 'عمر الشناوي', 'أنشأ حساب محامي: عمر الشناوي (omar)', daysAgo(3)],
    [adminId, adminName, 'user.deactivate', null, 'ياسمين رأفت', 'أوقف حساب: ياسمين رأفت', daysAgo(20)],
    [adminId, adminName, 'settings.update', null, null, 'عدّل: whatsapp، site_domain', daysAgo(25)],
  ].forEach((t) => logRow.run(t[0], t[1], t[2], t[3] ? 'request' : null, t[3], t[4], t[5], t[6]));

  // ---------------------------------------------------------------- trash
  log('  Recycle bin samples…');

  // One recoverable deletion so the undo screen is not empty on first look.
  const ghostSvc = db.prepare('SELECT * FROM services ORDER BY id DESC LIMIT 1').get();
  if (ghostSvc) {
    db.prepare(
      'INSERT INTO trash (entity, entity_id, label, payload, deleted_by, deleted_at) VALUES (?,?,?,?,?,?)'
    ).run(
      'todo',
      999999,
      'خطوة اتحذفت بالغلط',
      JSON.stringify({
        row: {
          id: 999999, request_id: r1, title: 'خطوة اتحذفت بالغلط', done: 0, sort: 99,
          created_by: 'خالد سمير', done_by: null, done_at: null,
          created_at: daysAgo(2), note: null, from_template: 0,
        },
        extra: null,
      }),
      'خالد سمير',
      daysAgo(2)
    );
  }

  // ---------------------------------------------------------------- notifications
  log('  Notifications…');

  const notifRow = db.prepare(
    `INSERT INTO notifications (user_id, type, request_id, text, seen_at, created_at) VALUES (?,?,?,?,?,?)`
  );

  // Admin: a healthy mix of unread and already-seen.
  notifRow.run(adminId, 'comment', r5, 'طارق الديب علّق على SND-9005: كلمت سارة وشرحت لها الموقف…', null, daysAgo(3));
  notifRow.run(adminId, 'deadline', r1, 'منى فتحي غيّرت موعد تسليم SND-9001', null, daysAgo(5));
  notifRow.run(adminId, 'comment', r2, 'نور عبد الرحمن علّقت على SND-9002: مستنيين شهادة إتمام البناء…', null, daysAgo(4));
  notifRow.run(adminId, 'status', r8, 'خالد سمير غيّر حالة SND-9008 إلى «ملغى»', null, daysAgo(12));
  notifRow.run(adminId, 'upload', r2, 'أحمد محمود السيد رفع مستند على SND-9002', null, daysAgo(6));
  notifRow.run(adminId, 'status', r6, 'منى فتحي غيّرت حالة SND-9006 إلى «مكتمل»', daysAgo(29), daysAgo(30));
  notifRow.run(adminId, 'comment', r3, 'طارق الديب علّق على SND-9003: الحد الأقصى ١٠% قليّل…', daysAgo(4), daysAgo(5));

  // Supervisors.
  notifRow.run(supervisorId, 'comment', r5, 'خالد سمير رد في SND-9005: هروح الحي بنفسي بكرة…', null, daysAgo(9));
  notifRow.run(supervisorId, 'comment', r1, 'منى فتحي علّقت على SND-9001: المعاينة اتعملت النهاردة…', null, daysAgo(6));
  notifRow.run(supervisor2Id, 'comment', r3, 'منى فتحي ردت في SND-9003: خلصت المسودة الأولى…', null, daysAgo(6));
  notifRow.run(supervisor2Id, 'status', r1, 'خالد سمير غيّر حالة SND-9001 إلى «جارٍ التنفيذ»', daysAgo(18), daysAgo(19));

  // Lawyers — each sees only their own assignments.
  notifRow.run(lawyer1Id, 'assigned', r1, 'نور عبد الرحمن عيّنتك على الطلب SND-9001', daysAgo(20), daysAgo(20));
  notifRow.run(lawyer1Id, 'comment', r5, 'نور عبد الرحمن علّقت على SND-9005: الملف ده واقف من ٣ أسابيع…', null, daysAgo(12));
  notifRow.run(lawyer1Id, 'assigned', r4, 'طارق الديب عيّنك على الطلب SND-9004', null, daysAgo(7));
  notifRow.run(lawyer1Id, 'deadline', r5, 'طارق الديب غيّر موعد تسليم SND-9005', null, daysAgo(3));
  notifRow.run(lawyer2Id, 'assigned', r1, 'خالد سمير عيّنك على الطلب SND-9001', null, daysAgo(15));
  notifRow.run(lawyer2Id, 'comment', r1, 'خالد سمير رد في SND-9001: كلمت المهندس المسؤول…', null, daysAgo(14));
  notifRow.run(lawyer2Id, 'comment', r3, 'طارق الديب رد في SND-9003: الحد الأقصى ١٠% قليّل…', null, daysAgo(5));

  // Demo accounts have no ID photographs, so the requirement is switched off
  // here — otherwise every documented login would land on the profile gate
  // instead of the panel. A real install keeps it on.
  setSetting('staff_id_required', '0');

  // ---------------------------------------------------------------- volume
  /**
   * The ten requests above are the walkthrough. This adds two years of ordinary
   * history around them, because a list, a filter and a revenue chart cannot be
   * judged from ten rows.
   */
  log('  Two years of office history…');

  const volume = require('./demo-volume').generate(db, {
    refFor: nextRef,
    services: db
      .prepare(`SELECT s.id, s.title_ar, s.title_en FROM services s
        LEFT JOIN categories c ON c.id=s.category_id
        LEFT JOIN pages p ON p.id=c.page_id
        WHERE s.is_consultation=0 AND s.active=1
          AND COALESCE(p.slug,'') NOT IN ('visas','universities','companies')`)
      .all(),
    staff: db.prepare('SELECT id, display_name, role, active FROM users').all(),
    log,
  });

  log(`    ${volume.requests} requests · ${volume.clients} clients`);

  const complete = require('./demo-complete').seedCompleteDemo(db, { admin, log });
  log(`    ${complete.companies} companies · ${complete.cases} cases · ${complete.agenda} agenda · ${complete.payroll} payroll items`);

  // Categories and services on the other pages, so the pages tier is visible
  // rather than three empty shells.
  log('  Services on the other pages…');

  const pageContent = {
    visas: [
      ['تأشيرات السفر', 'Travel visas', 'تجهيز ملفات التأشيرة ومتابعتها مع السفارات.', [
        ['تأشيرة سياحية', 'Tourist visa', 'تجهيز الملف كامل ومراجعته قبل التقديم، ومتابعة الموعد.'],
        ['تأشيرة زيارة عائلية', 'Family visit visa', 'خطاب الدعوة والمستندات المطلوبة من الطرفين.'],
        ['تأشيرة عمل', 'Work visa', 'مراجعة العقد والمستندات وتصديقها.'],
        ['تجديد تأشيرة', 'Visa renewal', 'متابعة التجديد قبل انتهاء المدة.'],
      ]],
      ['الإقامات', 'Residency', 'استخراج الإقامات وتجديدها وتعديل بياناتها.', [
        ['إقامة جديدة', 'New residency', 'من أول التقديم لحد الاستلام.'],
        ['تجديد إقامة', 'Residency renewal', 'متابعة التجديد ومستنداته.'],
        ['نقل كفالة', 'Sponsorship transfer', 'الإجراءات والموافقات المطلوبة.'],
      ]],
      ['التصديقات', 'Attestation', 'تصديق المستندات للاستخدام خارج البلاد.', [
        ['تصديق الخارجية', 'Foreign ministry attestation', 'تصديق المستندات من وزارة الخارجية.'],
        ['تصديق السفارة', 'Embassy attestation', 'متابعة التصديق لدى السفارة المعنية.'],
        ['ترجمة معتمدة', 'Certified translation', 'ترجمة معتمدة مقبولة لدى الجهات الرسمية.'],
      ]],
    ],
    universities: [
      ['القبول الجامعي', 'University admission', 'ملفات القبول للجامعات المحلية والخارجية.', [
        ['ملف قبول جامعة محلية', 'Local university admission', 'تجهيز الملف ومراجعة الشروط.'],
        ['ملف قبول جامعة خارجية', 'Overseas admission', 'المستندات والتصديقات المطلوبة.'],
        ['تحويل من جامعة لأخرى', 'University transfer', 'إجراءات التحويل ومعادلة المواد.'],
      ]],
      ['معادلة الشهادات', 'Degree equivalency', 'معادلة الشهادات الصادرة من الخارج.', [
        ['معادلة شهادة بكالوريوس', 'Bachelor equivalency', 'الملف والمستندات ومتابعة اللجنة.'],
        ['معادلة شهادة ثانوية', 'Secondary equivalency', 'إجراءات المعادلة والتصديق.'],
        ['معادلة دراسات عليا', 'Postgraduate equivalency', 'متطلبات المعادلة ومتابعتها.'],
      ]],
      ['المستندات الدراسية', 'Academic documents', 'استخراج وتصديق ما تطلبه الجامعات.', [
        ['استخراج بيان درجات', 'Transcript', 'استخراج البيان وتصديقه.'],
        ['إفادة قيد', 'Enrolment letter', 'استخراج الإفادة من الجامعة.'],
      ]],
    ],
    companies: [
      ['تأسيس الشركات', 'Company formation', 'من العقد لحد السجل التجاري.', [
        ['تأسيس شركة ذات مسؤولية محدودة', 'LLC formation', 'العقد والسجل والبطاقة الضريبية.'],
        ['تأسيس شركة مساهمة', 'Joint stock formation', 'الإجراءات والموافقات المطلوبة.'],
        ['تأسيس منشأة فردية', 'Sole proprietorship', 'أبسط شكل قانوني وأسرعه.'],
      ]],
      ['التراخيص التشغيلية', 'Operating licences', 'رخص المزاولة والسجلات المطلوبة.', [
        ['رخصة مزاولة نشاط', 'Activity licence', 'استخراج الرخصة ومتابعة المعاينة.'],
        ['السجل الصناعي', 'Industrial registry', 'القيد في السجل الصناعي.'],
        ['شهادة المنشأ', 'Certificate of origin', 'استخراج الشهادة للتصدير.'],
      ]],
      ['الامتثال والتعديلات', 'Compliance and changes', 'تعديل البيانات والالتزامات الدورية.', [
        ['تعديل عقد الشركة', 'Amending articles', 'صياغة التعديل وتوثيقه.'],
        ['تغيير النشاط', 'Changing activity', 'إضافة أو حذف نشاط من السجل.'],
        ['تجديد السجل التجاري', 'Registry renewal', 'التجديد قبل انتهاء المدة.'],
      ]],
    ],
  };

  const insCat = db.prepare(
    'INSERT INTO categories (page_id, sort, name_ar, name_en, desc_ar, desc_en) VALUES (?,?,?,?,?,?)'
  );
  const insSvc = db.prepare(
    `INSERT INTO services (category_id, sort, title_ar, title_en, body_ar, body_en, active)
     VALUES (?,?,?,?,?,?,1)`
  );

  Object.entries(pageContent).forEach(([slug, cats]) => {
    const pageRow = db.prepare('SELECT id FROM pages WHERE slug = ?').get(slug);
    if (!pageRow) return;

    cats.forEach(([nameAr, nameEn, desc, services], ci) => {
      const existingCat = db.prepare('SELECT id FROM categories WHERE page_id=? AND name_ar=?').get(pageRow.id,nameAr);
      const catId = existingCat ? Number(existingCat.id) : Number(
        insCat.run(pageRow.id, ci + 1, nameAr, nameEn, desc, desc).lastInsertRowid
      );
      services.forEach(([titleAr, titleEn, body], si) => {
        if(!db.prepare('SELECT 1 FROM services WHERE category_id=? AND title_ar=?').get(catId,titleAr))
          insSvc.run(catId, si + 1, titleAr, titleEn, body, body);
      });
    });
  });

  // A lawyer with a money exception, and one who is away — so both features
  // are visible without anyone configuring them first.
  log('  Permission exceptions and availability…');

  const mona = db.prepare("SELECT id FROM users WHERE username = 'mona'").get();
  if (mona) {
    db.prepare(
      `INSERT OR REPLACE INTO user_permissions (user_id, permission, granted, reason, set_by)
       VALUES (?,?,?,?,?)`
    ).run(mona.id, 'money.view', 1, 'بتتابع تحصيل ملفاتها بنفسها', 'Adam');
  }

  const khaled = db.prepare("SELECT id FROM users WHERE username = 'khaled'").get();
  if (khaled) {
    db.prepare(
      `UPDATE users SET assign_locked = 1, assign_lock_reason = ?, assign_lock_until = ?,
                        assign_lock_by = ?, assign_lock_at = datetime('now')
       WHERE id = ?`
    ).run(
      'إجازة سنوية',
      new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10),
      'خالد سمير',
      khaled.id
    );
  }

  // Everything above belongs to the demo. Marked explicitly so removing it
  // later is a fact rather than a guess.
  db.prepare('UPDATE requests SET is_demo = 1').run();
  db.prepare('UPDATE clients SET is_demo = 1').run();
  db.prepare('UPDATE trips SET is_demo = 1').run();
  db.prepare(
    `UPDATE users SET is_demo = 1
     WHERE username IN ('adam','nour','tarek','khaled','mona','yasmin','omar','samia')`
  ).run();

  // ---------------------------------------------------------------- accounts file
  const fsAcc = require('fs');
  const ADMIN_PATH = (process.env.ADMIN_PATH || '/office-panel').replace(/\/+$/, '');

  const accountsText = `═══════════════════════════════════════════════════════════════
    سند — حسابات التجربة
    اتولدت من: npm run demo
  ═══════════════════════════════════════════════════════════════

    ⚠️  الحسابات دي للتجربة بس. امسحها قبل ما الموقع يشتغل بعملاء حقيقيين.


  ┌─ لوحة الإدارة ─────────────────────────────────────────────┐

    🔐  رابط الدخول:   ${ADMIN_PATH}/login

        المسار ده مش /admin عشان الأمان — أي حد يجرّب /admin
        هيلاقي صفحة 404 عادية ومش هيعرف إن فيه لوحة أصلاً.

        تغيّره من متغير البيئة ADMIN_PATH.


    أدمن
      adam / 1234
      كل الصلاحيات. (كلمة السر دي ضعيفة — غيّرها قبل النشر)

    تنبيه: الحسابات التشغيلية الحالية كلها تستخدم كلمة السر المؤقتة:
      Sanad@2026
    وعند أول دخول يجب تغييرها ثم استكمال بيانات البطاقة والصور.

    أسماء المستخدمين الحالية:
    ${CURRENT_STAFF.map(s=>`  ${s[0].padEnd(24)} ${s[1]} — ${s[3]}`).join('\n')}

    بيانات العرض القديمة أدناه تخص سيناريو الطلبات التجريبي فقط:

    مشرف
      nour   / demo1234    نور عبد الرحمن
      tarek  / demo1234    طارق الديب
      بيشوفوا كل الطلبات، بيسجّلوا الدفعات والخصومات،
      بيعيّنوا المحامين، بيديروا قوالب الخطوات.
      مش بيوصلوا للمحتوى ولا الحسابات ولا الإعدادات.

    محامي
      khaled / demo1234    خالد سمير    — معيّن على 9001، 9002، 9004، 9008، 9009
      mona   / demo1234    منى فتحي     — معيّنة على 9001، 9003، 9005، 9006
      بيشوفوا الطلبات المعيّنين عليها بس.
      مش بيشوفوا أي أرقام فلوس خالص.

    محامي — لسه مغيّرش كلمة السر
      omar   / demo1234    عمر الشناوي
      أول ما يدخل هيتطلب منه يغيّر كلمة السر إجبارياً.

    محامي — حساب موقوف
      yasmin / demo1234    ياسمين رأفت
      مش هيقدر يدخل. تاريخه وتعليقاته لسه محفوظة.


  ┌─ بوابة العملاء ────────────────  /portal/login  ────────────┐

    client@demo.sanad   / demo1234   أحمد محمود السيد
      عميل فرد، عنده طلبين (9001 بناء، 9002 كهرباء)

    sara@demo.sanad     / demo1234   سارة إبراهيم منصور
      ممثلة شركة، عندها ٣ طلبات (9003، 9004، 9005)
      واحد منهم متأخر عن موعده

    john@demo.sanad     / demo1234   John Michael Carter
      عميل إنجليزي — الموقع بيتحوّل لإنجليزي معاه
      عنده طلب مكتمل وطلب جديد

    mostafa@demo.sanad  / demo1234   مصطفى كمال الدين
      إيميله لسه مأكّدش — بيبان له تنبيه أصفر
      عنده طلب ملغي (9008)


  ┌─ الطلبات ──────────────────────────────────────────────────┐

    تراخيص البناء          جارٍ التنفيذ    ٣ مستندات · ٤/٧ خطوات
    توصيل الكهرباء         بانتظار مستندات  موعده النهاردة
    عقود المقاولات         قيد المراجعة    مدفوع بالكامل
    زيادة القدرة           بانتظار الدفع
    تصحيح أوضاع            جارٍ التنفيذ    ⚠ متأخر ٥ أيام
    عقود الإيجار           مكتمل           عميل إنجليزي
    الفحص القانوني         جديد            مفيش محامي معيّن
    تغيير الاستخدام        ملغى            السبب مكتوب في التعليقات
    توصيل المياه           مكتمل           مؤرشف
    مذكرات التفاهم         جديد            طلب زائر بدون حساب


  ┌─ حاجات تستاهل تجربها ──────────────────────────────────────┐

    • ادخل بـ mona وشوف إنها بتشوف طلباتها بس ومفيش أرقام فلوس
    • افتح SND-9005 — الطلب المتأخر، فيه نقاش حقيقي عن مشكلة
    • افتح SND-9008 — طلب ملغي والسبب موثّق في التعليقات
    • ادخل بـ omar — هيجبرك تغيّر كلمة السر قبل أي حاجة
    • جرّب تدخل بـ yasmin — هيرفض، الحساب موقوف
    • احذف أي خطوة في SND-9001 ودوس «تراجع»
    • افتح SND-9005 → «الأتعاب» — بنود منفصلة والإجمالي بيتحسب لوحده
    • نفس الطلب فيه «طلب خاص» مكتوب بحرية
    • من صفحة أي طلب دوس «تحميل PDF» — ملف كامل بالتعليقات والصور
    • افتح «الأمان والدخول» — آخر ٣ IP لكل موظف ومحاولات فاشلة متكررة
    • الإعدادات ← الإيميل ← «إرسال رسالة تجريبية» — الرسالة هتتكتب في
      مجلد data/mail-outbox، افتحها في المتصفح وشوفها
    • ابعت طلب من الموقع وشوف إيميل التأكيد في نفس المجلد
    • افتح «الاستشارات» — صفحة مستقلة، ولو فاضية اللينك بيختفي من الموقع
    • ادخل بـ john وشوف الموقع بالإنجليزي
    • افتح سلة المحذوفات — فيها عنصر جاهز للاسترجاع

  ═══════════════════════════════════════════════════════════════
  `;

  // Upload tokens for the demo requests, so the upload pages are reachable
  // while email is still in outbox mode.
  const crypto = require('crypto');
  const withTokens = db.prepare('SELECT id, ref, name FROM requests ORDER BY id').all();
  const setToken = db.prepare('UPDATE requests SET upload_token = ? WHERE id = ?');

  const linkLines = withTokens.map((r) => {
    const token = crypto.randomBytes(24).toString('hex');
    setToken.run(token, r.id);
    return `  ${r.ref}  ${r.name}\n      /upload/${r.id}?t=${token}`;
  });

  const linksBlock = `

  ┌─ روابط رفع المستندات ──────────────────────────────────────┐

    الإيميل في وضع التجربة، فالروابط دي مكتوبة هنا عشان تقدر
    تفتح صفحة الرفع لأي طلب من غير ما تستنى رسالة.

    ضيفها بعد عنوان الموقع، مثال:
    http://localhost:3000/upload/1?t=xxxxx

  ${linkLines.join('\n\n')}

    أي طلب جديد أو تسجيل حساب أثناء التجربة، لينكه بيتكتب
    تلقائياً في آخر الملف تحت «روابط مؤقتة».

  `;

  if (writeAccountsFile) {
    fsAcc.writeFileSync(
      path.join(__dirname, '..', 'TEST-ACCOUNTS.txt'),
      accountsText + linksBlock,
      'utf8'
    );
  }

  // ---------------------------------------------------------------- done
  const count = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;

  log(`
  ════════════════════════════════════════════════
    Demo data ready
  ════════════════════════════════════════════════

    All accounts are also written to:  TEST-ACCOUNTS.txt
    Admin panel:                       ${ADMIN_PATH}/login

    STAFF
       adam / 1234              admin
       current staff / Sanad@2026
       each staff member changes the temporary password and completes the profile on first sign-in

    CLIENT PORTAL  /portal/login
       client@demo.sanad, sara@demo.sanad,
       john@demo.sanad, mostafa@demo.sanad   / demo1234

    ${count('requests')} requests · ${count('comments')} comments · ${count('payments')} payments
    ${count('document_files')} files · ${count('todos')} checklist steps · ${count('notifications')} notifications

  ════════════════════════════════════════════════
  `);

}

module.exports = seedDemo;
