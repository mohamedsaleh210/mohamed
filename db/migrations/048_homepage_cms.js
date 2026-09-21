const { addColumn } = require('../migrate');

exports.up = (db) => {
  addColumn(db, 'services', 'home_pinned', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'services', 'home_pinned_sort', 'INTEGER NOT NULL DEFAULT 0');
  db.exec(`
    CREATE TABLE IF NOT EXISTS homepage_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_key TEXT NOT NULL UNIQUE,
      label_ar TEXT NOT NULL,
      label_en TEXT,
      visible INTEGER NOT NULL DEFAULT 1,
      sort INTEGER NOT NULL DEFAULT 0,
      settings_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT(datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS homepage_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric_key TEXT NOT NULL UNIQUE,
      label_ar TEXT NOT NULL,
      label_en TEXT,
      value TEXT NOT NULL,
      icon TEXT,
      visible INTEGER NOT NULL DEFAULT 1,
      sort INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT(datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS testimonials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT,
      quote_ar TEXT NOT NULL,
      quote_en TEXT,
      rating INTEGER NOT NULL DEFAULT 5 CHECK(rating BETWEEN 1 AND 5),
      office_name TEXT,
      service_name TEXT,
      country_code TEXT,
      anonymous INTEGER NOT NULL DEFAULT 0,
      approved INTEGER NOT NULL DEFAULT 0,
      visible INTEGER NOT NULL DEFAULT 1,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT(datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS homepage_faqs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_ar TEXT NOT NULL,
      answer_ar TEXT NOT NULL,
      question_en TEXT,
      answer_en TEXT,
      service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
      office_name TEXT,
      approved INTEGER NOT NULL DEFAULT 1,
      visible INTEGER NOT NULL DEFAULT 1,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT(datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_homepage_sections_live ON homepage_sections(visible,sort);
    CREATE INDEX IF NOT EXISTS idx_homepage_metrics_live ON homepage_metrics(visible,sort);
    CREATE INDEX IF NOT EXISTS idx_testimonials_publish ON testimonials(approved,visible,sort);
    CREATE INDEX IF NOT EXISTS idx_homepage_faqs_publish ON homepage_faqs(approved,visible,sort);
  `);

  const addSection = db.prepare(
    'INSERT OR IGNORE INTO homepage_sections(section_key,label_ar,label_en,sort) VALUES(?,?,?,?)'
  );
  [
    ['hero','الواجهة الرئيسية','Hero',10],
    ['search','البحث الذكي','Search',20],
    ['metrics','المؤشرات','Metrics',30],
    ['audiences','فئات العملاء','Audiences',40],
    ['partners','المكاتب والشركات','Partners',50],
    ['popular','الخدمات الأكثر طلبًا','Popular services',60],
    ['steps','كيف تعمل سند','How Sanad works',70],
    ['why','لماذا سند','Why Sanad',80],
    ['system','نظام المكاتب','Office system',90],
    ['plans','الباقات','Plans',100],
    ['testimonials','آراء العملاء','Testimonials',110],
    ['faq','الأسئلة الشائعة','FAQ',120],
    ['cta','الدعوة النهائية','Final call to action',130],
  ].forEach((row) => addSection.run(...row));

  const addMetric = db.prepare(
    'INSERT OR IGNORE INTO homepage_metrics(metric_key,label_ar,label_en,value,icon,sort) VALUES(?,?,?,?,?,?)'
  );
  [
    ['completed','طلب مكتمل','Completed requests','+500','▤',10],
    ['satisfaction','رضا العملاء','Customer satisfaction','98%','◎',20],
    ['services','خدمة قانونية وإدارية','Legal and administrative services','+40','◇',30],
    ['support','متابعة طوال أيام العمل','Support throughout working days','الأحد إلى الخميس','◉',40],
  ].forEach((row) => addMetric.run(...row));

  const testimonialCount = db.prepare('SELECT COUNT(*) c FROM testimonials').get().c;
  if (!testimonialCount) {
    const add = db.prepare(
      `INSERT INTO testimonials(customer_name,quote_ar,rating,country_code,approved,visible,sort)
       VALUES(?,?,?,?,1,1,?)`
    );
    add.run('أحمد محمود','تابعت تأسيس الشركة والمستندات من حسابي، وكل خطوة كانت واضحة.',5,'EG',10);
    add.run('سارة فهمي','الفاتورة والمواعيد والتنبيهات وفّرت علينا وقتًا كبيرًا.',5,'EG',20);
    add.run('محمد عبد الرحمن','تجربة عملية ومريحة، خصوصًا في رفع الملفات ومتابعة المسؤول.',5,'SA',30);
  }

  const faqCount = db.prepare('SELECT COUNT(*) c FROM homepage_faqs').get().c;
  if (!faqCount) {
    const add = db.prepare(
      'INSERT INTO homepage_faqs(question_ar,answer_ar,sort) VALUES(?,?,?)'
    );
    add.run('كيف أسجل حسابًا جديدًا؟','ابدأ طلبك كزائر، ثم أنشئ الحساب عند الإرسال لمتابعة كل التفاصيل.',10);
    add.run('ما مميزات استخدام الموقع؟','تتابع الطلبات والمستندات والمواعيد والعروض والدفعات والإشعارات من مكان واحد.',20);
    add.run('هل يمكن تقديم طلب دون حساب؟','نعم، ويمكن إنشاء الحساب وربط الطلب به عند الإرسال.',30);
    add.run('كيف أتواصل مع فريق سند؟','من المحادثات داخل حسابك أو قنوات التواصل المفعلة للخدمة.',40);
  }
};
