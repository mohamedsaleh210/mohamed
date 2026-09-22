# Phase 2 — Finance + Payroll + Reports + Settings/CMS/Security checkpoint evidence

Branch: `uiux/phase-2-v3-integration`. This checkpoint covers **Treasury,
Revenue, Expenses (incl. categories and employee custodies), Payroll,
Reports, Settings, CMS, and Security/Activity** — the third batch after the
approved Foundation + Admin Shell + Dashboard checkpoint and the approved
Operations checkpoint (Requests, Cases, Clients/Companies, Employees,
Permissions). Screenshots below are real Playwright/Chromium captures of the
actual running application (demo data, `adam`/admin login unless noted), not
the standalone `design-preview/` prototypes.

Directory layout:
```
finance-admin/
  treasury/treasury-ar-{1440,390}.png, treasury-en-1440.png
  revenue/revenue-ar-{1440,390}.png, revenue-en-1440.png
  expenses/expenses-ar-{1440,390}.png
  expenses/expense-categories-ar-{1440,390}.png
  expenses/custodies-ar-{1440,390}.png
  expenses/my-custodies-ar-1440.png  (khaled/lawyer login — page a lawyer IS allowed)
  payroll/payroll-ar-{1440,390}.png, payroll-en-1440.png
  payroll/payroll-run-ar-{1440,390}.png
  reports/report-profiles-ar-{1440,390}.png
  settings/settings-{site,staff,mail,files,backup,google}-ar-{1440,390}.png
  settings/settings-site-en-1440.png
  cms/content-ar-{1440,390}.png, content-en-1440.png
  cms/homepage-ar-{1440,390}.png
  cms/social-ar-{1440,390}.png
  security/security-ar-{1440,390}.png, security-en-1440.png
  security/security-log-ar-{1440,390}.png
  security/activity-ar-{1440,390}.png
  security/trash-ar-{1440,390}.png
```

`payroll_slip.ejs` and `payroll_import.ejs` are not represented as static
screenshots here (see their entries below for why).

## Test/quality gate summary

- `npm test`: **974 passed / 0 failed**
- `npm run test:imports`: **21 passed / 0 failed**
- `npm run security`: **138 passed / 0 failed**
- `npm run integration`: **74 passed / 0 failed**
- `npm run edge`: **178 passed / 0 failed**
- Playwright responsive sweep at all 11 breakpoints (320/360/375/390/414/430/768/820/1024/1280/1440)
  across every page in this checkpoint: **0px horizontal overflow on every page at every breakpoint**.
- Console/page-error sweep: **0 real errors**. The only `requestfailed` seen
  on every page (this checkpoint's and the already-approved dashboard alike)
  is `fonts.googleapis.com` failing `ERR_CERT_AUTHORITY_INVALID` — this is
  the sandbox environment's outbound-HTTPS proxy intercepting the pre-existing
  Google Fonts `<link>` in `admin_head.ejs`, unrelated to any change in this
  checkpoint (verified identical on `dashboard.ejs`, untouched since the
  first checkpoint).
- `prefers-reduced-motion: reduce`: verified on `treasury.ejs` — KPI
  `data-count-to` values render at their final value immediately, no
  animation frames, zero page errors.
- Permission gating: logged in as `khaled` (lawyer role) and requested
  `/treasury`, `/revenue`, `/expenses`, `/payroll`, `/settings`,
  `/report-profiles`, `/content`, `/security`, `/trash` — **all nine
  returned 403**, confirming this checkpoint's icon/motion work did not
  touch any `can()`/`requireModule()` permission gate. The same lawyer login
  correctly gets `200` on `/expenses/my-custodies` (`my_custodies.ejs`), a
  page lawyers are meant to use — screenshotted above.
- Regression re-check on the pointer-events fix from earlier in this
  checkpoint (treasury.ejs's tab-switcher reading `e.target.dataset.tab`
  directly): re-tested by clicking the exact pixel coordinates of the new
  SVG icon inside the "تسجيل منصرف" tab button — the pane still switches
  correctly.
- Keyboard/focus: tabbed through `payroll_run.ejs`; focus lands on real
  interactive elements (`<a>`/`<button>`/form fields), never on a decorative
  icon — confirmed by the global `[aria-hidden="true"] { pointer-events:
  none }` rule (added in this checkpoint) plus every new icon carrying
  `aria-hidden="true"`.
- RTL/LTR: the admin panel has no in-panel language toggle — `lang`/`dir`
  are session-persisted and only flip via the public `/lang/:lang` route
  (`routes/public.js`), which updates the *current* session immediately
  (`middleware/locals.js` reads `req.session.lang` on every request, not
  just at login). Verified this is the real, only mechanism, then captured
  `-en-1440` screenshots for a representative sample (treasury, revenue,
  payroll, settings/site, content, security) with `dir="ltr"` confirmed via
  `document.documentElement`.

## Per-page decision log

### Treasury — `views/admin/treasury.ejs`
- **REAL SANAD SOURCE:** existing page with a 6-card `.stat-grid.treasury-stats`
  KPI strip, a `data-tabs`/`data-pane` tabbed transaction-entry workspace
  (incoming/outgoing/transfer), a live JS-computed `.tx-summary`
  balance-before/incoming/after sidebar, a live `.mini-donut`
  payment-method distribution chart, a full transaction history table, and
  a 3-state (pending → approved → void) approval workflow.
- **PRESERVED FUNCTIONALITY:** every form action, the tab-switcher's
  `data-tab`/`data-pane` JS, the live balance/donut calculators, and the
  approve/reject/void forms — all byte-identical to `origin/main` apart from
  the icon markup.
- **VISUAL CHANGES:** replaced 5 Unicode glyphs (◈◉🏦◫↓/↑) with the SVG icon
  system on the KPI cards, the 3 panel heads, and the tab buttons.
- **KPI SOURCE:** unchanged — all 6 values are the route's existing computed
  totals; only `data-count-to` was added.
- **CHART PURPOSE:** the `.mini-donut` payment-method distribution chart was
  pre-existing and unchanged; it answers "which payment channel is the
  entered transaction going through," directly relevant to the entry form
  beside it.
- **MOTION USED:** KPI count-up on all 6 cards; the panel/tab entrance
  transitions are the global ones from the Foundation checkpoint.
- **PERMISSION CHECK:** `can('treasury.*')`-gated actions untouched; verified
  403 for lawyer role.
- **RESPONSIVE RESULT:** 0 overflow at all 11 breakpoints.
- **RTL/LTR RESULT:** verified via `/lang/en`; screenshot captured.
- **DELIBERATELY NOT COPIED:** none of the V3 preview's structure was needed
  — this real page already matched the intended density/workspace feel.
- **FUTURE FUNCTIONAL IDEAS:** none — no gaps found between the real page
  and the target visual language.
- **Bug found and fixed proactively:** adding `<svg>` icons inside
  `<button data-tab="...">` elements broke the page's existing tab-switcher,
  which reads `e.target.dataset.tab` directly rather than via
  `.closest('[data-tab]')` — clicking exactly on the icon (not the
  surrounding text) silently failed to switch tabs. Fixed with a global,
  defensive CSS rule (`[aria-hidden="true"] { pointer-events: none }` in
  `admin.css`) rather than touching the JS, since every icon this checkpoint
  adds is already `aria-hidden="true"` and should never be an independent
  click target. Re-verified by clicking the icon's exact pixel bounding box
  (see quality-gate summary above).

### Revenue — `views/admin/revenue.ejs`
- **REAL SANAD SOURCE:** Sanad's real de-facto financial-analytics page —
  headline KPIs, a day-by-day `.day-chart` bar chart, a payment-method
  breakdown, a staff ranking table, a top-services ranking table, an
  expenses-by-category table, an owed-to-staff table, and a top-debtors
  table.
- **PRESERVED FUNCTIONALITY:** the date-range filter, every table's sort/
  computation, and the CSV export links — unchanged.
- **VISUAL CHANGES:** replaced 8 KPI glyphs and added icons to all 7 panel
  heads; added a page-local `METHOD_ICON` map (documented inline) for the
  one non-`<select>` usage of payment-method icons on this page — the real
  `lib/payments.js` `METHODS.icon` emoji constant was left untouched since
  it is also rendered inside a native `<option>` elsewhere
  (`request_detail.ejs`), where an SVG cannot render at all.
- **KPI SOURCE:** all 8 values are the route's existing computed totals
  (revenue, discounts, voided, net, etc.) — no new query added.
- **CHART PURPOSE:** the day-by-day bar chart answers "is revenue trending
  up or down this period"; the payment-method breakdown answers "which
  channel are clients actually paying through." Both pre-existing, unchanged.
- **MOTION USED:** KPI count-up on 7/8 cards (the 8th, average payment, is a
  division result rendered as plain formatted text, matching the original —
  not count-up-able as a whole number).
- **PERMISSION CHECK:** `can('revenue.view')`-gated; verified 403 for lawyer.
- **RESPONSIVE RESULT:** 0 overflow at all 11 breakpoints.
- **RTL/LTR RESULT:** verified; screenshot captured.
- **DELIBERATELY NOT COPIED:** the V3 preview's simplified single-currency
  KPI row was not applied verbatim — every KPI here is traceable to a real
  field the route already computes.
- **FUTURE FUNCTIONAL IDEAS:** see the Reports section below — this page is
  effectively filling the role of a dedicated analytics/reports dashboard,
  which Sanad does not otherwise have.

### Expenses — `views/admin/expenses.ejs`
- **REAL SANAD SOURCE:** existing expenses list with KPIs, by-type and
  by-employee breakdown panels, and the expense entry/history table.
- **PRESERVED FUNCTIONALITY:** unchanged — filters, entry form, and the
  `categories[e.category].icon` real user-editable emoji field (left
  completely untouched, same reasoning as `expense_categories.ejs` below).
- **VISUAL CHANGES:** replaced 3 KPI glyphs + 2 panel-head icons; also fixed
  an inconsistency inherited from the icon-replacement pass: the
  `.empty .big` "nothing to show" state still had a plain `✓` glyph — now an
  SVG `i-check-circle`, matching the pattern already established in
  `clients.ejs`/`dashboard.ejs`/`requests.ejs` from the prior checkpoint.
- **KPI SOURCE:** unchanged, route-computed totals; count-up added.
- **CHART PURPOSE:** n/a — table-based breakdowns, no charts on this page.
- **MOTION USED:** KPI count-up.
- **PERMISSION CHECK:** `can('expenses.view')`-gated; verified 403 for lawyer.
- **RESPONSIVE RESULT:** 0 overflow at all 11 breakpoints.
- **RTL/LTR RESULT:** verified structurally (not in the EN screenshot sample
  for this checkpoint — same shell/components already verified LTR on
  `treasury.ejs`/`revenue.ejs`).
- **DELIBERATELY NOT COPIED:** n/a.
- **FUTURE FUNCTIONAL IDEAS:** none identified.

### Expense categories — `views/admin/expense_categories.ejs`
- **REAL SANAD SOURCE:** the admin-managed list of expense category types,
  each with a real DB-backed `icon` column (`expense_categories.icon`,
  admin-typed emoji, max 4 chars, `views/admin/expense_categories.ejs:76`).
- **PRESERVED FUNCTIONALITY:** the `icon` input field, its `placeholder="📄"`,
  and `r.icon` display are **completely untouched** — this is real business
  data a lawyer/accountant chose, not a decorative UI glyph.
- **VISUAL CHANGES:** 2 panel-head icons added ("الأنواع" → list icon,
  "إضافة نوع جديد" → plus icon).
- **KPI SOURCE / CHART PURPOSE:** n/a — a simple CRUD list, no KPIs.
- **MOTION USED:** none needed beyond the global panel entrance.
- **PERMISSION CHECK:** same gate as Expenses; verified.
- **RESPONSIVE RESULT:** 0 overflow at all 11 breakpoints.
- **RTL/LTR RESULT:** verified structurally.
- **DELIBERATELY NOT COPIED:** n/a.
- **FUTURE FUNCTIONAL IDEAS:** none.

### Custodies — `views/admin/custodies.ejs` + `my_custodies.ejs`
- **REAL SANAD SOURCE:** `custodies.ejs` is the admin-side employee-custody
  ledger with a real 3-state approval workflow
  (`pending_approval` → `approved` → `disbursed`); `my_custodies.ejs` is the
  per-employee self-service statement + receipt-confirmation page.
- **PRESERVED FUNCTIONALITY:** every form (`issue`, `approve`, `disburse`,
  `return`, `void`, `receive`) and its permission gate (`custody.approve`,
  `custody.disburse`) — unchanged.
- **VISUAL CHANGES:** `custodies.ejs` — 4 KPI glyphs + 4 panel-head icons
  replaced. `my_custodies.ejs` — same 4-glyph pattern + 1 panel-head icon.
- **KPI SOURCE:** `custodies.ejs`'s 4 KPIs are `total('received'/'spent'/
  'returned'/'remaining')`, a route-local reduce over the real `employees`
  array — unchanged. `my_custodies.ejs`'s 4 KPIs come from
  `lib/custody.js`'s `employeeStatement().totals`, confirmed to be raw JS
  numbers (not pre-formatted strings) so `data-count-to` parses correctly.
- **CHART PURPOSE:** n/a.
- **MOTION USED:** KPI count-up on both pages.
- **PERMISSION CHECK:** verified — lawyer gets 403 on `custodies.ejs`
  (admin-only ledger) but 200 on `my_custodies.ejs` (self-service page,
  screenshotted above under `khaled`'s login).
- **RESPONSIVE RESULT:** 0 overflow at all 11 breakpoints (both pages).
- **RTL/LTR RESULT:** verified structurally.
- **DELIBERATELY NOT COPIED:** n/a.
- **FUTURE FUNCTIONAL IDEAS:** none.

### Payroll — `views/admin/payroll.ejs`
- **REAL SANAD SOURCE:** the real page already has an 8-step
  `.payroll-journey` workflow visualization (conceptual on this page — no
  per-run dynamic state, since it lists all runs, not one), a "create new
  payroll run" form with employee-scope picker, the runs table, and a
  per-employee salary-profile editor (`performance-editor` form).
  `routes/admin/payroll.js` defines its own local `METHODS` map (plain
  Arabic strings, no `.icon` field) — separate from `lib/payments.js`, no
  icon-rendering conflict.
- **PRESERVED FUNCTIONALITY:** the scope-toggle JS (`employee_scope`
  radio → shows/hides the employee picker), every salary-profile field name,
  and the run-creation form — unchanged.
- **VISUAL CHANGES:** replaced 3 KPI glyphs + 5 panel-head icons.
- **KPI SOURCE:** `runs.length`, the latest run's net total, and
  `employees.length` — all pre-existing route values.
- **CHART PURPOSE:** n/a — this list page has no chart, matching the
  original.
- **MOTION USED:** KPI count-up.
- **PERMISSION CHECK:** `can('payroll.manage')`-gated create/profile forms
  untouched; the "سندات راتبي" self-service table (own payslips) still
  renders for any logged-in employee. Verified 403 for lawyer at the top
  level.
- **RESPONSIVE RESULT:** 0 overflow at all 11 breakpoints.
- **RTL/LTR RESULT:** verified via `/lang/en`; screenshot captured.
- **DELIBERATELY NOT COPIED:** n/a.
- **FUTURE FUNCTIONAL IDEAS:** none.

### Payroll run detail — `views/admin/payroll_run.ejs`
- **REAL SANAD SOURCE:** the individual run's edit/approve/pay page — the
  DYNAMIC version of `.payroll-journey.compact` with live `done`/`current`
  classes computed from `run.status`, a 5-card KPI strip, Excel
  import/roll-forward controls (draft-only), and a per-employee expandable
  editor with a live JS gross/deductions/net calculator.
- **PRESERVED FUNCTIONALITY:** the live calculator script, the
  Excel-upload/roll-forward forms, and the pay/reverse action forms — all
  unchanged; re-verified the `.payroll-journey` state classes still render
  correctly post-icon-change (4 `.done` steps present on the demo run,
  `.current` correctly absent since this run is past that stage).
- **VISUAL CHANGES:** replaced 5 KPI glyphs (4 got count-up; the paid-count
  "X / Y" fraction was left as plain text, matching the original, since a
  fraction isn't a single count-up-able number) + 4 panel-head icons.
- **KPI SOURCE:** all 5 are route-computed run totals (employee count, item
  count, deductions, net, paid count) — unchanged.
- **CHART PURPOSE:** n/a.
- **MOTION USED:** KPI count-up; the journey's `.done`/`.current` state
  styling is pre-existing CSS, untouched.
- **PERMISSION CHECK:** same `payroll.manage` gate; verified structurally
  (top-level `/payroll` already confirmed 403 for lawyer).
- **RESPONSIVE RESULT:** 0 overflow at all 11 breakpoints.
- **RTL/LTR RESULT:** verified structurally.
- **DELIBERATELY NOT COPIED:** n/a.
- **FUTURE FUNCTIONAL IDEAS:** none.

### Payroll Excel import review — `views/admin/payroll_import.ejs`
- **REAL SANAD SOURCE:** the diff/validation review page shown after
  uploading an Excel payroll sheet, before the batch is applied.
- **PRESERVED FUNCTIONALITY:** the apply-or-go-back form and the
  per-row error/change listing — unchanged.
- **VISUAL CHANGES:** replaced 3 KPI glyphs (total rows/valid/rejected) with
  count-up SVG icons + 1 heading icon for the uploaded filename.
- **KPI SOURCE:** `batch.rows.length`, `batch.valid_count`,
  `batch.invalid_count` — unchanged route values.
- **CHART PURPOSE:** n/a.
- **MOTION USED:** KPI count-up.
- **PERMISSION CHECK:** same `payroll.manage` gate, unchanged.
- **RESPONSIVE / RTL / LTR / SCREENSHOTS:** not captured as static evidence
  — this page only exists transiently behind a one-time upload `token`
  (`/payroll/imports/:token`) generated per Excel upload; there is no stable
  URL to screenshot without performing a real file upload in this session.
  The code change was verified by direct source read + an automated emoji/
  diff scan (clean) rather than a live screenshot. Flagging this rather than
  fabricating a URL or skipping silently.
- **DELIBERATELY NOT COPIED:** n/a.
- **FUTURE FUNCTIONAL IDEAS:** none.

### Payroll slip (print) — `views/admin/payroll_slip.ejs`
- **REAL SANAD SOURCE:** a standalone print/PDF pay-slip document — own
  `<html>`, its own inline `<style>`, no `admin_head`/`admin_nav` includes.
- **PRESERVED FUNCTIONALITY / VISUAL CHANGES:** **deliberately left
  untouched**, same reasoning as `case_report.ejs` in the prior checkpoint —
  this is an out-of-scope, print-only template, not part of the admin shell
  this initiative is restyling.
- **KPI SOURCE / CHART PURPOSE / MOTION USED:** n/a.
- **PERMISSION CHECK:** unchanged.
- **RESPONSIVE RESULT:** n/a (print layout).
- **RTL/LTR RESULT:** n/a (fixed `lang="ar" dir="rtl"` print document by
  design, unrelated to session language).
- **DELIBERATELY NOT COPIED:** the entire page — out of scope by design.
- **FUTURE FUNCTIONAL IDEAS:** none.

### Reports — `views/admin/report_profiles.ejs`
- **REAL SANAD SOURCE:** important scope finding — **Sanad has no
  standalone analytics "Reports" page.** The only route filed under
  "reports" (`routes/admin/index.js:216`, `requireModule('reports')`,
  permission `report_profiles.manage`) is `report_profiles.ejs`: report
  **identity/branding** management (company legal/tax info, invoice/bank
  details, logo/signature/stamp uploads, per-office-branch report
  identities). In the real sidebar (`views/partials/admin_nav.ejs:21`) this
  is filed under "الإعدادات والإدارة" (Settings & Admin) as "هوية
  التقارير" (report identity), not as an analytics destination.
- **PRESERVED FUNCTIONALITY:** every field name, upload input, and the
  per-branch default-identity toggle — unchanged.
- **VISUAL CHANGES:** 2 panel-head icons + 4 `.form-section-head` icons
  (replacing ▤/⚖/▣/◈); added `.form-section-head i svg` sizing rule to
  `admin.css` (this component previously had no SVG-icon usage anywhere in
  the codebase).
- **KPI SOURCE / CHART PURPOSE:** n/a — this is an identity/branding form,
  not an analytics surface; no KPIs or charts were fabricated for it.
- **MOTION USED:** none beyond the global panel entrance.
- **PERMISSION CHECK:** `report_profiles.manage`-gated; verified 403 for
  lawyer.
- **RESPONSIVE RESULT:** 0 overflow at all 11 breakpoints.
- **RTL/LTR RESULT:** verified structurally.
- **DELIBERATELY NOT COPIED:** did **not** fabricate a cross-module
  analytics "Reports" dashboard to match the checkpoint brief's language —
  the brief's "Reports" guidance (headline KPIs, trend, distributions/
  rankings, real-question charts) is, in the real app, already satisfied by
  `revenue.ejs` (restyled above), which is Sanad's actual de-facto financial
  analytics surface.
- **FUTURE FUNCTIONAL IDEAS:** a dedicated cross-module analytics/reports
  dashboard (pulling from requests, cases, revenue, expenses, and payroll
  together) does not currently exist in Sanad and was not built here, per
  the "no invented backend aggregations" rule — flagged as a genuine future
  functional enhancement, not a visual gap.

### Settings — `views/admin/settings.ejs`
- **REAL SANAD SOURCE:** a single tabbed workspace (site / staff / branches
  / mail / files / backup / google) covering site identity, required staff
  fields, office branches, email provider + test-send + message log, file
  storage + purge-candidate cleanup, backup/restore, and Google OAuth for
  client login.
- **PRESERVED FUNCTIONALITY:** every tab's form fields, names, and actions —
  unchanged. Noted but **deliberately not touched**: the `google` tab has
  two structurally different, fully duplicate render blocks
  (lines ~148–236 and ~536–578, using different backing variables —
  `googleOn`/`googleClientId` vs. `s.google_client_id` directly) that both
  render whenever `tab === 'google'`. This looks like pre-existing
  duplicate/dead code, not something introduced or fixed here — per the
  "do not remove/merge/simplify real functionality" rule, both blocks were
  styled identically and left exactly as they behave in production.
- **VISUAL CHANGES:** 12 panel-head icons across all 7 tab sections (branches
  ×2, backup ×2, site, staff, mail ×3, google ×2, files); replaced 2
  `stat-ico` glyphs (▣ storage, 🗑 purged-files count) and the `.empty .big`
  `✓` "nothing to purge" state with SVG icons.
- **KPI SOURCE:** `storage.bytes`/`storage.files` and `storage.purgedFiles`
  — pre-existing route values, unchanged (kept as plain formatted text, not
  count-up, since `humanSize()` returns a formatted string like "12.3 MB",
  not a raw number).
- **CHART PURPOSE:** n/a — this is a forms/settings workspace, no charts
  belong here.
- **MOTION USED:** panel entrance only.
- **PERMISSION CHECK:** `settings.manage`-gated; verified 403 for lawyer.
- **RESPONSIVE RESULT:** 0 overflow at all 11 breakpoints, all 6 tabs
  screenshotted individually.
- **RTL/LTR RESULT:** verified via `/lang/en` on the `site` tab; screenshot
  captured.
- **DELIBERATELY NOT COPIED:** n/a.
- **FUTURE FUNCTIONAL IDEAS:** the duplicate `google` tab render blocks
  noted above are worth a real engineering follow-up (likely leftover from
  a refactor), but fixing application logic is out of scope for this visual
  initiative and was not touched.

### CMS: Content (pages/categories/services) — `views/admin/content.ejs`
- **REAL SANAD SOURCE:** multi-page catalogue manager — page tabs (each a
  themed section like "تأشيرات"), drag-sortable categories per page, and
  drag-sortable services per category, with inline edit boxes.
- **PRESERVED FUNCTIONALITY:** the drag-and-drop reorder JS
  (`data-reorder-url`), the inline-edit toggle script, and every form —
  unchanged. The drag-handle and move-up/down icons were already real,
  self-authored inline SVGs (not glyphs) from before this checkpoint — left
  untouched.
- **VISUAL CHANGES:** 3 panel-head icons ("الصفحات", "الأقسام", "إضافة قسم
  جديد") + the `.empty .big` 🗂 state replaced with an `i-folder` SVG icon.
- **KPI SOURCE / CHART PURPOSE:** n/a — a content-management list/CRUD page.
- **MOTION USED:** panel entrance only.
- **PERMISSION CHECK:** `content.manage`-gated; verified 403 for lawyer.
- **RESPONSIVE RESULT:** 0 overflow at all 11 breakpoints.
- **RTL/LTR RESULT:** verified via `/lang/en`; screenshot captured.
- **DELIBERATELY NOT COPIED:** n/a.
- **FUTURE FUNCTIONAL IDEAS:** none.

### CMS: Service editor — `views/admin/service_edit.ejs`
- **REAL SANAD SOURCE:** a single-panel bilingual service create/edit form.
- **PRESERVED FUNCTIONALITY / VISUAL CHANGES:** left as-is — this page has
  no `<h3>` panel head, no glyph icons, and no empty states; it is already a
  minimal, clean single-panel form using the shared design system
  components from the Foundation checkpoint. No meaningful visual hierarchy
  change was available to make without adding structure the real page
  doesn't have.
- **KPI SOURCE / CHART PURPOSE:** n/a.
- **MOTION USED:** none beyond the global form/panel entrance.
- **PERMISSION CHECK:** unchanged.
- **RESPONSIVE RESULT:** unchanged from Foundation-checkpoint baseline —
  already 0 overflow (form-based page, no new content added).
- **RTL/LTR RESULT:** n/a — not independently verified since no change was
  made; relies on the shared shell already verified elsewhere.
- **DELIBERATELY NOT COPIED:** n/a.
- **FUTURE FUNCTIONAL IDEAS:** none.

### CMS: Homepage content — `views/admin/homepage.ejs`
- **REAL SANAD SOURCE:** controls for homepage section visibility/order,
  manual metric cards (each with a real DB-backed `icon` text field),
  pinned "popular services," and testimonial/FAQ CRUD + moderation.
- **PRESERVED FUNCTIONALITY:** every form, including the manual metrics'
  `name="icon"` free-text input (`m.icon`) — **left completely untouched**,
  same reasoning as `expense_categories.icon`: this is real admin-authored
  content (an icon string shown on the public homepage), not a decorative
  UI glyph this initiative owns.
- **VISUAL CHANGES:** 8 panel-head icons across all sections (content
  editor, section order, manual metrics, pinned services, add-testimonial,
  add-FAQ, review-testimonials, review-FAQs).
- **KPI SOURCE / CHART PURPOSE:** n/a — this is a CMS forms page.
- **MOTION USED:** panel entrance only.
- **PERMISSION CHECK:** `content.manage`-gated; unchanged.
- **RESPONSIVE RESULT:** 0 overflow at all 11 breakpoints.
- **RTL/LTR RESULT:** verified structurally.
- **DELIBERATELY NOT COPIED:** n/a.
- **FUTURE FUNCTIONAL IDEAS:** none.

### CMS: Social accounts — `views/admin/social.ejs`
- **REAL SANAD SOURCE:** footer social-link manager; already used real
  per-platform brand SVG `<path>` icons (`l.meta.icon`/`p.icon` from a
  lib-provided constant) before this checkpoint — genuinely low-touch.
- **PRESERVED FUNCTIONALITY:** the drag-reorder, inline-edit, and
  platform-picker JS — unchanged; the real brand-icon rendering untouched.
- **VISUAL CHANGES:** 2 panel-head icons + the `.empty .big` 🔗 state
  replaced with an `i-globe` SVG icon.
- **KPI SOURCE / CHART PURPOSE:** n/a.
- **MOTION USED:** panel entrance only.
- **PERMISSION CHECK:** `content.manage`-gated; unchanged.
- **RESPONSIVE RESULT:** 0 overflow at all 11 breakpoints.
- **RTL/LTR RESULT:** verified structurally.
- **DELIBERATELY NOT COPIED:** n/a.
- **FUTURE FUNCTIONAL IDEAS:** none.

### Security & login — `views/admin/security.ejs` + `security_log.ejs`
- **REAL SANAD SOURCE:** per-account last-3-logins view with a suspicious-
  activity alert banner, a failed-attempts table, and (on `security_log.ejs`)
  the full 200-entry login history — both including a real Google-Maps
  location link built from captured geolocation.
- **PRESERVED FUNCTIONALITY:** the suspicious-IP detection banner, the
  session/IP-count chips, and the Maps link's coordinates — unchanged.
- **VISUAL CHANGES:** replaced the 📍 pin emoji (both files) with an inline
  `i-map-pin` SVG sized to the small link text (12px, not the standard
  `.h3-ico` 17px, since this sits inside a 12.5px inline link, not a panel
  heading); added an `i-alert-triangle` panel-head icon to "محاولات دخول
  فاشلة" on `security.ejs`.
- **KPI SOURCE / CHART PURPOSE:** n/a — no KPI cards on either page in the
  real app; none fabricated.
- **MOTION USED:** panel entrance only.
- **PERMISSION CHECK:** `security.view`-gated; verified 403 for lawyer.
- **RESPONSIVE RESULT:** 0 overflow at all 11 breakpoints (both pages).
- **RTL/LTR RESULT:** `security.ejs` verified via `/lang/en` (screenshot
  captured); `security_log.ejs` verified structurally.
- **DELIBERATELY NOT COPIED:** n/a.
- **FUTURE FUNCTIONAL IDEAS:** none.

### Activity log — `views/admin/activity.ejs`
- **REAL SANAD SOURCE:** the system-wide audit trail (who did what, on
  what, when, from where), with an action-type filter.
- **PRESERVED FUNCTIONALITY:** the filter form and every table column —
  unchanged.
- **VISUAL CHANGES:** replaced the same 📍 pin emoji pattern with the
  inline `i-map-pin` SVG; replaced the `.empty .big` 🕓 state with an
  `i-clock` SVG icon.
- **KPI SOURCE / CHART PURPOSE:** n/a.
- **MOTION USED:** panel entrance only.
- **PERMISSION CHECK:** `activity.view`-gated; unchanged.
- **RESPONSIVE RESULT:** 0 overflow at all 11 breakpoints.
- **RTL/LTR RESULT:** verified structurally.
- **DELIBERATELY NOT COPIED:** n/a.
- **FUTURE FUNCTIONAL IDEAS:** none.

### Trash / recycle bin — `views/admin/trash.ejs`
- **REAL SANAD SOURCE:** the soft-delete recovery list (type, item, deleted
  by/when, restore action where allowed), windowed by `windowDays`.
- **PRESERVED FUNCTIONALITY:** the restore form and the "not restorable"
  fallback text — unchanged.
- **VISUAL CHANGES:** replaced the `.empty .big` 🗑 state with an `i-trash`
  SVG icon (no panel head exists on this page to add an icon to — it is a
  single flush table panel, matching the original layout).
- **KPI SOURCE / CHART PURPOSE:** n/a.
- **MOTION USED:** panel entrance only.
- **PERMISSION CHECK:** `trash.restore`-gated; verified 403 for lawyer.
- **RESPONSIVE RESULT:** 0 overflow at all 11 breakpoints.
- **RTL/LTR RESULT:** verified structurally.
- **DELIBERATELY NOT COPIED:** n/a.
- **FUTURE FUNCTIONAL IDEAS:** none.

## Cross-cutting notes

- **Icon system:** every new icon in this checkpoint uses the existing
  self-authored `public/images/icons.svg` sprite (`<use
  href="/images/icons.svg#i-name"/>`) — no new symbols needed to be
  authored this pass; the full existing set (list, folder, wallet, receipt,
  users, scale, shield, alert-triangle, map-pin, clock, trash, lock, mail,
  globe, download, upload, check-circle, plus, edit, gauge, briefcase,
  message, info, file) covered every real concept encountered.
- **Real data icon fields left untouched (confirmed 3 instances this
  checkpoint, on top of the 2 already documented in the prior Expenses
  checkpoint):** `lib/payments.js`'s `METHODS.icon` (emoji, rendered inside
  a native `<option>` elsewhere — SVG cannot render there),
  `expense_categories.icon` (admin-typed emoji, DB column), and
  `homepage.ejs`'s manual-metric `icon` free-text field (admin-typed,
  rendered on the public homepage). All three are real business data, not
  decorative UI — none were converted to SVG or otherwise modified.
- **Defensive CSS added:** `[aria-hidden="true"] { pointer-events: none }`
  in `admin.css`, motivated by the treasury.ejs tab-switcher bug found and
  fixed in this checkpoint (see Treasury entry above) — makes every
  decorative icon added in this and future checkpoints safe against
  intercepting clicks meant for a parent control, without requiring an
  audit of every existing click handler.
- **`.form-section-head` icon support added:** `admin.css` gained a
  `.form-section-head i svg { width: 16px; height: 16px }` rule — this
  component (used only by `report_profiles.ejs`) previously had no SVG-icon
  sizing rule since it had never used one.
