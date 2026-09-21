const { addColumn } = require('../migrate');

/**
 * A page above categories.
 *
 * The office does several distinct kinds of work — visas, universities,
 * companies — and a visitor who came about a university place should not have
 * to scroll past building permits to find it. A page is that top level: its own
 * banner, its own words, its own colour, so arriving there feels like arriving
 * somewhere specific rather than at a general list.
 *
 * Requests record which page they came through, so the office can ask "how did
 * the universities side do this quarter" and get an answer.
 */
exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      slug          TEXT NOT NULL UNIQUE,
      name_ar       TEXT NOT NULL,
      name_en       TEXT NOT NULL,
      tagline_ar    TEXT,
      tagline_en    TEXT,
      intro_ar      TEXT,
      intro_en      TEXT,
      colour        TEXT DEFAULT '#a9853a',
      icon          TEXT,
      sort          INTEGER DEFAULT 0,
      active        INTEGER DEFAULT 1,
      show_in_menu  INTEGER DEFAULT 1,
      is_default    INTEGER DEFAULT 0,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pages_live ON pages(sort) WHERE active = 1;
  `);

  addColumn(db, 'categories', 'page_id', 'INTEGER REFERENCES pages(id) ON DELETE CASCADE');
  addColumn(db, 'requests', 'page_id', 'INTEGER REFERENCES pages(id) ON DELETE SET NULL');
  addColumn(db, 'requests', 'page_label', 'TEXT');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_categories_page ON categories(page_id, sort);
    CREATE INDEX IF NOT EXISTS idx_requests_page ON requests(page_id);
  `);

  // Everything that exists today belongs to one page, so nothing is orphaned
  // and the site keeps working before anyone configures anything.
  const existing = db.prepare('SELECT COUNT(*) c FROM pages').get().c;

  if (!existing) {
    const seed = db.prepare(
      `INSERT INTO pages (slug, name_ar, name_en, tagline_ar, tagline_en,
                          intro_ar, intro_en, colour, icon, sort, is_default, show_in_menu)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    );

    const defaultId = Number(
      seed.run(
        'general',
        'الخدمات العامة',
        'General services',
        'تراخيص البناء، المرافق، والعقود',
        'Building permits, utilities and contracts',
        'كل ما يخص العقار والمرافق والعقود — من التراخيص إلى توصيل الخدمات وصياغة العقود ومراجعتها.',
        'Everything to do with property, utilities and contracts — from permits to connections, drafting and review.',
        '#a9853a', 'building', 1, 1, 1
      ).lastInsertRowid
    );

    db.prepare('UPDATE categories SET page_id = ? WHERE page_id IS NULL').run(defaultId);

    // The pages the office asked for, ready to fill.
    seed.run(
      'visas', 'تأشيرات وإقامات', 'Visas and residency',
      'إجراءات السفر والإقامة من أول خطوة',
      'Travel and residency, handled end to end',
      'تجهيز ملفات التأشيرات، تجديد الإقامات، وتصديق المستندات المطلوبة للسفارات.',
      'Visa files, residency renewals, and the document attestations embassies ask for.',
      '#2f7bbf', 'passport', 2, 0, 1
    );

    seed.run(
      'universities', 'جامعات', 'Universities',
      'القبول والمعادلة والتصديقات الدراسية',
      'Admissions, equivalency and academic attestation',
      'مساعدة الطلاب وأولياء الأمور في ملفات القبول، معادلة الشهادات، وتصديق المستندات الدراسية.',
      'Helping students and parents with admission files, degree equivalency, and academic attestations.',
      '#3a9d6b', 'university', 3, 0, 1
    );

    seed.run(
      'companies', 'شركات', 'Companies',
      'التأسيس والتراخيص والامتثال',
      'Formation, licensing and compliance',
      'تأسيس الشركات، السجل التجاري، البطاقة الضريبية، والتراخيص التشغيلية.',
      'Company formation, commercial registry, tax cards, and operating licences.',
      '#8a63c9', 'briefcase', 4, 0, 1
    );
  }

  // Existing requests keep working: their page follows their service.
  const backfill = () => {
    db.prepare(
      `UPDATE requests SET page_id = (
         SELECT c.page_id FROM services s
         JOIN categories c ON c.id = s.category_id
         WHERE s.id = requests.service_id
       ) WHERE page_id IS NULL AND service_id IS NOT NULL`
    ).run();

    db.prepare(
      `UPDATE requests SET page_label = (
         SELECT p.name_ar FROM pages p WHERE p.id = requests.page_id
       ) WHERE page_label IS NULL AND page_id IS NOT NULL`
    ).run();
  };

  backfill();

  /*
   * And a trigger for everything written afterwards.
   *
   * Deriving the page in application code would mean every place that creates a
   * request has to remember — the public form, the office form, the demo
   * seeder. One trigger cannot forget.
   */
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS requests_page_insert
    AFTER INSERT ON requests
    WHEN new.service_id IS NOT NULL
    BEGIN
      UPDATE requests SET
        page_id = (SELECT c.page_id FROM services s
                    JOIN categories c ON c.id = s.category_id
                   WHERE s.id = new.service_id),
        page_label = (SELECT p.name_ar FROM services s
                       JOIN categories c ON c.id = s.category_id
                       JOIN pages p ON p.id = c.page_id
                      WHERE s.id = new.service_id)
      WHERE id = new.id;
    END;

    CREATE TRIGGER IF NOT EXISTS requests_page_update
    AFTER UPDATE OF service_id ON requests
    WHEN new.service_id IS NOT NULL
    BEGIN
      UPDATE requests SET
        page_id = (SELECT c.page_id FROM services s
                    JOIN categories c ON c.id = s.category_id
                   WHERE s.id = new.service_id),
        page_label = (SELECT p.name_ar FROM services s
                       JOIN categories c ON c.id = s.category_id
                       JOIN pages p ON p.id = c.page_id
                      WHERE s.id = new.service_id)
      WHERE id = new.id;
    END;
  `);
};
