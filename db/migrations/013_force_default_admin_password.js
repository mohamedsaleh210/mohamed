const bcrypt = require('bcryptjs');

// The seeded admin ships with a well-known password so a fresh install can be
// opened at all. Anyone still using it is asked to change it on next sign-in —
// checked against the hash, so an admin who already changed theirs is left
// alone.
exports.up = (db) => {
  const admins = db.prepare("SELECT id, username, password_hash FROM users WHERE role = 'admin'").all();

  admins.forEach((u) => {
    if (bcrypt.compareSync('1234', u.password_hash)) {
      db.prepare('UPDATE users SET must_change_password = 1 WHERE id = ?').run(u.id);
    }
  });
};
