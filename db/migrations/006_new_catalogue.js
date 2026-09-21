// Replaces the original demo catalogue with the client's real service list.
// Requests keep their `service_label` text, so historical requests still read
// correctly even though the service row they pointed at is gone.
exports.up = (db) => {
  const hasRequests = db.prepare('SELECT 1 FROM requests LIMIT 1').get();
  if (hasRequests) {
    db.prepare('UPDATE requests SET service_id = NULL').run();
  }

  db.prepare('DELETE FROM services').run();
  db.prepare('DELETE FROM categories').run();
  db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('services','categories')").run();

  require('../seed').insertCatalogue();
};
