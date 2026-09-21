// The client confirmed the existing requests, notes and lawyer names were test
// data. Clearing them here (rather than by hand) means every environment —
// local, staging, production — starts from the same clean state exactly once.
exports.up = (db) => {
  db.exec(`DELETE FROM request_notes;`);
  db.exec(`DELETE FROM requests;`);
  db.exec(`DELETE FROM sqlite_sequence WHERE name IN ('requests', 'request_notes');`);

  // Lawyers used to be a comma-separated string in settings. Real lawyer
  // accounts arrive in phase 3; the placeholder goes now.
  db.prepare(`DELETE FROM settings WHERE key = 'lawyers'`).run();

  // The seeded WhatsApp number was a placeholder from another country.
  db.prepare(`UPDATE settings SET value = '' WHERE key = 'whatsapp'`).run();
};
