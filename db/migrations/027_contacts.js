/**
 * Office contact details.
 *
 * These were spread across single settings keys — one phone, one WhatsApp,
 * one address — which is fine until the office has a second line, a branch, or
 * a separate address for correspondence. A table lets the office describe
 * itself as it actually is instead of as the schema assumed.
 */
exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      kind       TEXT NOT NULL,
      label      TEXT,
      value      TEXT NOT NULL,
      note       TEXT,
      sort       INTEGER DEFAULT 0,
      active     INTEGER DEFAULT 1,
      primary_one INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_contacts_kind ON contacts(kind, sort);
  `);

  const has = db.prepare('SELECT 1 FROM contacts LIMIT 1').get();
  if (!has) {
    const ins = db.prepare(
      'INSERT INTO contacts (kind, label, value, sort, primary_one) VALUES (?,?,?,?,?)'
    );
    ins.run('whatsapp', 'واتساب المكتب', '+966551537512', 1, 1);
    ins.run('email', 'البريد الرسمي', 'mohamedsaleh@sanad.com.eg', 2, 1);
  }

  // The floating WhatsApp button reads a setting, so keep the two in step.
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('whatsapp', '+966551537512')").run();

  const officeEmails = db.prepare("SELECT value FROM settings WHERE key = 'office_emails'").get();
  if (!officeEmails || !officeEmails.value) {
    db.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('office_emails', 'mohamedsaleh@sanad.com.eg')"
    ).run();
  }

  // Opening hours belong with the contact details rather than in a paragraph
  // somebody has to remember to update.
  const put = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?,?)');
  put.run('office_hours_ar', 'من السبت إلى الخميس · ٩ صباحاً – ٥ مساءً');
  put.run('office_hours_en', 'Saturday to Thursday · 9am – 5pm');
  put.run('office_address_ar', '');
  put.run('office_address_en', '');
  put.run('office_map_url', '');
};
