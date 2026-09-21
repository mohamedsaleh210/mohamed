const { addColumn } = require('../migrate');

// Staff identity, deadline alerts, and notification priority.
exports.up = (db) => {
  // Two names, because they serve different purposes: the legal name has to
  // match the ID card for anything the office signs or files, while colleagues
  // need something short enough to read in a comment thread.
  addColumn(db, 'users', 'legal_name', 'TEXT');
  addColumn(db, 'users', 'id_front', 'TEXT');
  addColumn(db, 'users', 'id_back', 'TEXT');

  // Existing accounts keep their display name as the legal name until the
  // person corrects it — better than blanking a field somebody already filled.
  db.exec("UPDATE users SET legal_name = display_name WHERE legal_name IS NULL");

  // Some offices photograph ID cards, some do not. Default on; the admin can
  // switch it off without a code change.
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('staff_id_required', '1')").run();

  // A missed deadline is not the same kind of event as a new comment, and the
  // inbox should not treat them alike.
  addColumn(db, 'notifications', 'priority', "TEXT DEFAULT 'normal'");

  // Records that an overdue alert has already gone out, so the same slipped
  // deadline is not announced every few hours. Cleared whenever the date moves.
  addColumn(db, 'requests', 'deadline_alerted_at', 'TEXT');
};
