const bcrypt = require('bcryptjs');
const { db, getSetting, setSetting } = require('./index');
const catalogue = require('./catalogue');

/** Writes the catalogue into empty categories/services tables. */
function insertCatalogue() {
  const insCat = db.prepare(
    'INSERT INTO categories (sort, name_ar, name_en, desc_ar, desc_en) VALUES (?,?,?,?,?)'
  );
  const insSvc = db.prepare(
    `INSERT INTO services (category_id, sort, title_ar, title_en, body_ar, body_en, is_consultation, active)
     VALUES (?,?,?,?,?,?,0,1)`
  );

  db.transaction(() => {
    catalogue.forEach((cat, ci) => {
      const catId = insCat.run(ci + 1, cat.name_ar, cat.name_en, cat.desc_ar, cat.desc_en)
        .lastInsertRowid;
      cat.services.forEach((s, si) => {
        insSvc.run(catId, si + 1, s.title_ar, s.title_en, s.body_ar, s.body_en);
      });
    });
  })();
}

// Runs on every boot but only writes when something is missing, so it is safe
// on a live database.
function seed() {
  if (process.env.NODE_ENV === 'production' && !process.env.TENANT_ID && !process.env.PLATFORM_ADMIN_PASSWORD) {
    throw new Error('PLATFORM_ADMIN_PASSWORD is required in production for the Sanad owner account');
  }
  const adminExists = db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get();
  if (!adminExists) {
    // The first admin has to exist for the panel to be reachable at all, so it
    // ships with a known password — and is required to replace it before it can
    // do anything.
    db.prepare(
      `INSERT INTO users (username, password_hash, role, display_name, active, must_change_password)
       VALUES (?,?,?,?,1,1)`
    ).run('adam', bcrypt.hashSync('1234', 10), 'admin', 'Adam');
  }

  /*
   * The portable owner database has one fixed Sanad owner account. Tenant
   * databases are excluded: their administrators keep their own credentials.
   *
   * This used to run on every boot, resetting the account to the documented
   * default password even after the owner changed it — so a compromised or
   * merely well-known password could never actually be replaced. It now runs
   * once: the first boot sets the known default (forcing a change on first
   * login), and every boot after that leaves whatever the owner set alone.
   */
  if (!process.env.TENANT_ID && process.env.NODE_ENV !== 'test') {
    const initialized = getSetting('owner_account_initialized_v1', '') === 'done';
    if (!initialized) {
      const owner = db.prepare("SELECT id FROM users WHERE username='adam' OR role='admin' ORDER BY CASE WHEN username='adam' THEN 0 ELSE 1 END,id LIMIT 1").get();
      const initUsername = process.env.PLATFORM_ADMIN_USERNAME || 'adam';
      const initPassword = process.env.PLATFORM_ADMIN_PASSWORD || 'Mas@123456789';
      if (owner) {
        db.prepare("UPDATE users SET username=?,password_hash=?,role='admin',display_name='Adam',active=1,must_change_password=1 WHERE id=?")
          .run(initUsername, bcrypt.hashSync(initPassword, 11), owner.id);
      }
      setSetting('owner_account_initialized_v1', 'done');
    }
  }

  const defaults = {
    whatsapp: '',
    currency: 'EGP',
    site_name_ar: 'سند',
    site_name_en: 'Sanad',
    tagline_ar: 'خدماتك القانونية والإدارية… في مكان واحد',
    tagline_en: 'Your legal and administrative services — in one place',
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (db.prepare('SELECT 1 FROM settings WHERE key = ?').get(k) === undefined) setSetting(k, v);
  }

  if (!db.prepare('SELECT 1 FROM categories LIMIT 1').get()) insertCatalogue();
}

module.exports = seed;
module.exports.insertCatalogue = insertCatalogue;
