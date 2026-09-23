const { addColumn } = require('../migrate');

/*
 * Super Admin: a protected subset of the existing `admin` role, not a new
 * role string — renaming `admin` itself would touch every hardcoded
 * `role === 'admin'` check across auth, cases, and the demo seed. Instead
 * `is_super_admin` marks which admin accounts are the ones nobody (not even
 * another admin) can edit, disable, or demote, and who alone may configure a
 * regular admin's permissions.
 *
 * Just the column here — on a fresh database this migration runs before the
 * first admin account even exists (migrate() runs ahead of seed()/demo
 * seeding), so bootstrapping "make someone Super Admin" has to happen in
 * seed.js instead, which runs on every boot and only writes when something
 * is missing. See seed.js for where exactly one Super Admin gets guaranteed.
 */
exports.up = (db) => {
  addColumn(db, 'users', 'is_super_admin', 'INTEGER NOT NULL DEFAULT 0');
};
