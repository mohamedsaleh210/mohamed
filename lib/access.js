const { db } = require('../db');
const permissions = require('./permissions');

/**
 * Who may see and do what, expressed in abilities rather than role names.
 *
 * These used to be role comparisons — `['admin','supervisor'].includes(role)` —
 * which meant granting one lawyer the right to see fees was impossible without
 * making them a supervisor. Now the question is what the person may do, and the
 * answer comes from the permission catalogue.
 */

/** Resolves a user's abilities, whether or not they were already computed. */
function abilitiesOf(user) {
  if (!user) return new Set();
  if (user.abilities instanceof Set) return user.abilities;
  if (user.role) return permissions.resolve(db, user);
  return new Set();
}

const holds = (user, key) => abilitiesOf(user).has(key);

/**
 * Which requests a staff member may see.
 *
 * Without `requests.view_all` a person sees only what they are assigned — the
 * filter lives here so no query can forget it.
 */
function visibleRequestFilter(user) {
  if (!user) return { sql: ' AND 0 ', params: [] };
  if (holds(user, 'requests.view_all')) return { sql: '', params: [] };

  return {
    sql: ' AND r.id IN (SELECT request_id FROM request_assignees WHERE user_id = ?) ',
    params: [user.id],
  };
}

function canSeeRequest(user, requestId) {
  if (!user) return false;
  if (holds(user, 'requests.view_all')) return true;

  return !!db
    .prepare('SELECT 1 FROM request_assignees WHERE request_id = ? AND user_id = ?')
    .get(requestId, user.id);
}

const canSeePayments = (user) => holds(user, 'money.view');
const canEditFees = (user) => holds(user, 'money.fees');
const canRecordPayments = (user) => holds(user, 'money.payments');

/** Assigning: anyone with the ability; a lawyer may still add a colleague. */
const canAssign = (user) => holds(user, 'requests.assign') || (!!user && user.role === 'lawyer');

/** Removing an assignment is separate, so lawyers cannot drop each other. */
const canUnassign = (user) => holds(user, 'requests.assign');

const canArchive = (user) => holds(user, 'requests.archive');

/** An expense may only be added to a file the person actually works on. */
function canAddExpense(user, requestId) {
  if (!holds(user, 'expenses.add')) return false;
  return canSeeRequest(user, requestId);
}

const canSeeAllExpenses = (user) => holds(user, 'expenses.view_all');

module.exports = {
  abilitiesOf,
  holds,
  visibleRequestFilter,
  canSeeRequest,
  canSeePayments,
  canEditFees,
  canRecordPayments,
  canAssign,
  canUnassign,
  canArchive,
  canAddExpense,
  canSeeAllExpenses,
};
