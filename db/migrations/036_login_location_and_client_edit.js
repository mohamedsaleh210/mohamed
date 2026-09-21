const { addColumn } = require('../migrate');

exports.up = (db) => {
  addColumn(db, 'login_history', 'latitude', 'REAL');
  addColumn(db, 'login_history', 'longitude', 'REAL');
  addColumn(db, 'login_history', 'location_accuracy', 'REAL');
  addColumn(db, 'login_history', 'location_status', "TEXT DEFAULT 'not_requested'");
  addColumn(db, 'login_history', 'location_captured_at', 'TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_login_location ON login_history(user_id, location_status, id DESC)');
};
