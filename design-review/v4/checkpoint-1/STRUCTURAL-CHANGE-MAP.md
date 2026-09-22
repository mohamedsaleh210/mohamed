# Checkpoint 1 — Structural Change Map

Scope: Admin Dashboard, Employees list, Employee Profile, Treasury, Payroll workspace
(`payroll.ejs` + `payroll_run.ejs`). This map lists, file by file, what changed structurally and
what was deliberately left untouched, so a reviewer (or a future session) can verify the "sacred"
list was actually honored.

## Sacred contracts — verified unchanged

| Contract | Verification |
|---|---|
| Routes (paths/methods) | No route file gained/lost/renamed a path. Only `routes/admin/users.js`'s `GET /` handler had its internal SQL `SELECT` extended (see below) — the route itself, `GET /users`, is unchanged. |
| Form actions | Every `<form action="...">` in the 5 rebuilt views is byte-identical to the original. |
| Input names | Every `name="..."` attribute (deposit/withdraw/transfer, payroll item edit, employee create/update/reset, permission checkboxes) preserved verbatim. |
| Permission gates | Every `can('...')`/`requireModule(...)` check in routes is untouched. Every `<% if(can('...')){ %>` in templates preserved at the same points in the logic (moved only where it visually sits, never what it gates). |
| Calculations | `lib/*.js` and the money-math inside `routes/admin/treasury.js` and `routes/admin/payroll.js` (`totals()`, `balance()`, `treasuryBalance()`) were not opened for this checkpoint. All displayed figures are the same server-computed values as before, just laid out differently. New view-only percentages (bar widths) are `value/max*100` computed for CSS `width:` only — never stored, never fed back into a form. |
| IDs/data attributes JS depends on | `#due`, `#empPicker`, `#receiptMethods`, `#txSummary`, `#methodDonut`, `.payroll-editor` field names, `[data-pw]` password-strength hooks — all preserved. New ids (`#tab-*`, `#reset-tr-<id>`, `#emp-<id>`) are additions, not replacements. |

## File-by-file

### `routes/admin/users.js`
- `GET /` — added `LEFT JOIN office_branches ob ON ob.id = users.office_branch_id` and
  `ob.name AS branch_name` to the existing SELECT, to show each employee's real office branch on
  the redesigned list (Section 5 of the brief: "status/role/job title/branch"). This is the one
  functional/data change in this checkpoint — additive only (a new column in an existing read
  query), no route path, permission, or write behavior touched.
  - **Regression found and fixed during this checkpoint**: the added join introduced an
    `ambiguous column name: active` / `created_at` SQLite error (both `users` and
    `office_branches` have those column names). Caught by the automated test suite
    (`/users: adam=500`), not by manual browser testing — the manually-tested dev server was still
    running the pre-edit code in memory. Fixed by qualifying `users.active`/`users.created_at`.
    See TEST-RESULTS.md.

### `public/css/admin.css`
- Appended one new section, "V4 Checkpoint 1 — structural workspace components" (~230 lines):
  new semantic tokens (`--ink-strong`, `--surface-sunken`, `--chip-teal*`, `--hero-grad`) layered
  on the existing `--ink`/`--brass` primitives; `.kpi-hero-row`/`.kpi-primary`/`.kpi-tile`
  (KPI hierarchy); `.attention-list`/`.attention-row` (grouped attention items, replacing
  repetitive identical stat cards); `.bar-compare*` (horizontal proportional bars, with a real
  scaleX entrance animation); `.trend-svg` (inline SVG trend line with a stroke-draw entrance);
  `.identity-chip`/`.id-avatar` (employee identity treatment); `.emp-grid`/`.emp-card`/
  `.emp-toolbar` (responsive card transform + search/filter); `.wtabs*` (native radio-driven
  keyboard-operable tabs); `.ws-layout.with-side` (persistent side/context column);
  `.alert.ok.alert-recede` (success-feedback auto-recede); `.skel` (skeleton, defined but not
  used on these 5 pages — none of their charts are async); `.ws-stagger` (staggered reveal).
  Nothing existing was removed or renamed; every rule is additive.
  - **Regression found and fixed**: `.emp-card`'s role/status chips were first marked up with the
    existing `.btn-row` class, which `responsive-admin.css` (loaded after `admin.css`) turns into
    a 2-column button grid under 620px — stretching the chips into full-width bars. Found live
    while screenshotting the mobile card, fixed by giving the chip row its own class
    (`.emp-card-tags`) instead of fighting the shared rule.

### `public/js/admin.js`
- Added one small block: success alerts (`.alert.ok`) recede after 4s, but only when
  `prefers-reduced-motion` is not set (the timer itself is skipped for reduced-motion users, not
  just its animation). No existing behavior in the file was changed.

### `views/admin/dashboard.ejs`
- Full structural recomposition. Same server-provided variables (`total`, `byStatus`, `financial`,
  `notifications`, `overdueList`, `upcomingList`, `activity`, `unclaimed`, `attention`, filter
  fields) — recomposed into: primary KPI hierarchy (hero balance/total + secondary tiles) →
  requests-requiring-attention grid → real status-distribution bar chart (replacing the flat
  "every status is an identical card" strip) → two-column workspace (notifications + recent
  requests / unclaimed + deadlines + activity, in a persistent side column). Filter form moved
  into a collapsible `<details>` instead of always-open chrome. Added a permission-gated quick-
  actions row using only already-verified permission keys (`requests.create`, `treasury.view`,
  `agenda.view`, `users.manage`).

### `views/admin/users.ejs`
- Full structural recomposition: KPI hierarchy replaces the old flat stat-grid; new search/role/
  status filter toolbar (client-side, over the same already-rendered `users` array — no new
  route); desktop table gets an identity-chip treatment + a new "الفرع" column; a parallel
  `.emp-grid` card layout takes over under 820px (the "responsive card transformation" the brief
  asked for). The reset-password inline form is now generated once by a small EJS helper
  (`resetForm(u, domId)`) and rendered into both the table row and the card, so the real
  `/users/:id/reset` contract (same field names) is defined in exactly one place instead of
  copy-pasted. The large "Add Employee" form and its full permission catalogue are unchanged
  verbatim (still the same fields, same inline JS defaulting logic).

### `views/admin/user_file.ejs`
- The single long stacked page (identity → workload → devices → custody → permissions, all
  concatenated) is reorganized into an identity header + compact context tiles + a 5-tab
  workspace (profile/employment, work/assignments, account/access, custody/assets, permissions),
  using native radio-driven tabs (keyboard-operable with no JS required for the tabs themselves).
  The "account/access" tab now also surfaces `logins` (recent sign-ins) — a value the route
  already fetched (`security.recentFor`) but the old template never rendered. No new query added.
  The real inbound deep-link `#custody` (from `custodies.ejs`, two places) is preserved by a
  small script that checks the radio and scrolls to the panel on that exact hash — verified live.

### `views/admin/treasury.ejs`
- Full structural recomposition into a financial workspace: primary balance hero + incoming/
  outgoing tiles → real payment-channel distribution (horizontal bars from the already-fetched
  `main.byMethod`) → a real net-daily-movement trend chart computed from the already-fetched,
  filtered `rows` (shown only with 4+ distinct days, gated per the ui-ux-pro-max chart-domain
  rule) → the existing deposit/withdraw/transfer tabbed entry workflow, byte-identical in its
  form internals and inline JS (receipt-row cloning, live donut, running-balance preview) → the
  existing filter toolbar and transactions/approvals table, restyled only.

### `views/admin/payroll.ejs`
- KPI hierarchy (latest run net, run count, registered employees) replaces the old flat stat-grid.
  Runs table gets a real paid/total progress bar per row. The run-creation form, the per-employee
  salary-profile editor, and "my payslips" table are unchanged verbatim.

### `views/admin/payroll_run.ejs`
- Adds a genuine "employee payroll table" (name, base, allowances, deductions, net, status) above
  the existing per-employee `<details>` editor blocks — satisfying the brief's "employee payroll
  table; selected employee details" pairing without touching the editor's field names or the
  approve/pay/reverse form contracts. Each table row's "التفاصيل" link opens (not just scrolls to)
  the matching detail card via a small script, verified live. KPI hierarchy + workflow-stage strip
  restyled; nothing in the approval/payment logic touched.
