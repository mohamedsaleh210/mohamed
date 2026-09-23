const { db } = require('../db');
const access = require('./access');
const casesLib = require('./cases');

/**
 * What the AI assistant is allowed to read.
 *
 * The assistant must never see more than the person asking it could see
 * themselves by clicking around the panel — so every module here reuses the
 * exact same scoping the human-facing routes use (visibleRequestFilter,
 * cases.visibleFilter, the same ability checks) rather than re-deriving it.
 * A module also only runs at all when it is both switched on in the AI
 * settings (the office's own ceiling on what the assistant may touch at
 * all) AND the asking user actually holds the matching ability — the
 * intersection the business rule requires, not either one alone.
 */
const MODULES = {
  requests: {
    label: 'الطلبات',
    allowed: () => true, // scoped per-user below, not gated by one ability
    summarize(user, limit = 12) {
      const f = access.visibleRequestFilter(user);
      const money = access.holds(user, 'money.view');
      const rows = db
        .prepare(
          `SELECT r.ref, r.name, r.status, r.service_label, r.created_at${money ? ', r.total_amount, r.paid_amount' : ''}
           FROM requests r WHERE r.archived_at IS NULL ${f.sql} ORDER BY r.created_at DESC LIMIT ?`
        )
        .all(...f.params, limit);
      return rows;
    },
  },
  cases: {
    label: 'القضايا',
    allowed: () => true,
    summarize(user, limit = 12) {
      const f = casesLib.visibleFilter(user, 'c');
      return db
        .prepare(`SELECT c.file_no, c.title, c.status, c.court, c.opened_on FROM legal_cases c WHERE 1=1 ${f.sql} ORDER BY c.opened_on DESC LIMIT ?`)
        .all(...f.params, limit);
    },
  },
  clients: {
    label: 'العملاء',
    allowed: (user) => access.holds(user, 'clients.directory'),
    summarize(user, limit = 12) {
      return db.prepare(`SELECT full_name, phone, email, created_at FROM clients ORDER BY created_at DESC LIMIT ?`).all(limit);
    },
  },
  money: {
    label: 'الفلوس والخزنة',
    allowed: (user) => access.holds(user, 'money.view'),
    summarize(user, limit = 12) {
      return db
        .prepare(
          `SELECT p.amount, p.method, p.created_at, r.ref, r.name
           FROM payments p JOIN requests r ON r.id = p.request_id
           WHERE p.voided_at IS NULL ORDER BY p.created_at DESC LIMIT ?`
        )
        .all(limit);
    },
  },
  agenda: {
    label: 'الأجندة والمواعيد',
    allowed: (user) => access.holds(user, 'agenda.view'),
    summarize(user, limit = 12) {
      return db
        .prepare(`SELECT title, event_type, status, starts_at FROM agenda_events WHERE status NOT IN ('completed','cancelled') ORDER BY starts_at LIMIT ?`)
        .all(limit);
    },
  },
  payroll: {
    label: 'المرتبات',
    allowed: () => true, // self-scoped below; view_all widens it, nothing widens beyond that
    summarize(user, limit = 6) {
      if (access.holds(user, 'payroll.view_all')) {
        return db
          .prepare(
            `SELECT pi.employee_name, pr.period, pi.net_amount FROM payroll_items pi
             JOIN payroll_runs pr ON pr.id = pi.payroll_run_id ORDER BY pi.id DESC LIMIT ?`
          )
          .all(limit);
      }
      if (access.holds(user, 'payroll.view_own')) {
        return db
          .prepare(
            `SELECT pr.period, pi.net_amount FROM payroll_items pi
             JOIN payroll_runs pr ON pr.id = pi.payroll_run_id WHERE pi.user_id = ? ORDER BY pi.id DESC LIMIT ?`
          )
          .all(user.id, limit);
      }
      return [];
    },
  },
};

const MODULE_KEYS = Object.keys(MODULES);

/**
 * Builds the assistant's context: for every module the office has switched
 * on in AI settings AND this specific user is actually allowed to see, a
 * short labelled summary. A module the office enabled but this user cannot
 * see contributes nothing — same as it would render nothing in their panel.
 */
function buildContext(user, enabledModules) {
  const sections = [];
  MODULE_KEYS.forEach((key) => {
    if (!enabledModules.includes(key)) return;
    const mod = MODULES[key];
    if (!mod.allowed(user)) return;
    let rows;
    try {
      rows = mod.summarize(user, key === 'payroll' ? 6 : 12);
    } catch (err) {
      console.error(`AI context module "${key}" failed:`, err.message);
      return;
    }
    if (!rows.length) return;
    sections.push({ key, label: mod.label, rows });
  });
  return sections;
}

module.exports = { MODULES, MODULE_KEYS, buildContext };
