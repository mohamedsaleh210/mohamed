const { addColumn } = require('../migrate');

/**
 * Two things that cannot be indexed as written:
 *
 *  - phone numbers arrive as +2010…, 0010…, 010…, so they were matched with
 *    LIKE '%last9', which forces a full scan;
 *  - free-text search across ref/name/phone/email used LIKE '%term%', which no
 *    ordinary index can help with.
 *
 * The first is solved by storing the comparable digits once. The second by an
 * FTS5 table kept in step with triggers, so search stays fast at any size.
 */
exports.up = (db) => {
  addColumn(db, 'requests', 'phone_key', 'TEXT');

  db.exec(`
    UPDATE requests SET phone_key =
      substr(replace(replace(replace(phone,'+',''),' ',''),'-',''),
             max(1, length(replace(replace(replace(phone,'+',''),' ',''),'-','')) - 8))
  `);

  // LIKE '%digits' cannot use an index; the stored key can.
  db.exec('CREATE INDEX IF NOT EXISTS idx_requests_phone_key ON requests(phone_key)');

  // A standalone FTS table rather than an external-content one.
  //
  // External content is smaller, but it requires every delete to replay the
  // exact original values; if a column is written before the trigger sees it,
  // the index and the table disagree and SQLite reports corruption. A
  // standalone table costs some disk and cannot get into that state.
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS requests_fts USING fts5(
      ref, name, phone, email, title, message,
      tokenize='unicode61 remove_diacritics 2'
    );
  `);

  db.exec(`
    INSERT INTO requests_fts(rowid, ref, name, phone, email, title, message)
    SELECT id,
           COALESCE(ref,''), COALESCE(name,''), COALESCE(phone,''),
           COALESCE(email,''), COALESCE(title,''), COALESCE(message,'')
    FROM requests;
  `);

  // Triggers rather than application code, so nothing can write a request and
  // forget to index it.
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS requests_fts_insert AFTER INSERT ON requests BEGIN
      INSERT INTO requests_fts(rowid, ref, name, phone, email, title, message)
      VALUES (new.id, COALESCE(new.ref,''), COALESCE(new.name,''), COALESCE(new.phone,''),
              COALESCE(new.email,''), COALESCE(new.title,''), COALESCE(new.message,''));
    END;

    CREATE TRIGGER IF NOT EXISTS requests_fts_delete AFTER DELETE ON requests BEGIN
      DELETE FROM requests_fts WHERE rowid = old.id;
    END;

    -- Scoped to the columns that are actually indexed. Without this, the
    -- phone_key trigger's own UPDATE would re-fire this one and try to insert
    -- a row that is already there.
    CREATE TRIGGER IF NOT EXISTS requests_fts_update
    AFTER UPDATE OF ref, name, phone, email, title, message ON requests BEGIN
      DELETE FROM requests_fts WHERE rowid = new.id;
      INSERT INTO requests_fts(rowid, ref, name, phone, email, title, message)
      VALUES (new.id, COALESCE(new.ref,''), COALESCE(new.name,''), COALESCE(new.phone,''),
              COALESCE(new.email,''), COALESCE(new.title,''), COALESCE(new.message,''));
    END;
  `);

  // Keeps phone_key correct without the application having to remember.
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS requests_phone_key_insert AFTER INSERT ON requests BEGIN
      UPDATE requests SET phone_key =
        substr(replace(replace(replace(new.phone,'+',''),' ',''),'-',''),
               max(1, length(replace(replace(replace(new.phone,'+',''),' ',''),'-','')) - 8))
      WHERE id = new.id;
    END;

    CREATE TRIGGER IF NOT EXISTS requests_phone_key_update AFTER UPDATE OF phone ON requests BEGIN
      UPDATE requests SET phone_key =
        substr(replace(replace(replace(new.phone,'+',''),' ',''),'-',''),
               max(1, length(replace(replace(replace(new.phone,'+',''),' ',''),'-','')) - 8))
      WHERE id = new.id;
    END;
  `);

  db.exec('ANALYZE');
};
