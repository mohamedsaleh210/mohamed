exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS report_profiles (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT NOT NULL,
      company_name_ar  TEXT NOT NULL,
      company_name_en  TEXT,
      legal_name       TEXT,
      registration_no  TEXT,
      tax_no           TEXT,
      address          TEXT,
      phone            TEXT,
      email            TEXT,
      website          TEXT,
      logo_file        TEXT,
      header_text      TEXT,
      intro_text       TEXT,
      footer_text      TEXT,
      signatory_name   TEXT,
      signatory_title  TEXT,
      signature_file   TEXT,
      stamp_file       TEXT,
      watermark_text   TEXT,
      primary_color    TEXT DEFAULT '#0b2b34',
      accent_color     TEXT DEFAULT '#d1a747',
      is_default       INTEGER DEFAULT 0,
      active           INTEGER DEFAULT 1,
      created_by       INTEGER REFERENCES users(id),
      created_at       TEXT DEFAULT (datetime('now')),
      updated_at       TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_report_profiles_active ON report_profiles(active,is_default DESC,name);

    CREATE TABLE IF NOT EXISTS report_exports (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      report_type     TEXT NOT NULL,
      entity_type     TEXT,
      entity_id       INTEGER,
      profile_id      INTEGER REFERENCES report_profiles(id),
      profile_name    TEXT,
      format          TEXT NOT NULL,
      filters_json    TEXT,
      include_money   INTEGER DEFAULT 0,
      language        TEXT DEFAULT 'ar',
      exported_by     INTEGER REFERENCES users(id),
      exported_by_name TEXT,
      created_at      TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_report_exports_entity ON report_exports(entity_type,entity_id,created_at DESC);
  `);
};
