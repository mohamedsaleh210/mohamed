const { addColumn } = require('../migrate');

// The cluster of gaps around a request: who opened it, what it is called,
// and the applicant's relationship — which belongs here rather than on the
// account, since the same person applies for themselves one week and for a
// relative the next.
exports.up = (db) => {
  addColumn(db, 'requests', 'opened_by', 'TEXT');
  addColumn(db, 'requests', 'source', "TEXT DEFAULT 'website'");

  // Existing rows all came through the public form.
  db.exec("UPDATE requests SET source = 'website' WHERE source IS NULL");

  // The relationship was captured once at registration and reused for every
  // request. Copy it down to each request so history stays accurate, then stop
  // reading it from the account.
  db.exec(`
    UPDATE requests
    SET relation = COALESCE(
      relation,
      (SELECT c.relation FROM clients c WHERE c.id = requests.client_id),
      'self'
    )
    WHERE relation IS NULL
  `);

  // Language was stored to choose an email language. The office replies in
  // whatever language the client wrote in, so the stored value only created a
  // second source of truth that could disagree.
  //
  // The column had DEFAULT 'ar', which kept refilling itself on every insert,
  // so the default is dropped along with the values. SQLite cannot alter a
  // default in place, hence the rebuild.
  const cols = db.prepare('PRAGMA table_info(clients)').all();
  const hasLangDefault = cols.some((c) => c.name === 'lang' && c.dflt_value);

  if (hasLangDefault) {
    db.exec(`
      CREATE TABLE clients_new (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        email            TEXT UNIQUE NOT NULL,
        password_hash    TEXT,
        google_id        TEXT UNIQUE,
        full_name        TEXT,
        phone            TEXT,
        relation         TEXT DEFAULT 'self',
        beneficiary_name TEXT,
        email_verified   INTEGER DEFAULT 0,
        verify_token     TEXT,
        lang             TEXT,
        created_at       TEXT DEFAULT (datetime('now'))
      );

      INSERT INTO clients_new
        (id, email, password_hash, google_id, full_name, phone, relation,
         beneficiary_name, email_verified, verify_token, lang, created_at)
      SELECT id, email, password_hash, google_id, full_name, phone, relation,
             beneficiary_name, email_verified, verify_token, NULL, created_at
      FROM clients;

      DROP TABLE clients;
      ALTER TABLE clients_new RENAME TO clients;
      CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
    `);
  } else {
    db.exec('UPDATE clients SET lang = NULL');
  }
};
