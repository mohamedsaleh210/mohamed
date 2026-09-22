# Checkpoint 1 — Visual Decisions

How each item in the brief's visual target list was actually addressed, page by page. Screenshots
referenced are in `screenshots/before/` and `screenshots/after/`.

## Against the visual target checklist

- **Professional navy/teal + restrained brass** — kept the existing `--ink`/`--brass` primitives
  (independently validated as the right pairing for this product category — see
  `UIUX-PRO-MAX-USAGE.md` item 6) and added a small set of *semantic* tokens on top
  (`--ink-strong`, `--chip-teal`, `--hero-grad`) rather than a new palette. Brass is now reserved
  for the single most important number on a page (the KPI-hero value) instead of being reused
  everywhere, which is what makes it read as an accent again instead of wallpaper.
- **Richer information hierarchy** — every page now has a visually distinct primary figure (the
  dark hero card), a secondary tier (`.kpi-tile`), and a tertiary tier (`.attention-row`/table
  rows) — three visual weights where the old pages had exactly one (`.stat`, repeated).
- **Fewer repetitive generic stat cards** — direct fix for the audit's root-cause finding
  (`docs/SANAD-V4-UIUX-AUDIT-AND-HANDOFF.md` §3): the dashboard's four identical financial stat
  cards became one hero + a compact tile row; the six identical "attention" stat cards became a
  grouped `.attention-list`; the status strip became an actual chart (see next point).
- **Meaningful charts/data visualization** — this is the single biggest lever from the audit. New
  real charts, every one backed by already-fetched, real data (never invented):
  - Dashboard: request-status horizontal bar chart (`byStatus`/`STATUS`).
  - Treasury: payment-channel distribution bars (`main.byMethod`) + a net-daily-movement trend
    line (computed from the already-filtered `rows`, shown only with 4+ real data points).
  - Payroll run: a paid/total progress bar per run row.
  All three chart types were chosen by actually querying `ui-ux-pro-max`'s chart domain rather
  than guessing — see `UIUX-PRO-MAX-USAGE.md` items 3–5.
- **Professional workspace composition** — Treasury and the Employee Profile are now genuine
  workspaces (persistent balance/identity context + tabbed or side-panel detail), not a single
  scroll of stacked panels.
- **Contextual SVG icons** — every new component (KPI tiles, attention rows, tab labels) uses the
  existing icon sprite (`/images/icons.svg`), matched to its meaning (wallet for balance, list for
  requests, lock for access, briefcase for custody) — no new icon set introduced.
- **Grouped information** — Employee Profile's five tabs (profile/employment, work, account/
  access, custody, permissions) are a direct grouping of what used to be five stacked panels with
  only a `#hash` jump-nav between them.
- **Useful side/detail panels** — Dashboard's `.ws-layout.with-side` keeps unclaimed requests,
  deadlines, and recent activity in a persistent, sticky side column instead of interleaved with
  the main list. Payroll run's new overview table + existing detail cards form an explicit
  master/detail pair.
- **Compact but readable tables** — the Employees desktop table gained an identity-chip column
  (avatar-by-initials + name + job title in one compact cell) instead of three separate loosely-
  related lines of text.
- **Stronger Arabic typography hierarchy** — KPI hero figures now render at 32px/700 weight vs.
  13px/600 labels (previously every number on a dashboard card was the same 22px) — a real
  modular scale, per `UIUX-PRO-MAX-USAGE.md` item 1/7's font-scale guidance, applied without
  changing the underlying Tajawal typeface (a deliberate, already-established identity choice —
  not reopened this checkpoint).
- **Less empty visual space** — the old dashboard's page-head-to-first-card gap and the six
  identical attention cards each padded with a big icon are gone; the new hero/tile layout uses
  the same horizontal space to show more distinct information instead of more whitespace around
  identical shapes.
- **Institutional/legal/business character, no generic SaaS-template feel** — avoided the
  "generic dashboard" tropes explicitly (no card-with-sparkline-behind-a-gradient decoration, no
  unlabeled donut with a color legend only): the treasury donut/bars/trend line always carry a
  visible number, never color alone (an explicit ui-ux-pro-max accessibility rule — see usage log
  item 3). The KPI hero's dark navy gradient with a restrained brass glow is the one deliberately
  "designed" surface per page — everything else stays close to the plain, dense, working-document
  character the rest of the app already has, rather than skinning every panel.

## Per-page before/after summary

- **Dashboard** (`before/dashboard-1440.png` → `after/dashboard-1440.png`): four uniform financial
  cards + three uniform operational cards + six uniform attention cards + a flat status list all
  became: one hero balance + a compact tile row + a grouped attention list + a real bar chart —
  same total information, visibly restructured, not recolored.
- **Employees list** (`before/employees-list-1440.png` / `-390.png` →
  `after/employees-list-1440.png` / `-390.png`): a single dense table with no search/filter became
  a searchable/filterable roster with identity chips, plus a genuinely separate card layout under
  820px (verified live, not just a CSS media-query claim — see `TEST-RESULTS.md` §2).
- **Employee Profile** (`before/employee-profile-1440.png` →
  `after/employee-profile-1440.png`): one long scroll of five stacked panels became an identity
  header + context tiles + a 5-tab workspace; the real `#custody` deep-link from `custodies.ejs`
  still lands on (and opens) the right tab — verified live with a screenshot at 390px.
- **Treasury** (`before/treasury-1440.png` → `after/treasury-1440.png`): a flat stat-grid above an
  entry form became a real financial workspace: hero balance, channel distribution, trend chart,
  then the same entry/approval workflow, restyled.
- **Payroll** (`before/payroll-1440.png`, `before/payroll-run-1440.png` →
  `after/payroll-1440.png`, `after/payroll-run-1440.png`): the run list gained a real progress bar
  per run; the run-detail page gained a genuine employee payroll table feeding into the existing
  per-employee detail cards (master/detail, not just a longer scroll).

## What was deliberately NOT changed visually

- The deposit/withdraw/transfer entry forms' field layout, the payroll item editor's field
  layout, and the permission-catalogue editor on the Employees page — these are dense data-entry
  surfaces whose current form-grid layout is already appropriate for their job; restyling them
  further was judged unnecessary risk for this checkpoint's scope (visual structure, not every
  control) and is left for a later pass if requested.
- Print/export outputs (`report_print.ejs`, payslip `print` route) — per the handoff's own
  page-classification (§10, "PRESERVE"), print surfaces stay minimal/print-safe and were not
  touched.
