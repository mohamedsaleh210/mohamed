# Phase 2 — Role-workspaces checkpoint evidence

Branch: `uiux/phase-2-v3-integration`. This checkpoint covers the **Customer
Portal**, the **Lawyer/Employee workspace**, the **Accountant workspace**,
and a permission audit of the **Supervisor** role (which shares the admin
shell — no separate pages of its own). Screenshots below are real
Playwright/Chromium captures of the actual running application against real
seeded demo data and real seeded accounts for every role (`adam`/admin,
`nour`/supervisor, `khaled` + `mona`/lawyer, `samia`/accountant,
`client@demo.sanad`/customer), not the standalone `design-preview/`
prototypes.

Directory layout:
```
role-workspaces/
  portal/requests-ar-{1440,390}.png, requests-en-1440.png
  portal/request-detail-{1,2}-ar-{1440,390}.png, request-detail-1-en-1440.png
  portal/support-list-ar-{1440,390}.png
  portal/support-detail-ar-{1440,390}.png
  lawyer/dashboard-ar-{1440,390}.png
  lawyer/agenda-ar-{1440,390}.png
  lawyer/errands-ar-{1440,390}.png, trip-ar-{1440,390}.png
  lawyer/support-ar-{1440,390}.png, support-detail-ar-{1440,390}.png
  lawyer/notifications-ar-{1440,390}.png
  lawyer/account-ar-{1440,390}.png, profile-ar-{1440,390}.png
  lawyer/appointments-ar-{1440,390}.png, appointment-detail-ar-{1440,390}.png
  accountant/performance-ar-{1440,390}.png
```

## Real Sanad inventory (before touching anything)

Read `lib/permissions.js`'s `ROLE_DEFAULTS` (the actual authorization source
of truth) before assuming any page belonged to a role:

- **Lawyer** defaults: `requests.edit/critical/export`, `documents.manage`,
  `requirements.manage`, `expenses.add`, `custody.view_own/receive/expense/
  return/attachments`, `errands.view`, `cases.edit/hearings/tasks/parties/
  report`, `agenda.view/manage`, `support.view/create/reply`. **Not**
  `requests.view_all` (a lawyer's dashboard/requests list is scoped to their
  own assignments) and **not** any `money.*`/`treasury.*`/`payroll.*`/
  `revenue.*` permission.
- **Accountant** defaults: `money.view`, `revenue.view/export`,
  `treasury.view/manage/export`, `expenses.view_all/export`,
  `custody.view_all/create/approve/disburse/review_expense/return/close/
  attachments/export`, `performance.view/export`, `payroll.view_own/
  view_all/manage/pay/export`. **Not** any `requests.*`, `cases.*`,
  `agenda.*`, `errands.*`, or `support.*` permission — confirmed in code:
  `routes/admin/index.js:42` redirects the accountant's dashboard straight
  to `/revenue`, never rendering `dashboard.ejs` for that role at all.
  Every finance page an accountant actually uses (treasury, revenue,
  expenses, custodies, payroll) was **already restyled in the previous
  (finance-admin) checkpoint** — there was no new accountant-specific page
  to build except `performance.ejs`.
- **Supervisor** defaults are a near-superset of everything above — the
  supervisor uses the exact same admin pages as admin, just permission-
  filtered per-page. No separate supervisor-only page exists.
- **Customer** capabilities, read from `routes/portal.js` (not assumed from
  the design-preview prototype): request list + detail (with requirements,
  documents, and — only if a real `legal_cases` row exists for that request
  — case status/hearings/tasks/events), and a separate support-ticket
  system (`routes/support.js`: `/support/my`, `/support/my/:id`). There is
  **no** portal-side payments/invoices page, appointments page, messages
  page, or document vault beyond per-request documents — none of these
  were fabricated to match the checkpoint brief's language; what exists was
  made richer, nothing was invented.

This inventory changed the plan from the brief's literal reading in one
place: `bookings.ejs`/`booking_detail.ejs` (appointments) were initially
assumed out of scope for lawyers (their permission is `bookings.create/
manage`, supervisor-only) — but `routes/admin/bookings.js:4` gates the
*entire* module behind `agenda.view` (which lawyers have), and
`GET /appointments` (`bookings.js:34`) scopes the list to
`assigned_user_id = req.user.id` for anyone without `bookings.manage`. A
lawyer's own assigned appointments are real, and match the brief's
"appointments/hearings" requirement exactly — so they were brought into
scope, verified against a real assigned booking (see Lawyer section below).

## Test/quality gate summary

- `npm test`: **974 passed / 0 failed**
- `npm run test:imports`: **21 passed / 0 failed**
- `npm run security`: **138 passed / 0 failed**
- `npm run integration`: **74 passed / 0 failed**
- `npm run edge`: **178 passed / 0 failed** (runs against isolated temp
  databases — confirmed the live demo DB and its just-created test booking
  were untouched afterward)
- Playwright responsive sweep at all 11 breakpoints (320/360/375/390/414/
  430/768/820/1024/1280/1440) across all 17 touched pages, each under its
  real role's login: **0px horizontal overflow anywhere**.
- Console/page-error sweep: **0 real errors** on any page (only the known
  sandbox-environment Google Fonts `ERR_CERT_AUTHORITY_INVALID` artifact,
  already documented in the previous checkpoint, appears identically here).
- `prefers-reduced-motion: reduce`: verified on `agenda.ejs` (lawyer) — the
  new `data-count-to` KPIs render at their final value immediately, no
  animation frames, zero page errors.
- RTL/LTR: verified via the app's real `/lang/:lang` route on the customer
  portal (`requests.ejs` and `request_detail.ejs`) — `dir="ltr"` confirmed
  via `document.documentElement`, screenshots captured.
- Keyboard focus: tabbed through the customer portal; every focusable
  element is a real interactive control. One **pre-existing, out-of-scope**
  finding: the shared site header's closed mobile-nav drawer
  (`views/partials/header.ejs`, not touched in this or any prior
  checkpoint) keeps its links in the tab order while `aria-hidden="true"`.
  This predates this initiative entirely and is unrelated to any page in
  this checkpoint's scope — flagged, not fixed.

### Permission matrix (real seeded accounts, not admin-only)

Tested every route touched in this checkpoint (plus the previous finance-
admin checkpoint's routes, as a regression spot-check) against all 5 real
identities. Full raw results captured via Playwright; summarized findings:

| Route | admin | supervisor | lawyer (khaled) | accountant (samia) | customer |
|---|---|---|---|---|---|
| `/treasury`, `/revenue`, `/expenses*` | 200 | 200 | **403** | 200 (403 on `/expenses/categories`, correctly not in accountant defaults) | redirected to admin login |
| `/payroll*` | 200 | **403** (no payroll perms by role) | **403** | 200 | redirected to admin login |
| `/settings` | 200 | **403** (no `settings.manage` by role) | **403** | **403** | redirected to admin login |
| `/report-profiles`, `/content`, `/homepage`, `/social`, `/security*`, `/activity`, `/trash` | 200 | 200 | **403** | **403** | redirected to admin login |
| `/agenda`, `/errands*`, `/support` (admin) | 200 | 200 | 200 (own scope) | **403** (no `agenda.view`) | redirected to admin login |
| `/notifications`, `/account`, `/account/profile` | 200 | 200 | 200 | 200 | redirected to admin login |
| `/appointments`, `/appointments/:id` | 200 | 200 | 200 list / **404** on a booking not assigned to them | **403** (no `agenda.view`) | redirected to admin login |
| `/performance` | 200 | 200 | **403** | 200 | redirected to admin login |
| `/portal`, `/portal/requests/:id`, `/support/my*` | n/a | n/a | n/a | n/a | 200, correctly scoped to `client_id` |

Every result matches `lib/permissions.js`'s `ROLE_DEFAULTS` exactly — this
checkpoint's icon/KPI/motion work introduced **zero** new exposure. Two
apparent anomalies were investigated and are **not** issues:
- The customer's "200" on admin URLs (e.g. `/office-panel/treasury`) is the
  **login page** after a 302 redirect (`middleware/auth.js`'s `requireAuth`
  redirects rather than 403s an unauthenticated session) — confirmed by
  checking `page.url()` after navigation, which lands on
  `/office-panel/login`, not the protected content.
- `khaled` getting 404 on the test booking's detail page is **correct**: it
  was deliberately assigned to `mona` to test the real
  `assigned_user_id !== req.user.id → 404` scoping in
  `routes/admin/bookings.js:41`, and khaled (a different lawyer) correctly
  cannot see it.

## Per-page decision log

### Customer portal — `views/portal/requests.ejs`
- **REAL SANAD SOURCE:** `routes/portal.js` `GET /` — every request for the
  logged-in client, each row already carrying a real `pending_count`
  (open `requirements`) computed per request.
- **ROLE:** Customer.
- **REAL DATA USED:** `r.status` (via the already-passed `STATUS` map),
  `r.created_at`, `r.deadline`, `r.pending_count`, and — newly surfaced in
  this pass — `r.total_amount`/`r.paid_amount` (already present on the row
  via `SELECT *`, simply not rendered by the original template).
- **PERMISSION GATES PRESERVED:** `requireClient` middleware unchanged;
  `linkGuestRequests`, email-verification banner, and the Google-linked/
  welcome banners are untouched.
- **VISUAL CHANGES:** added a 6-segment progress stepper per card (derived
  from `Object.keys(STATUS)` order, excluding `cancelled` as a terminal
  exception — the same enum the page already imports), and a second chip
  showing the real remaining balance when `awaiting_payment`/any unpaid
  balance exists, visually distinguished (blue) from the existing amber
  "documents needed" chip.
- **KPI SOURCE:** none (list page, no aggregate KPIs) — the stepper and
  chips are per-row, not aggregate metrics, each traceable to a field on
  that exact request row.
- **CHART PURPOSE:** the progress stepper answers "how far along is this
  request," the single most useful thing a client wants to know at a
  glance; not decorative.
- **MOTION USED:** none added — the portal has no `data-count-to`-equivalent
  utility and no aggregate numbers were introduced here to animate.
- **MOBILE BEHAVIOR:** `.req-list` was already a responsive card grid
  (`repeat(auto-fill,minmax(320px,1fr))` above 700px, single column below);
  new stepper/chips verified at all 11 breakpoints, 0 overflow.
- **RTL/LTR:** verified via `/lang/en`; screenshot captured.
- **NOT COPIED FROM PROTOTYPE:** the preview's mockup data (fake
  progress-bar percentages) was not used — the stepper's position is
  mathematically derived from the real enum order, nothing hand-tuned per
  card.
- **DEFERRED FUNCTIONAL IDEA:** none — every real field the route already
  provides is now surfaced.

### Customer portal — `views/portal/request_detail.ejs`
- **REAL SANAD SOURCE:** `routes/portal.js` `GET /requests/:id` — fees,
  requirements, documents, and (only if a real `legal_cases` row exists for
  that request) case status, hearings, tasks, and events, each already
  filtered server-side to `client_visible=1` before this page ever sees
  them.
- **ROLE:** Customer.
- **REAL DATA USED:** everything the route already selects — no new query
  was added anywhere on this page.
- **PERMISSION GATES PRESERVED:** the route's `WHERE id=? AND client_id=?`
  ownership check, and the `client_visible=1` filters on hearings/tasks/
  events (internal case notes never reach this template) — untouched.
- **VISUAL CHANGES:** added the same progress stepper as the list page;
  added heading icons (hand-authored inline SVGs, matching the portal's
  existing convention of drawing its own icons rather than referencing the
  admin-only sprite) to the fees, legal-case, hearings, progress,
  requirements, and documents sections; converted the requirements
  checklist's plain `✓`/`!` glyphs inside colored badges to matching inline
  SVG icons (this was a genuine icon *slot*, unlike a bare inline
  character, so it follows the same rule applied to admin `stat-ico`/
  `h3-ico` icons in prior checkpoints).
- **KPI SOURCE:** the fees card (total/paid/remaining) is unchanged,
  pre-existing real data.
- **CHART PURPOSE:** the stepper, as above.
- **MOTION USED:** none (single-record page).
- **MOBILE BEHAVIOR:** verified full request with a real attached legal
  case (hearings, tasks, events, documents) at all 11 breakpoints — 0
  overflow, cards stack correctly.
- **RTL/LTR:** verified via `/lang/en`; screenshot captured.
- **NOT COPIED FROM PROTOTYPE:** n/a.
- **DEFERRED FUNCTIONAL IDEA:** none.

### Customer portal — `views/portal/support.ejs` + `support_detail.ejs`
- **REAL SANAD SOURCE:** `routes/support.js` `/support/my` and
  `/support/my/:id` — the client's own ticket list and thread.
- **ROLE:** Customer.
- **REAL DATA USED:** `t.ref`, `t.title`, `t.status`, `t.created_at`,
  ticket messages, rating/reopen eligibility windows.
- **PERMISSION GATES PRESERVED:** `client` middleware and the
  `opened_by_client_id=?` ownership check on every query — unchanged;
  reply/rate/reopen forms and their status-window conditions
  (`!['resolved','closed'].includes(...)` etc.) byte-identical.
- **VISUAL CHANGES:** **fixed a real, pre-existing rendering bug as a side
  effect of the restyle**: both pages used `.panel`/`.panel-body`/`.tbl`/
  `.page-head-row` classes that only exist in `admin.css` — `public/
  css/style.css` (which is what the portal actually loads) defines none of
  them, so this content was rendering completely unstyled (raw browser
  default table/div layout) before this pass. Rebuilt both pages using the
  portal's real, already-working components (`.req-card`/`.req-list` for
  the list, `.form-card`/`.ticket-thread` for the detail page — all
  confirmed present in `style.css`). Added a page-local `TICKET_COLOR` map
  (presentation-only, same pattern as `METHOD_ICON` in the finance
  checkpoint) since the real `STATUSES` label map has no colors.
- **KPI SOURCE / CHART PURPOSE:** n/a.
- **MOTION USED:** none.
- **MOBILE BEHAVIOR:** verified at all 11 breakpoints, 0 overflow.
- **RTL/LTR:** not independently re-verified (same shell/components already
  verified LTR on `requests.ejs`/`request_detail.ejs` above).
- **NOT COPIED FROM PROTOTYPE:** n/a — this was a bug fix plus icon/card
  work using the site's own real component library, not the preview.
- **DEFERRED FUNCTIONAL IDEA / FOUND BUG (not fixed, out of visual scope):**
  the real demo seed data (`db/demo-complete.js:143`) creates a ticket with
  `status:'in_progress'`, a value that does not exist in `routes/
  support.js`'s `STATUSES` label map (`new/review/assigned/working/
  waiting_client/resolved/closed/reopened`) — so `STATUSES[t.status]`
  renders as `undefined` for that one demo ticket, on both the admin and
  portal ticket views, both before and after this pass. This is a seed-
  data/label mismatch, not something this visual initiative should alter;
  it degrades gracefully (a blank status chip rather than a crash) and is
  flagged for a real follow-up.

### Lawyer/employee — `views/admin/dashboard.ejs`
- **REAL SANAD SOURCE:** the shared admin dashboard, already role-aware
  from the Foundation checkpoint: `showMoney = req.userCan('money.view')`
  gates every financial widget, and the requests KPI label already reads
  `user.role === 'lawyer' ? 'طلباتي' : 'كل الطلبات'`.
- **ROLE:** Lawyer/Employee (also Supervisor, Admin — same page).
- **REAL DATA USED:** unchanged.
- **PERMISSION GATES PRESERVED:** verified live as `khaled` — first KPI
  label reads "طلباتي" (my requests, not "all requests"), and zero links
  to `/treasury` or any other money-gated destination render on the page.
- **VISUAL CHANGES:** replaced the one remaining Unicode glyph (⏱, a
  stopwatch character outside the emoji ranges already scanned for in
  prior checkpoints, only caught by widening the regex this pass) in the
  upcoming-deadlines timeline with an `i-clock` SVG icon.
- **KPI SOURCE / CHART PURPOSE / MOTION USED:** unchanged from the
  Foundation checkpoint.
- **MOBILE BEHAVIOR:** unchanged, already verified in the Foundation
  checkpoint.
- **RTL/LTR:** unchanged.
- **NOT COPIED FROM PROTOTYPE:** n/a.
- **DEFERRED FUNCTIONAL IDEA:** none — the role-awareness this checkpoint's
  brief asked for already existed; this page needed only the one glyph fix.

### Lawyer/employee — `views/admin/agenda.ejs`
- **REAL SANAD SOURCE:** `routes/admin/agenda.js` — a real cross-source
  work queue merging manual agenda events, request deadlines, case tasks,
  and trips, already scoped per-role in the route (`isAdmin` vs. own-only
  via `created_by`/assignee joins).
- **ROLE:** Lawyer/Employee (also Supervisor/Admin with a staff filter).
- **REAL DATA USED:** the existing `events` array (unchanged query) is used
  to derive 4 KPIs *in the template* — total this month, today's count,
  urgent-and-not-done count, completed count — all `events.filter(...)`
  aggregations over data the route already fully fetched, no new query
  added (same pattern as the KPI derivation already used elsewhere, e.g.
  the finance checkpoint's page-local icon maps).
- **PERMISSION GATES PRESERVED:** `can('agenda.manage')`-gated dialog/
  status-select form and `isAdmin`-gated staff filter — unchanged; the
  month/user_id scoping in `routes/admin/agenda.js` was not touched.
- **VISUAL CHANGES:** added the 4-KPI strip; replaced the 🗓️ empty-state
  emoji and added panel-head icons to the table panel and the "add work"
  dialog heading.
- **KPI SOURCE:** derived client-side from the already-fetched `events`
  array, as above.
- **CHART PURPOSE:** n/a (KPI cards, not charts) — each answers a real
  question ("how much is on my plate," "what's urgent," "what's already
  done").
- **MOTION USED:** KPI count-up (`data-count-to`), verified under
  `prefers-reduced-motion: reduce` (final values render immediately, no
  errors).
- **MOBILE BEHAVIOR:** verified at all 11 breakpoints as `khaled`, 0
  overflow.
- **RTL/LTR:** structural verification (same shell already verified LTR
  elsewhere).
- **NOT COPIED FROM PROTOTYPE:** the KPI set here is derived from this
  specific page's real cross-source data, not copied from the preview's
  generic KPI row.
- **DEFERRED FUNCTIONAL IDEA / FOUND BUG (not fixed):** the status chip for
  non-manual events (request deadlines, case tasks, trips) uses an Arabic
  label map that only covers manual-agenda statuses
  (`pending/in_progress/waiting/completed/cancelled`); a trip's real status
  values (`planned`/`done`) or a case task's (`awaiting_docs` etc.) have no
  match and fall back to the raw English/internal value. Pre-existing in
  the original template's `else` branch, unchanged by this pass — flagged,
  not fixed (fixing it means picking real status label copy, an editorial/
  functional decision outside this visual initiative).

### Lawyer/employee — `views/admin/errands.ejs` + `views/admin/trip.ejs`
- **REAL SANAD SOURCE:** the cross-request "field visit" workflow —
  requests needing something from an external destination, grouped by
  destination, planned into trips with a checklist of stops.
- **ROLE:** Lawyer/Employee (`errands.view`; trip creation/destination
  management is `errands.manage`, supervisor/admin only and correctly
  stays hidden for a lawyer, verified — `canManage` block).
- **REAL DATA USED:** `totalPending` (already computed), `destinations`
  (each with a real `.pending` count), `upcoming` trips — all pre-existing
  route values, no new query.
- **PERMISSION GATES PRESERVED:** `can('errands.export')` and the
  `canManage` (`errands.manage`)-gated trip-planning/destination panels —
  unchanged.
- **VISUAL CHANGES:** added a 3-KPI strip (total pending, destinations with
  pending items, upcoming trips) shown only when there's real pending work;
  added panel-head icons throughout both files. The drag-handle/tick icons
  on `trip.ejs` were already real, self-authored SVGs from before this
  checkpoint — untouched.
- **KPI SOURCE:** derived from already-fetched `destinations`/`upcoming`
  arrays, same pattern as agenda.ejs.
- **CHART PURPOSE:** n/a.
- **MOTION USED:** KPI count-up on the 3 new cards.
- **MOBILE BEHAVIOR:** verified at all 11 breakpoints (both pages) as
  `khaled`, 0 overflow.
- **RTL/LTR:** structural verification.
- **NOT COPIED FROM PROTOTYPE:** n/a.
- **DEFERRED FUNCTIONAL IDEA:** none.

### Lawyer/employee — `views/admin/support.ejs` + `support_detail.ejs` (admin)
- **REAL SANAD SOURCE:** the staff-side support-ticket queue and thread —
  a lawyer's real `support.view/create/reply` permissions (no `.manage`/
  `.assign`/`.internal`).
- **ROLE:** Lawyer/Employee (also Supervisor/Admin with full manage
  controls).
- **REAL DATA USED:** `stats.total/open_count/overdue_count/avg_hours` —
  pre-existing route-computed values.
- **PERMISSION GATES PRESERVED:** verified live as `khaled` — the
  "المسؤولون" (assignees, `support.assign`-gated) panel and the
  status/priority-management form (`support.manage`-gated) both correctly
  do not render; reply form (`support.reply`, which khaled has) does
  render.
- **VISUAL CHANGES:** replaced 4 KPI glyphs (▤◉⏱≈) with SVG icons + count-
  up; added panel-head icons to the new-ticket form and the detail page's
  3 panels. The `.support-card`/`.support-grid` component was already a
  real, well-built card grid from before this checkpoint — untouched.
- **KPI SOURCE:** pre-existing `stats` object.
- **MOTION USED:** KPI count-up on 3/4 cards (average-resolution-hours kept
  as plain text, a computed average is not a whole-number count).
- **MOBILE BEHAVIOR:** verified at all 11 breakpoints, 0 overflow.
- **RTL/LTR:** structural verification.
- **NOT COPIED FROM PROTOTYPE:** n/a.
- **DEFERRED FUNCTIONAL IDEA:** none.

### Lawyer/employee — `views/admin/notifications.ejs`
- **REAL SANAD SOURCE:** the full notification list/history page (the
  dashboard's notification widget already had its icons converted in the
  Foundation checkpoint; this standalone page had not).
- **ROLE:** any logged-in staff account (no `can()` gate on the route).
- **REAL DATA USED:** unchanged — `n.type`, `n.seen_at`, `n.priority`,
  `n.request_id`/`n.booking_id`.
- **PERMISSION GATES PRESERVED:** the seen/seen-all forms and
  request/booking deep-links — unchanged.
- **VISUAL CHANGES:** replaced the emoji type-icon map
  (💬👤🔄📅📎🔔) with the exact same SVG map already used on
  `dashboard.ejs`, for consistency between the two surfaces that show the
  same notification data; replaced the 🔔 empty-state emoji.
- **KPI SOURCE / CHART PURPOSE / MOTION USED:** n/a.
- **MOBILE BEHAVIOR:** verified at all 11 breakpoints as `khaled`, 0
  overflow.
- **RTL/LTR:** structural verification.
- **NOT COPIED FROM PROTOTYPE:** n/a.
- **DEFERRED FUNCTIONAL IDEA:** none.

### Lawyer/employee — `views/admin/account.ejs` + `profile.ejs`
- **REAL SANAD SOURCE:** self-service password change and profile editor
  (legal name, contact info, ID-card upload, and the real "assignment
  lock" feature — a lawyer can mark themselves unavailable for new work
  with a reason and optional end date).
- **ROLE:** every staff account.
- **REAL DATA USED:** unchanged.
- **PERMISSION GATES PRESERVED:** the `force=1` (must-change-password)
  banner state, the `idRequired` conditional ID-card block, and the
  assign-lock form — all unchanged. **Verified live and unintentionally
  end-to-end**: while testing the appointments feature, a different seeded
  lawyer account (`omar`, `must_change_password=1`) was redirected straight
  to `account.ejs`'s `force=1` state by real middleware on every request,
  confirming that state renders correctly. A third seeded lawyer
  (`khaled`, `assign_locked=1`, reason "إجازة سنوية") correctly blocked a
  real booking-assignment attempt with "الموظف غير متاح للتعيين" — proving
  the assign-lock feature `profile.ejs` exposes is wired all the way
  through to the booking system, not just cosmetic.
- **VISUAL CHANGES:** added 2 panel-head icons (password panel, assignment-
  lock panel). Both pages were already clean, well-componentized forms
  using the shared design system from the Foundation checkpoint — no other
  changes were needed or made.
- **KPI SOURCE / CHART PURPOSE / MOTION USED:** n/a.
- **MOBILE BEHAVIOR:** verified at all 11 breakpoints, 0 overflow.
- **RTL/LTR:** structural verification.
- **NOT COPIED FROM PROTOTYPE:** n/a.
- **DEFERRED FUNCTIONAL IDEA:** none.

### Lawyer/employee — `views/admin/bookings.ejs` + `views/admin/booking_detail.ejs`
- **REAL SANAD SOURCE:** the appointments/consultations module. Confirmed
  in scope via code reading (see inventory section above) —
  `GET /appointments` and `GET /appointments/:id` both scope to
  `assigned_user_id = req.user.id` for any account without
  `bookings.manage` (`routes/admin/bookings.js:34,41`), so a lawyer's own
  bookings are real, permission-correct content, matching the brief's
  "appointments/hearings" requirement.
- **ROLE:** Lawyer/Employee (view own only) / Supervisor/Admin (manage
  all).
- **REAL DATA USED:** `counts.{unassigned,confirmed,today,completed,
  cancelled}` (pre-existing route aggregates) on the list;
  `item`/`slot`/`history` (real DB rows) on the detail page.
- **PERMISSION GATES PRESERVED:** `manage = req.userCan('bookings.manage')`
  everywhere — verified live end-to-end with 3 real seeded lawyer accounts
  (see below).
- **VISUAL CHANGES:** `bookings.ejs` — replaced 5 KPI glyphs (`!✓◷▤✕`) with
  SVG icons + count-up, added panel-head icons, replaced the empty-state
  with an icon. `booking_detail.ejs` — this page had **no styling
  components at all** before this pass (bare `<h1>`/`<p>` tags, no
  `.panel`/`.page-head` classes anywhere in the original source) — rebuilt
  it using the real admin design system (crumbs, page-head with a real
  status-color chip, `.btn-row`, `.panel`/`.form-grid` for the manage form,
  a `.two-col` for company-link/invoice, `.timeline` for history), while
  preserving **every** field name, form action (including the main manage
  form's deliberate lack of an `action` attribute, which relies on
  same-URL POST submission — kept exactly as-is), and permission
  conditional (`manage`, `can('money.fees')`) unchanged.
- **KPI SOURCE:** pre-existing `counts` object on the list page; no KPIs
  invented for the detail page (a single booking has no series to
  aggregate).
- **MOTION USED:** KPI count-up on the list page's 5 cards.
- **MOBILE BEHAVIOR:** verified at all 11 breakpoints, 0 overflow, for both
  the list and the fully-restructured detail page.
- **RTL/LTR:** structural verification.
- **NOT COPIED FROM PROTOTYPE:** the rebuilt `booking_detail.ejs` structure
  follows the real admin shell's own component conventions (panel/
  page-head/timeline), not the design-preview prototype.
- **Real, live, end-to-end verification performed** (since the demo seed
  data had zero pre-existing bookings): opened a real booking slot as
  admin through the real "فتح موعد جديد للحجز" form, created a real booking
  against it as admin through the real "إنشاء حجز لعميل" form, then
  exercised the real assign workflow three times against three different
  real seeded lawyer accounts:
  1. `khaled` — correctly rejected ("الموظف غير متاح للتعيين") because his
     real `assign_locked=1` state blocks it — proves the lock feature is
     load-bearing, not cosmetic.
  2. `omar` — his session correctly force-redirected to `account.ejs`'s
     `force=1` password-change state before reaching anything else — real
     middleware, unrelated to bookings, incidentally re-verified.
  3. `mona` — assignment succeeded; logged in as her and confirmed she
     sees **only** her own booking on the list (KPI strip + scoped table),
     and on the detail page sees the ref/status/notes/calendar-link/
     history but **not** the request link, the manage form, the company-
     link panel, or the invoice panel (all `manage`-gated, all correctly
     absent) — exact match to the real permission model.
- **DEFERRED FUNCTIONAL IDEA:** none — the page now fully matches its real
  permission model, just previously had no visual design applied to it at
  all.

### Accountant — `views/admin/performance.ejs`
- **REAL SANAD SOURCE:** the employee performance/bonus review workflow
  (80% automated score + 20% administrative score, with an approval
  decision workflow) — an accountant has `performance.view/export` but not
  `performance.manage` (approval/review forms).
- **ROLE:** Accountant (also Supervisor with full manage rights).
- **REAL DATA USED:** the existing `staff` array (each with `.finalScore`,
  `.review?.decision`, `.review?.approved_bonus`) is aggregated *in the
  template* into 4 KPIs: staff reviewed, average completion score, pending-
  decision count, and total approved bonuses — all `staff.reduce()`/
  `.filter()` over data the route already fully computed, no new query.
- **PERMISSION GATES PRESERVED:** verified live as `samia` (accountant) —
  the rule-setting and administrative-review/approval forms
  (`performance.manage`-gated) correctly do not render; the read-only
  "المكافأة المعتمدة" summary (the `else` branch) does.
- **VISUAL CHANGES:** added the 4-KPI strip above the existing scoring-
  basis alert. The `.score-ring`/`.performance-card`/`.performance-kpis`
  components were already a real, well-built, glyph-free design from
  before this checkpoint — no icon replacement was needed anywhere else on
  this page.
- **KPI SOURCE:** derived client-side from the already-fetched `staff`
  array, as above.
- **CHART PURPOSE:** the pre-existing `.score-ring` (a conic-gradient
  percentage ring) is unchanged and already answers "how is this person
  doing" per row — no new chart was needed.
- **MOTION USED:** KPI count-up on the 4 new cards.
- **MOBILE BEHAVIOR:** verified at all 11 breakpoints as `samia`, 0
  overflow (a 27-row real staff list, full page).
- **RTL/LTR:** structural verification.
- **NOT COPIED FROM PROTOTYPE:** n/a.
- **DEFERRED FUNCTIONAL IDEA:** none.

## Cross-cutting notes

- **Icon system:** admin-side pages continue using the shared
  `public/images/icons.svg` sprite via `<use href="...">`. Portal pages use
  **hand-authored inline SVGs** instead — confirmed this matches the
  portal's own pre-existing convention (its "documents needed" icon and the
  "open in new tab" icon were already hand-drawn inline SVGs, never
  sprite references), and the admin sprite, while technically reachable
  from any page (`/images/icons.svg` is a public static asset, verified
  with a direct request), was never used by the portal before this pass —
  no reason to introduce a new dependency pattern there.
- **Real data icon/status fields left untouched:** none newly encountered
  this checkpoint beyond what was already documented (payment-method
  emoji, expense-category emoji, homepage-metric emoji) — no role-workspace
  page in this checkpoint has a user-editable icon/emoji field.
- **Bug fixed as a byproduct of the restyle:** `views/portal/support.ejs`
  and `support_detail.ejs` were rendering with zero CSS applied (they used
  admin-only class names that don't exist in the portal's stylesheet) —
  see that page's decision-log entry above.
- **Bugs found, documented, deliberately not fixed** (all pre-existing,
  all outside this visual initiative's scope): the demo-seeded support
  ticket with an unmapped `in_progress` status (both admin and portal
  ticket views); `agenda.ejs`'s non-manual-event status chips falling back
  to raw internal values for trip/case-task sources; the shared site
  header's closed mobile-nav drawer keeping focusable links in the tab
  order while `aria-hidden="true"`.
