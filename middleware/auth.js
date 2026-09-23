const { db } = require('../db');

/** Signed in at all. */
function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect(req.adminPath + '/login');
  }

  // A deactivated account keeps its history but loses access immediately,
  // even if its session cookie is still valid.
  const fresh = db
    .prepare(
      `SELECT id, role, active, must_change_password, profile_completed, email, phone,
              national_id, birth_date, photo, display_name, legal_name,
              id_front, id_back, username, is_super_admin, office_branch_id,
              assign_locked, assign_lock_reason, assign_lock_until
       FROM users WHERE id = ?`
    )
    .get(req.session.user.id);

  if (!fresh || !fresh.active) {
    return req.session.destroy(() => res.redirect(req.adminPath + '/login?msg=disabled'));
  }

  req.session.user.must_change_password = !!fresh.must_change_password;
  req.session.user.photo = fresh.photo || null;

  const permissions = require('../lib/permissions');
  /*
   * Resolved from the database row, not the session.
   *
   * The refresh query used to omit `role`, so a demotion applied while somebody
   * was signed in had no effect until they signed out — they kept the abilities
   * of a job they no longer held. Reading it here means a permission change
   * takes effect on their very next click.
   */
  const granted = permissions.resolve(db, { id: fresh.id, role: fresh.role, is_super_admin: fresh.is_super_admin });

  req.session.user.role = fresh.role;
  req.session.user.is_super_admin = !!fresh.is_super_admin;
  req.session.user.office_branch_id = fresh.office_branch_id || null;
  req.permissions = granted;
  req.userCan = (key) => granted.has(key);

  /*
   * Carried on a per-request copy, never on the session itself.
   *
   * A Set cannot be serialised into the session store: writing it there means
   * it comes back as an empty object on the next request, and every ability
   * check silently answers "no" — or worse, falls back to a stale role.
   */
  req.user = { ...req.session.user, abilities: granted };
  res.locals.user = req.user;

  // Templates ask the same question the routes do.
  res.locals.can = req.userCan;
  res.locals.isSuperAdmin = permissions.isSuperAdmin(req.user);
  res.locals.permissions = granted;

  // Accounts created by an admin start with a temporary password. Until it is
  // replaced, every page redirects to the change-password form.
  // Sanad owner SSO is an audited, short-lived support session. It must not be
  // blocked by the tenant manager's personal first-login checklist; otherwise
  // "استيراد بياناتها" lands on account setup instead of the requested tool.
  if (fresh.must_change_password && !req.session.platformOwnerAccess && !req.path.startsWith('/account')) {
    return res.redirect(req.adminPath + '/account?force=1');
  }

  // A profile without contact details means an account that cannot recover
  // itself and actions nobody can attribute later. Both matter enough to stop
  // work until they are filled.
  const profile = require('../lib/profile');

  // An admin must keep reaching the settings screen even while their own
  // profile is incomplete — otherwise switching the ID requirement on locks
  // out the only person who can switch it off again.
  // Every active staff account may be assigned to a request. Page-level access
  // remains scoped by assignment and named permissions in the route itself.

  const isSanadOwner = !process.env.TENANT_ID && fresh.role === 'admin' && fresh.username === 'adam';
  const alwaysOpen =
    isSanadOwner ||
    req.session.platformOwnerAccess ||
    req.path.startsWith('/account') ||
    (req.session.user.role === 'admin' && req.path.startsWith('/settings'));

  if (!profile.isComplete(fresh) && !alwaysOpen) {
    return res.redirect(req.adminPath + '/account/profile?force=1');
  }

  next();
}

/** Admin only — account management, content, settings. */
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).render('admin/denied');
  }
  next();
}

/** Any staff member with a lawyer role or above. */
/**
 * An accountant sees the money and nothing else.
 *
 * Kept separate from requireStaff because the whole point of the role is that
 * it is not case-handling staff: no client files, no documents, no requests.
 */
function requireAccounting(req, res, next) {
  if (!req.session.user || !['admin', 'supervisor', 'accountant'].includes(req.session.user.role)) {
    return res.status(403).render('admin/denied');
  }
  next();
}

/**
 * Gates a route on a named ability.
 *
 * Every route says which permission it needs, and the answer comes from one
 * place. Adding an ability means adding it to the catalogue and naming it here
 * — not writing another role comparison.
 */
function can(permission) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect(req.adminPath + '/login');
    if (req.userCan && req.userCan(permission)) return next();
    return res.status(403).render('admin/denied');
  };
}

function requireStaff(req, res, next) {
  if (!req.session.user || !['admin', 'supervisor', 'lawyer'].includes(req.session.user.role)) {
    return res.status(403).render('admin/denied');
  }
  next();
}

/** Admin or supervisor — day-to-day operations. */
function requireSupervisor(req, res, next) {
  if (!req.session.user || !['admin', 'supervisor'].includes(req.session.user.role)) {
    return res.status(403).render('admin/denied');
  }
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireSupervisor,
  requireStaff,
  requireAccounting,
  can,
};
