# Phase 2 — Operations checkpoint evidence

Branch: `uiux/phase-2-v3-integration`. This checkpoint covers **Requests, Cases,
Clients/Companies, Employees, Permissions** — the second batch after the
approved Foundation + Admin Shell + Dashboard checkpoint. Screenshots below
are real Playwright/Chromium captures of the actual running application
(demo data, `adam`/admin login unless noted), not the standalone
`design-preview/` prototypes.

Directory layout:
```
operations/
  requests-ar-{1440,390}.png, requests-en-1440.png
  requests/request-detail-ar-{1440,390}.png
  cases-ar-{1440,390}.png, cases-en-1440.png
  cases/case-detail-ar-{1440,390}.png
  clients-ar-{1440,390}.png, clients-en-1440.png
  clients/client-detail-ar-{1440,390}.png
  clients/companies-ar-{1440,390}.png
  clients/company-detail-ar-{1440,390}.png
  employees/users-ar-{1440,390}.png, employees/users-en-1440.png
  employees/user-file-ar-{1440,390}.png
  permissions/permissions-ar-{1440,390}.png
```

## Per-page decision log

### Requests list — `views/admin/requests.ejs`
- **Functionality preserved:** every filter (search, party, company, branch,
  status checklist, employee), quick-filter date pills, the urgent filter,
  archived/active tabs, export (Excel/PDF, permission-gated), pagination —
  all conditional blocks, hrefs, and query-string building untouched (diffed
  against `origin/main`, confirmed).
- **Visual changes:** replaced the Unicode-glyph/emoji icons (🔴 urgent pill,
  💬/📎 comment/document chips, 🔍 empty state) with the approved SVG icon
  system; added a 2-card KPI strip (only shown on the unarchived view).
- **KPI source:** both cards use numbers the route already computes —
  `total` (the current filtered result count, already shown in the pager)
  and `criticalCount` (the real open-urgent count, already shown in the
  existing urgent quick-filter pill). No new query or calculation was added.
- **Motion added:** page-head reveal (global), KPI count-up on the two
  cards, staggered KPI card entrance.
- **Responsive result:** 0 overflow at all 11 breakpoints (320–1440).
- **RTL/LTR result:** verified via the app's own `session.lang` mechanism;
  structural mirroring intact.
- **Not copied from V3 preview:** the preview's simplified single always-4-KPI
  row was not applied — only 2 cards are shown, and only using numbers the
  real route already had, per the "no invented metrics" rule.

### Request detail — `views/admin/request_detail.ejs`
- **Functionality preserved:** this is the most JS-fragile real page in the
  app — the right column's action-picker (`#requestActionPicker`) matches
  panel visibility by reading each panel's `<h3>` `textContent`. Verified by
  Playwright after the icon change that selecting every option in the picker
  still shows exactly the right panel and hides the rest (tested `الأتعاب`
  explicitly; confirmed `إيقاف احتساب المدة` and `الإصدار والانتهاء والتجديد`
  correctly stay always-visible, as they did before, since they aren't in the
  picker's matched list). Every form action, input name, and permission
  check (`can(...)`) is byte-identical to `origin/main`.
- **Visual changes:** every one of the ~20 panel headings (client, other
  requests, documents, comments, audit trail, actions, status, time-pause,
  fees, priority/urgent, payments, services, expenses, destinations, custom
  request, deadline, renewal dates, team, client requirements, execution
  steps) got a matching SVG icon; the 🔴 urgent-priority glyph became an
  `i-alert-triangle` icon (verified the action-picker's text-matching still
  resolves correctly with the icon present, since `textContent` only
  includes the actual text nodes). Added a native `#hash` anchor "jump to
  section" nav bar for the left column (client/other-requests/documents/
  comments/log) plus a jump to the right column's action panel — no JS
  state, so it can never hide content or break independently of the
  existing action-picker.
- **KPI source/chart purpose:** none added — a single request has no series
  to plot, matching the same reasoning already established in Phase 1.
- **Motion added:** page-head reveal; the new anchor nav uses the existing
  `.qf` pill component's hover/focus styling, no new motion primitive.
- **Responsive result:** 0 overflow at all 11 breakpoints.
- **RTL/LTR result:** verified structurally; the anchor nav pills wrap
  correctly on mobile.
- **Not copied from V3 preview:** the preview's simpler single-panel
  request-detail mockup was not used as a structural template — every real
  panel, form, and permission gate stayed exactly as in production.

### Cases list — `views/admin/cases.ejs`
- **Functionality preserved:** search, status filter, category-add form —
  untouched.
- **Visual changes:** the page already used the correct `.stat-grid`/`.stat`
  KPI component (unlike the V2-era prototype issue noted in Phase 1's
  README, which was about the *design-preview* mockup, not this real page);
  only the 7 per-status Unicode glyphs (▤◍⚖⚡⏸✓) were replaced with SVG
  icons, one per real case status.
- **KPI source:** the same real per-status `counts` array the route already
  computed and rendered — values unchanged, only the icon and a count-up
  animation were added.
- **Motion added:** KPI count-up + staggered entrance (global CSS, no
  page-specific script).
- **Responsive result:** 0 overflow at all 11 breakpoints.
- **RTL/LTR result:** verified.
- **Not copied from V3 preview:** n/a — this page already matched the
  intended KPI pattern before this pass.

### Case detail — `views/admin/case_detail.ejs`
- **Functionality preserved:** every form (case data, hearings, legal
  events/memoranda, team assignment, tasks, parties) — all POST actions,
  field names, and `can()` gates untouched.
- **Visual changes:** icons added to all 6 panel headings; added the same
  native `#hash` anchor "jump to section" nav pattern used on request
  detail (بيانات القضية / الجلسات / السجل القانوني / فريق القضية / الأعمال /
  الأطراف).
- **KPI source/chart purpose:** the existing `.case-kpis` info bar
  (client/case number/court/next hearing) is informational text, not
  numeric — left as-is, no count-up applied (nothing there is a count).
- **Motion added:** page-head reveal, anchor-nav.
- **Responsive result:** 0 overflow at all 11 breakpoints.
- **RTL/LTR result:** verified.
- **Deliberately not touched:** `views/admin/case_report.ejs` — reviewed
  and left completely untouched. It is a standalone print/PDF document (own
  `<html>`, own inline stylesheet, does not load `admin.css` or the sidebar
  shell at all) — out of scope for the same reason Phase 1 kept print
  templates out of the visual-identity pass.

### Clients list — `views/admin/clients.ejs`
- **Functionality preserved:** search, sort pills, export, pagination —
  untouched.
- **Visual changes:** 👤 empty-state emoji replaced with `i-user`; added a
  single KPI card (real `total` count, same number already shown in the
  page's subtitle text before this pass — moved into a KPI card instead of
  prose for stronger hierarchy, not a new number).
- **KPI source:** `total`, already computed by the route.
- **Motion added:** KPI count-up, page-head reveal.
- **Responsive result:** 0 overflow. **RTL/LTR:** verified.

### Client profile — `views/admin/client.ejs`
- **Functionality preserved:** edit-client form, delete-client danger
  panel (confirmation-phrase safeguard untouched), requests table — all
  identical to production.
- **Visual changes:** the page already had a real `.stat-grid` with
  Unicode-glyph icons (▤◔✓✕%▤) for total/open/completed/cancelled/fees/
  remaining — all swapped for SVG icons (list/clock/check-circle/x-circle/
  receipt/wallet); ✎ edit-icon glyph replaced with `i-edit`.
- **KPI source:** unchanged — `requests.length`, `open.length`, `done`,
  `cancelled`, `totals.billed`, `totals.billed - totals.paid`, all already
  computed by the route from the same `requests` array rendered in the
  table below.
- **Motion added:** KPI count-up on all 6 cards, staggered entrance.
- **Responsive result:** 0 overflow. **RTL/LTR:** verified. Confirmed as a
  **lawyer** account (no `showMoney`) that the fee/remaining KPI cards
  correctly stay hidden — same conditional as before, unaffected.

### Companies list — `views/admin/companies.ejs`
- **Functionality preserved:** search, add-company form — untouched.
- **Visual changes:** added one real KPI card (`rows.length`, the same
  count already shown in the existing chip); panel-head icons.
- **Responsive/RTL-LTR:** verified, 0 overflow.

### Company profile — `views/admin/company.ejs`
- **Functionality preserved:** add-branch form, per-company service
  checklist, add-contact form — all identical.
- **Visual changes:** added a 3-card KPI strip (branches/requests/contacts
  — all `.length` of arrays the route already passed for the tables directly
  below them); panel-head icons throughout.
- **Responsive/RTL-LTR:** verified, 0 overflow, confirmed on the densest
  page in this batch (services checklist has ~50 checkboxes).

### Employees list — `views/admin/users.ejs`
- **Functionality preserved:** account creation form with its full
  role-based permission-default JS (`applyRole`/`updateSummary`), password
  reset flow, activate/deactivate toggles — all untouched (diffed).
- **Visual changes:** added a KPI strip (total/active/stopped/incomplete-
  profile — all real tallies of the same `users` array already rendered in
  the table, mirroring how Phase 1 justified identical dashboard KPIs);
  added icons to the two panel heads and to each of the 13 real permission
  groups (mapped from `lib/permissions.js`'s actual catalogue labels) in
  the inline "add employee" permissions editor.
- **KPI source:** `users.length`, `.filter(u => u.active)`, etc. — same
  array, no new query.
- **Motion added:** KPI count-up, staggered entrance.
- **Responsive/RTL-LTR:** verified, 0 overflow.

### Employee profile — `views/admin/user_file.ejs`
- **Functionality preserved:** edit-employee form, access-card issuance,
  workload/devices/custody statements — all identical; this page already
  had all the real relationship data the brief asks for (assigned requests,
  money owed to them, devices/sign-ins, custody and expense statement,
  effective-permissions summary) — nothing invented.
- **Visual changes:** icons on all 7 panel headings; ✎ edit-icon glyph
  replaced; added the same native anchor "jump to section" nav pattern.
- **KPI/chart source:** the existing `.pay-totals` key-value summaries
  (custody received/spent/returned/remaining) are already real aggregate
  figures from `custodyStatement.totals` — left as their existing
  component, not converted to `.stat-grid`, since they are a distinct,
  already-correct component for a 4-value settlement summary.
- **Responsive/RTL-LTR:** verified, 0 overflow.

### Permissions — `views/admin/permissions.ejs`
- **Functionality preserved:** the per-employee permission-override form —
  every checkbox `name`/`value`, the admin-has-no-list guard, and the
  "from role" tag logic are untouched.
- **Visual changes:** each of the 13 real permission groups (from
  `lib/permissions.js`'s actual catalogue — `الطلبات`, `إدارة مكتب المحاماة`,
  `الفلوس`, `المصاريف`, `تقييم الموظفين`, `المرتبات والمكافآت والحوافز`,
  `العملاء`, `المشاوير`, `أجندة الأعمال والتجديدات`, `الدعم الفني`,
  `المحتوى`, `الحذف النهائي`, `الإدارة`) got a matching SVG icon.
- **No roles or permissions invented:** every group/permission label
  rendered comes directly from the real catalogue; the icon map only adds a
  decorative glyph next to text that already existed.
- **Responsive/RTL-LTR:** verified, 0 overflow.

## Test results (full suite, re-run after this batch)

| Suite | Result |
|---|---|
| `npm test` | 974/974 passed |
| `npm run test:imports` | 21/21 passed |
| `npm run security` | 138/138 passed |
| `npm run integration` | 74/74 passed |
| `npm run edge` | 178/178 passed |

## Responsive matrix

11 breakpoints (320/360/375/390/414/430/768/820/1024/1280/1440) × 11 pages
(requests, request-detail, cases, case-detail, clients, client-detail,
companies, company-detail, users, user-file, permissions) against the live
app = **121/121 clean, 0 overflow.**

## Motion / interaction QA

Ran in both normal-motion and emulated `prefers-reduced-motion: reduce`:
KPI count-up final-value correctness (tested on both a zero-value and a
real 57-value card), the new anchor "jump to section" nav (scroll + target
existence), and the existing sidebar drawer open/Escape-close/focus-move
(spot-checked on a newly-touched page to confirm the shared shell still
works identically here) — **12/12 passed in both modes**, 0 real console
errors.

## Permission-gating spot check

Logged in as a real **lawyer** demo account (`khaled`, role-gated, no
`showMoney`) and confirmed: the requests KPI card correctly reads "طلباتي"
instead of "كل الطلبات"; the client-profile fee/remaining KPI cards
correctly stay hidden; `/office-panel/users` correctly returns the existing
403 + `denied.ejs` access-denied page (pre-existing, not part of this
checkpoint, contains a 🔒 emoji not touched in this pass — noted for a
future module, not a regression here) rather than exposing the employee
list to a role that shouldn't see it.
