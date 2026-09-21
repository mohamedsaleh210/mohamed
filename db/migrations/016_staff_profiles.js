const { addColumn } = require('../migrate');

// Staff profiles.
//
// The seeded admin used to exist with nothing but a username, which meant the
// one account that can least afford to be locked out had no way to recover
// itself. Every account now has to complete a profile before it can work.
exports.up = (db) => {
  addColumn(db, 'users', 'national_id', 'TEXT');
  addColumn(db, 'users', 'birth_date', 'TEXT');
  addColumn(db, 'users', 'photo', 'TEXT');
  addColumn(db, 'users', 'profile_completed', 'INTEGER DEFAULT 0');

  // Anyone who already has contact details keeps working uninterrupted; the
  // gate is only for accounts that are genuinely missing them.
  db.exec(`
    UPDATE users
    SET profile_completed = CASE
      WHEN email IS NOT NULL AND email != '' AND phone IS NOT NULL AND phone != ''
      THEN 1 ELSE 0 END
  `);

  // Documents attached by the office rather than the client.
  addColumn(db, 'documents', 'uploaded_by_id', 'INTEGER');
  addColumn(db, 'documents', 'internal', 'INTEGER DEFAULT 0');

  // A checklist step records when the work actually happened, which is not
  // always when somebody remembered to tick it.
  addColumn(db, 'todos', 'done_on', 'TEXT');
  db.exec("UPDATE todos SET done_on = date(done_at) WHERE done_at IS NOT NULL AND done_on IS NULL");
};
