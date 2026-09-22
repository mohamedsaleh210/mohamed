# Sanad Design System Preview — Phase 1 (V2 + V3)

**Status: preview only. Nothing in this directory is wired into the Sanad application.**
No EJS, CSS, JS, route, database, auth, permission, API, responsive, or business-logic file
in the real app was touched to produce this. Verified baseline: `main` @
`40850aed274ac234dc15c62e0fcaea79c1be77ef` (untouched — this directory is new and unstaged).

This is a **static HTML/CSS/vanilla-JS prototype**, built with the same stack constraints as
production Sanad (Express + EJS + plain CSS + vanilla JS — no React/Vue/Tailwind/build step),
so that every pattern shown here is directly portable into `views/**/*.ejs` and
`public/css/*.css` without a framework migration.

## How to view it

```
cd design-preview
python3 -m http.server 8899
# open http://localhost:8899/design-system.html
```

Every page has a language toggle in its top preview bar (and, on the public homepage, in the
header itself) that flips `dir`/`lang` live and swaps `data-ar`/`data-en` text — this is a
genuine layout mirror (sidebar/nav moves sides, text alignment flips, icons/arrows mirror),
not a translation overlay. Resize the browser to see the responsive behavior; every page was
verified at 390 / 768 / 1440px.

## Files

```
design-preview/
  assets/
    tokens.css       — design tokens (color, type, spacing, radius, shadow)
    components.css   — every component in the brief (buttons → loading states)
    layout.css       — app shell (sidebar/topbar/mobile drawer) + marketing layout
    icons.svg         — self-authored outline SVG icon sprite (~35 icons, no emoji)
    app.js            — shared vanilla JS: drawers, lang toggle, tabs, dropdowns, dialogs
  design-system.html  — full component/token showcase
  public-home.html    — public marketing homepage
  admin-dashboard.html
  requests.html
  request-detail.html
  cases.html
  treasury.html
  portal.html          — customer portal shell (visual only, §7 below)
  lawyer-dashboard.html
  accountant-dashboard.html
  sidebar-full-nav.html — full-navigation demo (now 18 modules, V2)
  clients-companies.html — V2 addition
  employees.html          — V2 addition
  employee-profile.html   — V2 addition
  permissions.html         — V2 addition (Sanad's real roles only)
  revenue-expenses.html   — V2 addition
  payroll.html             — V2 addition
  reports.html             — V2 addition
  settings-cms-security.html — V2 addition
  screenshots/          — Phase 1 + refinement-pass screenshots (390/768/1440, AR+EN)
  screenshots-v2/        — V2 screenshots for every prototype above + _v2-quality-report.json
  screenshots-v3/        — V3 screenshots (11-breakpoint overflow matrix + AR/EN shots) + _v3-quality-report.json
```

---

## 0. Refinement pass (post-approval visual pass, same branch)

The overall Phase 1 direction was approved; this pass applies eight targeted refinements
without touching the identity, sidebar/topbar architecture, requests table/card behavior,
request-detail structure, lawyer/accountant dashboards, portal shell, RTL/LTR mirroring, or
accessibility/contrast compliance established above — all of that is preserved exactly.

| # | Refinement | What changed | Files |
|---|---|---|---|
| 1 | Public homepage | Hero rebuilt: kicker + stronger eyebrow/h1 hierarchy, a "browser-chrome" product-preview mockup (mini KPIs + live request tracker + recent-requests list) replacing the single tracking card, a subtle faint scale-of-justice watermark + dotted grid texture (CSS/SVG only, no stock imagery), a 4th trust signal (real-time tracking). Search panel, journey/steps, and all lower sections unchanged. | `public-home.html`, `layout.css` |
| 2 | Operational density | `.main` padding, `.page-head` margin, `.panel`/`.stat-card` padding, table row height, and `.two-col` gaps reduced ~10–15% (new `--space-4-5` token) across admin/requests/cases/treasury/request-detail/lawyer/accountant screens only — marketing and portal pages are untouched since they weren't in scope. | `tokens.css`, `components.css`, `layout.css`, per-page `<style>` blocks |
| 3 | Corporate geometry | `--radius-lg` 16→10px, `--radius-xl` 20→12px (panels, stat-cards, hero-art, dialogs). `--radius-sm`/`--radius-md` (buttons, inputs, small icons) and `--radius-full` (all pills/chips/badges) are untouched. | `tokens.css` |
| 4 | Sidebar — full navigation | New standalone `sidebar-full-nav.html` demonstrates all 14 real Sanad modules (dashboard, appointments, requests, cases, renewals, clients/companies, employees, treasury, revenue/expenses, payroll/custody, reports, notifications, CMS, settings/security/permissions) in the *same* sidebar width/color/mechanics, using collapsible groups (`.side-group.collapsed`) for the lower-priority groups. The sidebar on every other page is untouched. | `sidebar-full-nav.html`, `layout.css` (`.side-group-label.toggle`), `app.js` |
| 5 | Cases | Added a case-detail preview block below the list (tabs: Overview / Memoranda·Documents·Evidence / Fees·Expenses / Judgment·Appeal·Execution) covering court+circuit+case#, parties, next hearing, a multi-person team stack, memoranda/evidence rows, a fee breakdown, and a judgment→appeal→execution steps indicator. | `cases.html` |
| 6 | Treasury | Added a second KPI row (monthly revenue, monthly expenses, outstanding custody, net in/out) and reference + linked-request columns on the transactions table; added a "Report" action alongside Export. | `treasury.html` |
| 7 | Request detail | Kept the existing tab structure and added four tabs: Quotation, Payments, Subtasks, Visits & appointments — so the default (Details) view stays uncrowded while the full data model is demonstrated. | `request-detail.html` |
| 8 | Design system | Elevation tokens (`--shadow-sm/md/lg`) tightened alongside the radius pass for a more grounded, less "floaty" feel; radius-scale swatch labels and a short note updated to match. Palette, typography, and all chip/badge/pill styling are unchanged. | `tokens.css`, `design-system.html` |

---

## V2 — reference-informed refinement (this pass)

Built from three sources combined, per the V2 brief: (A) the real Sanad templates/CSS/routes for
what every page actually contains, (B) five approved visual-reference screenshots (treasury/
revenue/payroll dashboard, clients/support/subscriptions/security screens, employee list/profile/
permissions/performance) for visual language only, and (C) the `ui-ux-pro-max` skill for
hierarchy, KPI selection, chart-type choice, and responsive/consistency review. The references are
**not** a functional spec: nothing was added, renamed, or removed from Sanad's real feature set
because a reference image did or didn't show it — see §"Deliberately not copied" below.

**Visual language adopted from the references:** icon-in-pastel-circle KPI cards with a period
caption (`.kpi-card` / `.kpi-strip`), compact horizontal distribution bars for category splits
(`.dist-list`), a pure-CSS/SVG daily bar chart (`.bar-chart`, no charting library — stays portable
to Sanad's plain-CSS stack), ranked mini-lists for "top N" data (`.rank-list`), tighter panel
radii/elevation, and a secondary settings side-nav. The references' exact hex identity
(`#0F4D4F` navy-teal / `#D4AF37` gold / `#EBEFE9` light bg) was **not** substituted for Phase 1's
tokens — see the note in `assets/tokens.css` for why (same family, already contrast-verified,
swapping would re-open the Phase 0B AA audit for a negligible hue shift).

### V2 prototype matrix

| # | Prototype (file) | Real Sanad source | Reference principles used | KPI / chart reasoning | Responsive & RTL/LTR |
|---|---|---|---|---|---|
| 1 | Design System V2 (`design-system.html`) | `public/css/admin.css`, `style.css`, audit's token findings | KPI-v2 cards, mini bar chart, distribution bars, permission role-cards, vertical workflow steps — added as new documented sections (§17–19) | N/A — this page documents the KPI/chart components other pages use | 390/768/1440 verified; AR+EN toggle |
| 2 | Public homepage (`public-home.html`) | `views/public/home.ejs` + real service/category/testimonial content | Product-preview "browser chrome" mockup with mini KPIs, floating contextual notification cards, subtle legal watermark texture | No KPIs invented for marketing copy; the 3 KPIs shown inside the product mockup (open requests / avg completion / satisfaction) mirror the same numbers used on `admin-dashboard.html` | 1440/768/390; AR+EN mirrors nav, hero grid, drawer side |
| 3 | Admin dashboard (`admin-dashboard.html`) | `views/admin/dashboard.ejs` | Icon-circle KPI strip; "requests by status" distribution replacing an empty second panel | Status distribution: real field (`request.status`) — answers "where are requests piling up," directly actionable (rebalance staff) | 1440/390; AR+EN |
| 4 | Full-navigation sidebar (`sidebar-full-nav.html`) | `views/partials/admin_nav.ejs` + `lib/permissions.js` module list | Same navy/gold sidebar, collapsible groups per reference's grouped-menu density | N/A | 1440/390; AR+EN; collapsed-group state shown |
| 5 | Requests (`requests.html`) | `views/admin/requests.ejs` (per audit) | KPI strip above the table (reference's finance-dashboard KPI-then-table pattern) | Total/open/urgent/completion — all derivable from `status` + `flag_urgent` fields already in the table rows | 1440/390; AR+EN; table→card confirmed at 390 |
| 6 | Request detail (`request-detail.html`) | same | Tabs kept from Phase 1; added quotation/payments/subtasks/visits tabs (reference's document-rich detail pattern) | N/A (no chart — a single request has no series to plot) | 1440/390; AR+EN; 8 tabs scroll horizontally on mobile, no overflow |
| 7 | Cases (`cases.html`) | `views/admin/cases.ejs` (per audit) | Case-detail block with tabs (overview / memoranda-docs-evidence / fees / judgment-appeal-execution), multi-avatar team stack | N/A (status counts shown as KPI strip: active/filed/judgment/hearings-this-week — all real case fields) | 1440/390; AR+EN |
| 8 | Clients & companies (`clients-companies.html`) | audit-identified module, no existing preview page | Compact list + quick-filter pills + a representative profile card (reference's client-list pattern) | Request count / outstanding balance shown per row — both plausible existing fields (mirrors treasury's per-request balance already used in `treasury.html`) | 1440/390; AR+EN |
| 9 | Employee list (`employees.html`) | audit-identified module (`lib/permissions.js` roles) | Status-dot list, department/role columns, KPI strip (total/active/leave/inactive) | Counts are simple status tallies of the same rows in the table | 1440/390; AR+EN |
| 10 | Employee profile (`employee-profile.html`) | same | 3-column profile: personal info / workload+payroll / permissions+devices (reference's profile layout) | Payroll mini-distribution (base/allowances/deductions) links to the same numbers shown in `payroll.html` — not invented separately | 1440/390 (stacks to 1 col ≤760px); AR+EN |
| 11 | Permissions (`permissions.html`) | `lib/permissions.js` — **Sanad's real roles only: admin, supervisor, lawyer, accountant** | Role-card list + permission-group grid + sensitive-permission warning box | N/A | 1440/390; AR+EN; explicit on-page note that no roles were invented |
| 12 | Treasury (`treasury.html`) | `views/admin/treasury.ejs` (per audit) | Icon-circle KPIs (was plain stat-cards), distribution bars for collection-method split | Collection-method split answers "are we over-reliant on one channel" | 1440/390; AR+EN |
| 13 | Revenue / Expenses (`revenue-expenses.html`) | audit-identified module | Daily bar chart + payment-method distribution + top-services rank list + receivables table (reference's revenue-dashboard layout), tabbed to add Expenses without duplicating the shell | Daily trend: "is revenue trending up". Top services: "which services should we invest in". Receivables: real overdue-tracking need | 1440/390; AR+EN; tab default un-crowds the view |
| 14 | Payroll (`payroll.html`) | audit-identified module | KPI strip, payroll-history table, vertical workflow steps (review→approve→pay), per-employee breakdown, net-composition distribution | All figures reconcile: base+allowances−deductions=net, shown 3 ways (KPI, table, distribution) from one consistent dataset | 1440/390; AR+EN |
| 15 | Reports (`reports.html`) | audit-identified module | KPI/filter/chart/table organization + "report identity" panel (mirrors reference's company/tax-identity panel) | Weekly trend: capacity-planning question. Requests-by-service: informs staffing/marketing | 1440/390; AR+EN; PDF/Excel actions kept conceptual (no invented export logic) |
| 16 | Settings / CMS / Security (`settings-cms-security.html`) | audit-identified module | Sticky secondary settings nav, grouped panels, integration status cards, activity-log table, danger-zone pattern | N/A | 1440/390; AR+EN; nav fixed to not stretch full-page height (V2 bug caught and fixed, see Known issues fixed) |
| 17 | Customer portal (`portal.html`) | `views/portal/*.ejs` | Kept deliberately simpler than staff pages per brief §21; only the top nav gained horizontal-scroll safety (see Known issues fixed) | N/A | 1440/390; AR+EN; no routing/auth touched |
| 18 | Lawyer dashboard (`lawyer-dashboard.html`) | role-scoped dashboard, audit-identified | KPI-v2 cards; added workload distribution (requests/cases/consultations) | Workload split: real counts of the lawyer's own assigned rows, already shown in the two panels above it | 1440/390; AR+EN |
| 19 | Accountant dashboard (`accountant-dashboard.html`) | same | KPI-v2 cards; added revenue-vs-expenses distribution | Directly reflects the two KPI numbers already on the page — no new data source | 1440/390; AR+EN |

### Known issues found and fixed during this pass

The V2 quality gate (Playwright script computing `document.documentElement.scrollWidth` at
390px, plus manual bisection) caught four real horizontal-overflow bugs, all fixed before final
screenshots:

1. **`request-detail.html` / `cases.html`** — the 8-tab / 4-tab horizontal-scrolling tab bar
   (`.tabs{overflow-x:auto}`) was blowing out its flex-column ancestor (`.stack`) because a flex
   item's automatic minimum width defaults to its content size, not 0. Fixed by adding
   `min-width:0` to `.stack` in `components.css` — a one-line, low-risk fix that applies
   everywhere `.stack` wraps scrollable content.
2. **`portal.html`** — the 5-item portal top nav (`.portal-nav`) had no wrap/scroll behavior and
   forced the page 114px wider than the viewport at 390px. Fixed with `overflow-x:auto` +
   `white-space:nowrap` on the nav links (`layout.css`), the same pattern already used for `.tabs`.
3. **`design-system.html`** — the "shell patterns" demo frame (a fixed 220px sidebar mockup)
   pushed the whole two-column TOC layout to 519px minimum width even at 390px, because
   `overflow:hidden` on a *descendant* doesn't cap an *ancestor* grid track's automatic minimum
   size. Fixed with `min-width:0` on the actual grid item (`.ds-shell > main`) plus
   `overflow-x:auto` on the demo frame itself so it scrolls instead of clipping invisibly.
4. **`settings-cms-security.html`** — the settings side-nav (`.settings-nav`) was stretching to
   the full height of the very long content column (CSS Grid's default `align-items:stretch`),
   which combined with implicit grid-row stretch made the active link's dark background balloon
   to fill the whole column. Fixed with `align-items:start` on `.settings-shell` and made the nav
   `position:sticky` (a genuine UX improvement, not just a bug fix).

All four are documented here rather than silently fixed, per the review process established in
Phase 0/0B: analyze the real cause before patching, then record it.

### Deliberately not copied from the reference images

- The references' exact color hex values (`#0F4D4F`/`#D4AF37`/`#EBEFE9`) — Phase 1's
  already-audited navy/brass tokens were kept (see `tokens.css` note).
- Role names shown in the references ("مدير النظام", "مراجع", generic "موظف") — the Permissions
  page uses Sanad's **real** four roles from `lib/permissions.js` only (admin/supervisor/
  lawyer/accountant); no "reviewer" or generic "staff" role was invented.
- The references' support-ticket kanban board and company-subscription screens — not in the V2
  deliverable list (§27), so not built, to keep scope matched to what was actually requested.
- Emoji used in one reference-adjacent earlier draft (🔴) — removed; replaced with a CSS dot
  indicator, per the brief's explicit "avoid emoji" instruction.
- Any KPI or chart that would require data Sanad doesn't currently expose (e.g., no invented
  "customer lifetime value" or "predicted churn" metrics, even though dashboards like this often
  have them) — flagged as a **possible future enhancement**, not built into this preview.

### Accessibility & environment notes

- Every new component reuses Phase 0B's contrast-verified color tokens; no new raw colors were
  introduced. Focus-visible styling, `role="status"`/`role="alert"` on alerts, and
  `aria-hidden` on decorative icons all carry over unchanged from Phase 1.
- The Playwright console-error check flagged one identical error on every single page:
  `net::ERR_CERT_AUTHORITY_INVALID` for the Google Fonts `<link>` request. This is the sandboxed
  session's network proxy intercepting TLS for an external CDN — not a real application error
  (the page still renders with the system fallback in the font stack). It is reported here rather
  than hidden.

---

## 1. Design direction & identity evolution

Sanad's current palette (`--ink:#12303a`, `--brass:#c9a24b`, `--paper:#f7f4ee`, plus the
`--muted`/`--brass-deep` values fixed for contrast in Phase 0B) is **kept as the primitive
layer**, not replaced. What's new is a formal three-tier token structure (primitive → semantic
→ component), a documented type/spacing/radius/shadow scale (none of which exist as a system
today — audit finding, Phase 0 §3), and a single consistent icon language replacing the
Unicode-glyph/emoji/SVG mix the audit flagged.

| Token | Value | Source |
|---|---|---|
| `--navy-800` (primary) | `#12303a` | = existing `--ink`, unchanged |
| `--brass-700` (accent text) | `#856527` | = existing `--brass-deep` **after** the Phase 0B contrast fix |
| `--brass-500` (accent bg) | `#c9a24b` | = existing `--brass`, unchanged |
| `--paper-50` / `--gray-50` | `#f7f4ee` / `#eef1f0` | = existing `--paper` / `--bg`, unchanged |
| `--slate-600` (muted text) | `#5c6b73` | = existing `--muted` after Phase 0B |
| success / warning / danger / info | `#227a4a` / `#94571a` / `#b3423e` / `#2568a0` | refined from the existing semantic set — see contrast table below |

### Contrast ratios (WCAG AA — all verified with the standard relative-luminance formula, not estimated)

| Pairing | Ratio | Required |
|---|---|---|
| navy-800 text / white | 13.9:1 | 4.5:1 |
| ink-900 body text / white | 14.7:1 | 4.5:1 |
| slate-600 muted / white | 5.5:1 | 4.5:1 |
| slate-600 muted / app bg | 4.9:1 | 4.5:1 |
| brass-700 accent text / white | 5.4:1 | 4.5:1 |
| navy-800 text / brass-500 bg (primary CTA) | 5.8:1 | 4.5:1 |
| white / success-700 solid | 5.3:1 | 4.5:1 |
| white / warning-700 solid | 5.8:1 | 4.5:1 |
| white / danger-700 solid | 5.6:1 | 4.5:1 |
| white / info-700 solid | 5.9:1 | 4.5:1 |

Full swatch grid + this table are rendered live in `design-system.html#colors`.

### Typography — one deliberate non-change

**Tajawal is kept for both Arabic and English**, rather than introducing a second web font.
The audit found Tajawal already renders both scripts acceptably in production Sanad; adding a
Latin-only "premium" heading font would mean a second font-load, a font-pairing decision with
no functional benefit, and a visible seam between the "old" and "new" typographic identity in
mixed contexts (e.g. an Arabic page with an English company name). What's new is the *scale*
Sanad doesn't currently have: `--text-xs` through `--text-4xl` (fluid on the largest step),
consistent weights (400/500/700/800), and `--leading-relaxed:1.7` for Arabic body copy — the
exact line-height Sanad's own `admin.css`/`style.css` already use, now named and documented
rather than repeated ad hoc.

### Icons

One self-authored outline SVG sprite (`assets/icons.svg`, ~35 symbols, 1.75px stroke, 20/24px
sizes) replaces the Unicode box-drawing glyphs (`▦▤▣`), emoji (`🔔💬`), and one-off inline SVGs
the audit found mixed across `admin_nav.ejs`, `dashboard.ejs`, and `home.ejs`. Every icon is
referenced via `<svg class="icon"><use href="assets/icons.svg#i-name"/></svg>` — the same
`<svg><use>` sprite pattern Sanad's own `footer.ejs` social icons already use successfully, so
adopting it project-wide is additive, not a new mechanism.

---

## 2. Preview-by-preview: what changed, what was preserved, how it maps back

### `design-system.html` — the system itself
No production equivalent — this is the reference document. Everything in it (buttons through
loading states) is the vocabulary the other 8 pages compose from.

### `public-home.html`
- **Changed visually:** formal type scale on the hero, KPI-style stats band (was plain text),
  consistent card components across categories/services/companies/testimonials/plans, one
  icon language instead of the current `♙◉▣` Unicode glyphs.
- **Preserved:** the section order and content model from `views/public/home.ejs` exactly
  (hero → search → categories → popular services → companies → stats → journey → testimonials
  → plans → FAQ → final CTA → footer) — this is a restyle of the existing structure, not a new
  information architecture. The floating WhatsApp button, the sticky/blurred header, and the
  mega-menu-style service dropdown concept are all kept.
- **New, not currently in production:** a public mobile nav *drawer* (hamburger → slide-in
  panel with a scrim) — the audit found the current public site's `.site-nav` has **no**
  fallback at all below 620px in some contexts; this preview gives it the same drawer mechanic
  admin already has, applied to the public header.
- **Maps to:** `views/public/home.ejs` + `views/partials/header.ejs`/`footer.ejs`,
  `public/css/style.css`.

### `admin-dashboard.html`
- **Changed visually:** KPI cards use the new `.stat-card` component (icon chip + label +
  tabular-figure value), panels use consistent `.panel-head`/`.panel-body`/`.panel-foot`
  structure, status badges use the new `.badge` variant system instead of inline
  `style="background:..."`.
- **Preserved exactly:** the widget set and layout the audit rated highly — filter row, 4-tile
  KPI row, "requests needing attention" table, notifications panel, team overview, recent
  activity, quick actions. This is a restyle, not a re-composition; the Phase 0 audit's
  role-tailoring recommendation (different widgets per role) is *demonstrated* separately in
  `lawyer-dashboard.html`/`accountant-dashboard.html` rather than folded into this one file, so
  the admin/office-manager view stays exactly what a real office manager already expects.
- **Sidebar/topbar/mobile drawer:** structurally identical mechanism to
  `views/partials/admin_nav.ejs` + `public/js/admin.js` — docked sidebar ≥1000px, off-canvas
  drawer + scrim below it, hamburger in the topbar. Verified in this preview's own
  `assets/app.js`.
- **Maps to:** `views/admin/dashboard.ejs`, `views/partials/admin_nav.ejs`/`admin_head.ejs`,
  `public/css/admin.css`.

### `requests.html`
- **Changed visually:** one unified filter-bar component (the audit found 4 different
  filter-bar patterns across `requests.ejs`/`cases.ejs`/`bookings.ejs`/`clients.ejs` — this
  preview standardizes on one), one status-badge system (the audit's other major standardize
  finding), and a real `<nav class="pg-nav">` pagination component instead of hand-rolled
  windowed pagination markup.
- **Preserved:** the exact filter set from `views/admin/requests.ejs` (search, status,
  company/branch, employee, quick date-range pills, urgent flag) and the tabs-for-archive
  pattern.
- **Table → card at ≤760px:** the identical mechanism already in `admin.css`
  (`data-label` attributes read by CSS `::before`) — resize the browser below 760px on this
  page to see it collapse exactly like the real `table.tbl` does today. Nothing new invented.
- **Maps to:** `views/admin/requests.ejs`, plus the shared table/filter/pagination rules that
  currently live scattered across `admin.css`'s version-era blocks.

### `request-detail.html`
- **Changed visually:** tabs (Details / Documents / Messages / Timeline) replace the current
  `request_detail.ejs`'s single 1,423-line scroll with an action-picker `<select>`; a step
  progress indicator communicates status at a glance instead of only a text badge.
- **Preserved:** every real data section the audit found valuable — client info, assigned
  staff + tasks, fee summary with paid/due, document list, comment thread, and a distinct
  "actions" panel for reassign/extend/cancel. Nothing here removes information density; it
  reorganizes the *same* content into scannable tabs rather than one long page.
- **Maps to:** `views/admin/request_detail.ejs` — the single highest-value target for this
  pattern given its current length.

### `cases.html`
- **Changed visually:** the case list uses the *same* `.tbl`-family row-link pattern as
  requests (the audit flagged `cases.ejs`'s bespoke `.legal-row` CSS grid as the one list page
  that breaks the shared table convention, with no column headers and no responsive
  card-collapse) — here it's brought into the standard pattern, full-row-clickable and
  keyboard-accessible (matching the audit's own recommendation to standardize on that anchor-
  row model).
- **Preserved:** the KPI strip (active/filed/judgment/hearings-this-week), and the
  court/next-hearing/team columns the current page already surfaces.
- **Maps to:** `views/admin/cases.ejs`.

### `treasury.html`
- **Changed visually:** a simple horizontal bar-split for cash/bank/Instapay in place of the
  current mini conic-gradient donut (same information, no charting library added — the audit
  noted Sanad has zero real chart library and recommended not introducing one for this phase).
- **Preserved:** the deposit/withdraw/transfer tab model, the balance-by-method breakdown, and
  a distinct pending-approval panel — all present in the real `treasury.ejs`.
- **Maps to:** `views/admin/treasury.ejs`.

### `portal.html` — customer portal shell (explicitly visual-only)
This directly implements the Phase 0 audit's highest-priority portal finding: the current
portal has **no shell of its own** and inherits the full public marketing header (services
mega-menu, "Book appointment" CTA) on every authenticated page. This preview shows the
alternative — logo, My Requests / Support / Notifications / Account / Logout, nothing else —
using request *cards* (not the admin table) with inline progress, a "documents needed" alert,
and payment status, matching the audit's finding that the portal already does simplify the
data model well (just needs its own chrome). **This changes nothing about
`routes/portal.js`'s actual auth/session/routing** — it is a visual mock of what the shell
*could* look like if a future, separately-approved phase builds it.

### `lawyer-dashboard.html` / `accountant-dashboard.html`
Built for Sanad's **real** `lawyer` and `accountant` roles (`lib/permissions.js`) — no new
role invented. Each reuses the identical admin shell (sidebar/topbar) but composes different
widgets: lawyer gets "my requests / my cases / today's tasks / my appointments"; accountant
gets "treasury balance / pending approvals / payroll run status / financial alerts". This is
the concrete demonstration of the Phase 0 audit's dashboard-usability finding ("the dashboard
is dense-by-default for every role rather than role-composed") — implemented as two additional
static previews rather than a conditional inside one file, so each can be reviewed
independently. Supervisor/admin are represented by `admin-dashboard.html` itself, since
`supervisor`'s permission set is close to admin's per `lib/permissions.js`.

---

## 3. Responsive behavior — what's demonstrated, what's intentionally unchanged

All layout breakpoints in `layout.css`/`components.css` were chosen to match Sanad's *own*
existing component-driven thresholds (999/1000 sidebar dock, 760 table collapse, 620 phone
tightening, 1180-ish nav collapse) rather than inventing a new device ladder — consistent with
the Phase 0 audit's finding that Sanad's fluid, component-driven responsive strategy is sound
and shouldn't be replaced for aesthetic reasons. `responsive.css`/`responsive-admin.css`
themselves were not read into this preview's CSS and were not modified — this preview's
`layout.css` is a new, separate file that would *replace* the equivalent rules if adopted, not
patch the existing ones.

Verified in this preview's own screenshots (`screenshots/`) at 390 / 768 / 1440px:
- Sidebar docks at ≥1000px, becomes an off-canvas drawer with scrim below it (admin pages).
- Public nav becomes a hamburger drawer below 1024px.
- Stat-card grids step 4→2→1 columns.
- Tables collapse to labeled cards ≤760px.
- Filter bars stack to single-column on narrow viewports.

## 4. RTL/LTR — genuinely mirrored, not translated

Every page defaults to `dir="rtl" lang="ar"` (matching Sanad's primary language) and the
in-page toggle sets `dir`/`lang` on `<html>` live. Because `components.css`/`layout.css` use
logical properties throughout (`margin-inline`, `padding-inline`, `inset-inline-start`,
`border-inline-start`) — the same approach the Phase 0 audit rated as Sanad's strongest
existing pattern — flipping `dir` actually re-flows the sidebar to the opposite edge, re-aligns
text, and mirrors the select-arrow position, chevrons, and breadcrumb order. This is verified
in the `*-en-*.png` screenshots, not just asserted: compare `admin-dashboard-ar-1440.png` and
`admin-dashboard-en-1440.png` — the sidebar is on the right in one and the left in the other,
from the exact same HTML source.

## 5. Explicit non-changes (things this preview deliberately did not touch)

- No new spacing/typography *system* beyond formalizing values Sanad's CSS already uses.
- No replacement of `responsive.css`/`responsive-admin.css` — this preview's `layout.css` is
  net-new and standalone.
- No new backend role — only `admin`/`supervisor`/`lawyer`/`accountant` are represented.
- No change to portal routing/auth/session — `portal.html` is presentation only.
- No chart library introduced for `treasury.html`'s data visualization.
- Print/PDF pages (request_print.ejs, payroll_slip.ejs, access_card_print.ejs) are out of
  scope for this preview — the audit already flagged their inconsistency as a separate,
  narrower fix (shared print-CSS base) that doesn't need a visual-identity decision first.

## 6. Screenshot index

36 real Playwright/Chromium screenshots in `screenshots/`, all captured against the actual
rendered pages in this directory (not mocked):
- Full RTL+LTR × 390/768/1440 for `design-system`, `public-home`, `admin-dashboard` (18 shots)
- RTL desktop+mobile for `requests`, `request-detail`, `cases`, `treasury`, `portal`,
  `lawyer-dashboard`, `accountant-dashboard` (14 shots)
- EN desktop for `requests`, `portal` (2 shots, broadening the RTL/LTR comparison set)
- Mobile drawer open states for admin and public (2 shots)

---

## V3 — Selective Visual Refinement (this pass)

**V2's foundation is preserved, not rebuilt.** Same navy/teal/brass identity, same tokens, same
Tajawal type scale, same spacing/radius/shadow system, same SVG icon sprite, same button/form/
table→card components, same RTL/LTR logical-property mirroring, same sidebar/drawer mechanics,
same portal shell. V3 adds a restrained, institutional **motion system** on top of that
foundation, and applies **selective visual refinement** page by page — not a uniform redesign —
based on an explicit tier classification: pages judged already close to their real-Sanad ceiling
get polish only; pages with more headroom get moderate or major refinement. As in V2, three
sources feed every decision, with a strict priority order when they conflict: (1) real Sanad
functionality/data, (2) the approved visual references (principles only, never pixel-copied),
(3) the V2 design system already built, (4) this V3 brief, (5) general UI/UX judgment. No Sanad
service, field, workflow, role, route, or business rule was added, renamed, or removed to make a
page look more like a reference image.

**KPI rule applied throughout:** every KPI added or changed in this pass has a real Sanad field
behind it and a stated business question it answers — see the per-page log below. **Chart rule
applied throughout:** every chart is a `data-count-to` value, `.dist-list` split, `.bar-chart`
trend, or `.donut` composition drawn from data already present elsewhere on the same page (or an
adjacent page), never a decorative or invented series.

### Tier classification

| Tier | Treatment | Pages |
|---|---|---|
| A — keep V2, polish only | KPI-strip motion, spacing/typography micro-polish; **no structural change** | `admin-dashboard.html`, `revenue-expenses.html`, `permissions.html`, `lawyer-dashboard.html`, `accountant-dashboard.html` |
| B — V2 structure + moderate enrichment | KPI count-up added; existing V2 component (e.g. `cases.html`'s old `.stat-card`) brought onto the current `.kpi-card` system; light cross-page data consistency fixes | `requests.html`, `request-detail.html`, `cases.html`, `reports.html`, `portal.html` |
| C — major V3 refinement | New panels/interactions added, still composed entirely from existing V2 components + tokens | `public-home.html`, `clients-companies.html`, `employee-profile.html`, `treasury.html`, `payroll.html`, `settings-cms-security.html` |
| Light pass | Motion polish only, no tier-C interactions since these are reference/index pages, not workflow pages | `employees.html`, `sidebar-full-nav.html` |

### Motion system

New tokens in `tokens.css`: `--motion-fast:120ms`, `--motion-normal:200ms`, `--motion-slow:320ms`,
`--ease-standard`/`--ease-decelerate`/`--ease-accelerate` (cubic-béziers) — one shared vocabulary,
used everywhere instead of ad hoc durations. Philosophy: calm and fast (nothing bouncy, glowing,
or gaming-style), every pattern answers a real "what does this communicate" question, and
`prefers-reduced-motion: reduce` is honored globally (`transition-duration:0s!important;
animation-duration:.01ms!important` — see "Known issues found and fixed" below for why the
duration value itself mattered).

**Motion decision log**

| Pattern | Purpose | Trigger | Duration | RTL/LTR aware | Reduced motion | Performance |
|---|---|---|---|---|---|---|
| KPI count-up (`data-count-to`) | Draws the eye to the number that answers the page's headline question, once | Scroll into view (IntersectionObserver, once) | 700ms ease-out-cubic | N/A (numeric, `tabular-nums`) | Final value set immediately, no animation | `requestAnimationFrame`, text-only, no layout thrash |
| Bar/donut/dist-bar chart reveal | Chart "grows from baseline" so scale reads before value | Page load / scroll into view | `--motion-slow` (320ms), `--ease-decelerate` | `.dist-fill` transform-origin flips for RTL (`right` vs `left`) | Final state (full bar/value) is what's rendered — chart is equally readable static | `transform`/`opacity` only, CSS-only, no JS per frame |
| KPI card entrance | Signals "this is fresh data," light staggering guides top-to-bottom reading order | Page load | `--motion-slow`, staggered 40ms per card (`:nth-child`) | N/A | Opacity/transform collapse to instant | Pure CSS keyframes, `both` fill-mode (paints correctly from frame 0, no FOUC) |
| Section/card scroll-reveal (`[data-reveal]`) | Homepage-only pacing so the page doesn't dump everything at once | Scroll into view (IntersectionObserver, once) | `--motion-normal`, staggered by index mod 6 | N/A | `.revealed` applied immediately | CSS transition + one class toggle, no per-frame JS |
| Sidebar/mobile-drawer open/close | Standard slide-in wayfinding | Menu button click / Escape / scrim click | `--motion-normal`, `.2s` transform | Drawer slides from the correct inline-start edge per `dir` | Instant open/close, same focus management | `transform` only; focus moves in/out, scroll-locked while open |
| Sidebar group collapse | Shows/hides secondary nav without reflow jank | Group label click | CSS Grid `auto 1fr → auto 0fr` trick | N/A | Instant | Grid-track animation, no JS height measuring |
| Dropdown / dialog open-close | Confirms an action target before executing | Trigger click / Escape / scrim or close-button click | `--motion-fast` (dropdown) / `--motion-normal` (dialog) | Dropdown anchors to `inset-inline-end` (flips in RTL) | Instant open, **focus still moves synchronously** (see fix below) | opacity+visibility+transform only |
| Button hover/press/loading | Standard interactive feedback | Hover / active / `.loading` class | `--motion-fast` | N/A | Instant | `background`/`border-color`/`box-shadow`/`transform` only |
| Tab underline / active state | Confirms selection | Tab click | `--motion-fast` | N/A | Instant | class toggle, no animation needed beyond existing transitions |
| Table-row hover | Affordance that rows are interactive where applicable | Mouse hover | `--motion-fast` | N/A | Instant | `background` only |

**"If an animation cannot answer 'what useful purpose does this serve?': remove it."** Nothing in
this pass animates continuously (no blinking/pulsing "urgent" badges — urgency is communicated by
icon/label/color, exactly as the brief requires) and nothing depends on an animation completing to
be usable (every reduced-motion path was verified independently, not assumed).

### V3 quality gate — results

Full detail in `screenshots-v3/_v3-quality-report.json`, generated by a Playwright/Chromium script
that loads every page in a real browser (not a static analysis) and checks, per page, across an
**11-point responsive matrix** (320/360/375/390/414/430/768/820/1024/1280/1440px):

- **Horizontal overflow:** `document.documentElement.scrollWidth > innerWidth` at every
  breakpoint, for all 19 prototypes + `design-system.html` — **0 overflow instances**, after the
  two fixes below.
- **Console/page errors + failed requests:** captured across every page load — **0 real errors**.
  The only entry that appears is `net::ERR_CERT_AUTHORITY_INVALID` on the Google Fonts `<link>`,
  identical to every prior phase of this project — this is the sandboxed session's proxy
  intercepting TLS for an external CDN, not an application defect (verified: the page still
  renders correctly with the system font-stack fallback).
- **Broken images:** `img.complete && naturalWidth>0` check on every `<img>` — **0 broken**.
- **SVG `<use>` symbol resolution:** the script's own `document.getElementById(id)` check flagged
  every icon on every page as "missing," which is a **false positive in the test script itself**,
  not a real defect — Sanad's icons are referenced via `href="assets/icons.svg#i-name"` (an
  *external*-file sprite reference), which browsers resolve at paint time rather than via
  `getElementById` on the current document, so this check can never succeed for this pattern.
  Re-verified with an authoritative check instead: `grep -ohrE '#i-[a-z0-9-]+' *.html | sort -u`
  compared against every `symbol id="i-..."` in `icons.svg` via `comm -23` — **empty output,
  confirming zero real missing icons**. Documented here honestly rather than silently discarded.

**Real screenshots captured:** AR desktop 1440 + AR mobile 390 for all 19 prototypes (+ AR 768 for
`public-home`/`admin-dashboard`); EN desktop 1440 + EN mobile 390 additionally for the 7 pages the
brief marks critical (`public-home`, `admin-dashboard`, `requests`, `employee-profile`,
`treasury`, `payroll`, `settings-cms-security`); `design-system.html` captured as 5 scrolled
segments (AR) + AR mobile 390, given its length.

**Motion/interaction QA (Playwright, real browser interaction — not just static screenshots):**
sidebar drawer open/close, public-site mobile nav drawer, dropdown open/close, dialog/modal
open/close, tab switching, KPI count-up final value, chart reveal final opacity/state, a
loading→success feedback demo, live form recalculation (treasury balance-before/delta/after), and
RTL vs. LTR directional icon mirroring — **all run twice, once under normal motion and once under
emulated `prefers-reduced-motion: reduce`**, per the explicit requirement that motion QA must pass
in both modes with no layout shift, focus loss, hidden functionality, console errors, or RTL/LTR
regressions. Final result: **46/46 real checks pass in both modes** (the only non-passing lines in
a raw run are the same benign font-CDN cert message, once per interaction block, not a functional
failure).

### Known issues found and fixed during this pass

Three real bugs were caught by the checks above — analyzed to a root cause and fixed, not papered
over, per the review discipline established since Phase 0:

1. **1024px KPI-strip overflow** (7 pages: `admin-dashboard`, `treasury`, `payroll`, `reports`,
   `lawyer-dashboard`, `accountant-dashboard`, `design-system`) — `.kpi-card` is both a CSS Grid
   item (inside `.kpi-strip{grid-template-columns:repeat(4,1fr)}`) *and* a flex container
   internally. Grid items get an implicit `min-width:auto` (= their content's min-content) unless
   overridden; at exactly 1024px — just above the sidebar's dock breakpoint, where the 4-column
   row is tightest — the cards' combined min-content exceeded the available track width, and in
   this RTL layout the excess bled off the *left* edge of the viewport (grid overflow direction
   follows the inline-start/end axis, so it's invisible unless you scroll left, not right). Fixed
   with one line — `min-width:0` on `.kpi-card` in `components.css` — the same
   automatic-minimum-size fix already applied to `.stack` in the V2 pass, now applied at the grid
   level too. The card's existing `.role-kpi-label{overflow:hidden;text-overflow:ellipsis}` then
   truncates gracefully instead of forcing the track wider.
2. **320/360px overflow from off-canvas drawers** (`public-home`, `treasury`,
   `settings-cms-security`, `design-system`) — the mobile nav/sidebar drawers are correctly
   positioned off-canvas via `transform:translateX(...)` when closed, but Chromium includes a
   transformed element's *painted* position in `scrollWidth`'s scrollable-overflow calculation
   even though it's invisible — so a closed drawer could still make the page horizontally
   scrollable at narrow widths. Fixed with `overflow-x:hidden` on `html`/`body` in
   `components.css` — the standard, low-risk fix for this exact CSS transform/scrollable-overflow
   interaction; it clips the scrollable region without affecting any visible layout (verified:
   still 0 overflow-matrix failures after the fix, all drawers still visually correct open and
   closed).
3. **Dialog focus-trap silently failing under `prefers-reduced-motion: reduce`** — found by the
   motion/interaction QA the mid-task review explicitly asked for, not by the static screenshot
   pass. Root cause: the reduced-motion override was `transition-duration:.01ms!important`. `.01ms`
   is *not* exactly zero, so the browser still schedules it as a real (if extremely short)
   animated transition rather than an instant style change — meaning `getComputedStyle` queried
   synchronously in the same JS tick (as the dialog-open handler does, right after
   `classList.add('show')`, before calling `.focus()`) still read the pre-transition
   `visibility:hidden` value, and the subsequent `focusTarget.focus()` call silently failed because
   the browser considered the target not-yet-focusable. Under normal motion this wasn't a problem
   because the `.dialog`/`.scrim`/`.dropdown-menu` visibility transitions are declared with a
   literal `0s` duration already (only their *delay* uses a token), so the value flips
   synchronously. **Fix:** changed the reduced-motion override from `.01ms` to a literal `0s`
   (`components.css`) — confirmed no code anywhere depends on a `transitionend` event firing (grepped
   `app.js`/`components.css`, zero matches), so there was no reason to avoid exact zero. Re-verified
   with the same Playwright script: dialog focus now moves correctly into the dialog under both
   normal and reduced motion, with no other regression across the other 9 motion/interaction checks.

### V3 per-prototype decision log

Fields follow the brief's required format. `RESPONSIVE`/`RTL-LTR` are stated once here as the
**baseline** verified for every page (11-breakpoint clean, sidebar/drawer/table/chart mirror
correctly in both `dir`s) — only exceptions are called out per page.

**1. Public homepage (`public-home.html`) — Tier C**
- *Real Sanad source:* `views/public/home.ejs` + real service/category/testimonial content (unchanged from V2).
- *Preserved:* full V2 section order, content model, product-preview mockup, floating notification cards, search panel, journey steps.
- *Reference principles:* a dark "office solution" band is a common SaaS marketing pattern for the admin-tool half of a dual-audience product (client-facing + staff-facing) — used here because Sanad genuinely has both a customer portal and a staff admin app to advertise.
- *V3 changes:* stats-band numbers converted to count-up; hero floating cards and category/service/company cards and journey steps get scroll-reveal; new `.office-band` dark-navy two-column section — left: heading + 3-item checklist of real Sanad admin capabilities (request/case management, treasury/accounting, fine-grained permissions) + CTA; right: a mini admin-dashboard mockup reusing the exact same `.kpi-card`/`.dist-list` components as `admin-dashboard.html`, not a new visual language.
- *Not copied:* no stock photography or decorative imagery (brief explicitly disallows it for the admin app; the homepage mockup is a UI screenshot-style illustration, consistent with what's allowed for marketing pages).
- *KPI source:* the office-band mockup's 3 mini-KPIs (all-requests / treasury-balance / employees) and completion-rate bar are the *same* numbers already shown on `admin-dashboard.html`, not new invented figures.
- *Chart purpose:* completion-rate dist-bar answers "is the office keeping up with requests" — the exact metric a prospective office-manager buyer would want to see.
- *Responsive/RTL-LTR:* baseline; hero product-preview mockup deliberately excluded from scroll-reveal (stays always visible, no JS dependency for primary hero content).

**2. Admin dashboard (`admin-dashboard.html`) — Tier A (polish only)**
- *Real Sanad source:* `views/admin/dashboard.ejs`.
- *Preserved:* full V2 widget set and layout — no structural change, per tier-A rule.
- *Reference principles:* none newly applied (already applied in V2).
- *V3 changes:* KPI values converted to count-up, including the featured treasury-balance card (`data-count-suffix=" EGP"` replacing the old nested `<small>EGP</small>` markup — same displayed value, cleaner DOM).
- *Not copied:* n/a.
- *KPI source:* unchanged from V2 (real `status`/`flag_urgent` fields).
- *Chart purpose:* unchanged from V2 (status distribution).
- *Responsive/RTL-LTR:* baseline (this page was the site of the 1024px bug — now fixed, see above).

**3. Requests (`requests.html`) — Tier B**
- *Real Sanad source:* `views/admin/requests.ejs`.
- *Preserved:* filter set, tabs-for-archive, table→card collapse — all unchanged from V2.
- *Reference principles:* none newly applied.
- *V3 changes:* all 4 KPI cards converted to count-up.
- *Not copied:* n/a. *KPI source/chart purpose:* unchanged from V2 (total/open/urgent/completion, all from `status`/`flag_urgent`).
- *Responsive/RTL-LTR:* baseline.

**4. Request detail (`request-detail.html`) — Tier B**
- *Real Sanad source:* `views/admin/request_detail.ejs`.
- *Preserved:* the full V2 tab structure (Details/Documents/Messages/Timeline/Quotation/Payments/Subtasks/Visits) and fee summary — reviewed this pass and left structurally unchanged; already comprehensive.
- *V3 changes:* none (motion tokens apply automatically via shared components, e.g. tab-switch transitions).
- *Not copied / KPI / chart:* n/a — a single request has no series to plot, unchanged reasoning from V2.
- *Responsive/RTL-LTR:* baseline; 8 tabs remain horizontally scrollable with no overflow.

**5. Cases (`cases.html`) — Tier B**
- *Real Sanad source:* `views/admin/cases.ejs`.
- *Preserved:* case-detail tabs, team stack, court/hearing columns.
- *V3 changes:* the KPI strip's old, inconsistent `.stat-card`/`.value`/`.label` markup (a V1-era component never migrated to V2's system) was replaced with the current `.kpi-strip`/`.kpi-card` component, all 4 cards converted to count-up — a consistency fix, not a new metric.
- *Not copied:* n/a. *KPI source:* unchanged real case-status tallies (active/filed/judgment/hearings-this-week).
- *Responsive/RTL-LTR:* baseline.

**6. Reports (`reports.html`) — Tier B**
- *Real Sanad source:* audit-identified reports module.
- *Preserved:* KPI/filter/chart/table organization, report-identity panel, weekly trend + requests-by-service charts.
- *V3 changes:* 3 of 4 KPI cards converted to count-up (the 4th, "متوسط زمن الإنجاز," has a nested `<small>يوم</small>` unit suffix and was left as-is rather than forcing it into the count-up utility's simpler suffix model).
- *Not copied / KPI / chart:* unchanged from V2.
- *Responsive/RTL-LTR:* baseline.

**7. Portal (`portal.html`) — Tier B**
- *Real Sanad source:* `views/portal/*.ejs`.
- *Preserved:* deliberately simpler than staff pages, visual-shell-only (no routing/auth touched), per V2's explicit scope.
- *V3 changes:* added a second `.doc-pill` to the first request card ("مدفوع 2,000 من 4,700") that deliberately matches the *same* SND-1048 request's fee data already shown in `request-detail.html` — a cross-page data-consistency improvement, not a new feature.
- *Not copied / KPI / chart:* n/a. *Responsive/RTL-LTR:* baseline.

**8. Cases-adjacent Tier-A pages: Revenue/Expenses, Permissions, Lawyer dashboard, Accountant dashboard**
- *Revenue/Expenses (`revenue-expenses.html`):* real source = audit-identified module; V2's daily bar chart, payment-method distribution, top-services rank list, receivables table all preserved unchanged; **no structural V3 change**, per tier-A rule (reviewed this pass, judged already at its appropriate density).
- *Permissions (`permissions.html`):* real source = `lib/permissions.js`, Sanad's real 4 roles only; has no KPI cards (role cards + toggle switches), so reviewed and **left untouched** — nothing to polish that wouldn't risk the tier-A "no restructuring" rule.
- *Lawyer dashboard (`lawyer-dashboard.html`):* real source = role-scoped dashboard; KPI cards converted to count-up only; workload distribution (requests/cases/consultations) preserved unchanged from V2.
- *Accountant dashboard (`accountant-dashboard.html`):* real source = same; KPI cards converted to count-up only; revenue-vs-expenses distribution preserved unchanged.
- *Responsive/RTL-LTR:* baseline for all four.

**9. Clients & Companies (`clients-companies.html`) — Tier C**
- *Real Sanad source:* audit-identified clients/companies module.
- *Preserved:* the compact list + representative profile-card pattern from V2.
- *Reference principles:* avatar-circle-plus-name row identity, a live-updating detail panel driven by row selection (common CRM pattern), applied here because Sanad's client list already implies a "select a client, see their detail" workflow.
- *V3 changes:* added a 4-card KPI strip (total clients/companies/open requests/total outstanding, all count-up); rewrote table rows with avatar circles + rich `data-*` attributes; rewrote the right-column profile panel to update dynamically via row click (`select(row)` JS) instead of being static.
- *Not copied:* no client photography — avatar circles use initials, consistent with the rest of the app's avatar pattern (topbar `who` avatar, employee list).
- *KPI source:* total clients/companies/open requests are direct counts of the table's own rows; total outstanding sums the same per-row balance figures already displayed.
- *Chart purpose:* n/a (no chart on this page — a client list doesn't have a meaningful trend/split beyond what the KPI strip already states).
- *Responsive/RTL-LTR:* baseline; verified row-click updates the profile panel correctly in both directions.

**10. Employee list (`employees.html`) — light pass**
- *Real Sanad source:* audit-identified module (`lib/permissions.js` roles).
- *Preserved:* status-dot list, department/role columns — unchanged from V2.
- *V3 changes:* KPI strip (total/active/on-leave/inactive) converted to count-up. No structural change — this is an index/reference page, not a priority tier-C target.
- *Not copied / chart:* n/a. *KPI source:* simple status tallies of the same rows shown in the table.
- *Responsive/RTL-LTR:* baseline.

**11. Employee profile (`employee-profile.html`) — Tier C**
- *Real Sanad source:* same module as employee list.
- *Preserved:* the full V2 3-column layout (personal info / workload+payroll / permissions+devices).
- *Reference principles:* a compact "recent performance" summary panel, common in HR-profile references — added only because Sanad already tracks a task list for each employee, so it's a real derived view, not an invented metric.
- *V3 changes:* new "إنجاز المهام — آخر 30 يومًا" panel with a 3-row `.dist-list` (completed-on-time / completed-late / currently-open), with an explicit `role-metadata` note on the page stating this is derived from the same task list shown elsewhere, not a new data source.
- *Not copied:* no invented "performance score" or rating — just a count split of existing task states.
- *KPI source/chart purpose:* task counts and their completion split answer "is this employee keeping up with their workload," directly from the same task list already on the page.
- *Responsive/RTL-LTR:* baseline; verified at 3-column desktop and 1-column mobile.

**12. Permissions** — see item 8 above (Tier A, untouched).

**13. Treasury (`treasury.html`) — Tier C**
- *Real Sanad source:* `views/admin/treasury.ejs`.
- *Preserved:* deposit/withdraw/transfer tab model, balance-by-method breakdown, pending-approval panel — all from V2.
- *Reference principles:* a live transaction-entry form showing balance-before → delta → resulting-balance is a standard treasury/ledger UI pattern — used here because Sanad's real treasury already has exactly this deposit/withdraw/transfer operation, just not previously shown as a live preview form.
- *V3 changes:* KPI values converted to count-up (both rows); "Net flow" card replaced with a "Pending approval" count+amount card; new "حركة جديدة" panel — tabs (Deposit/Withdraw/Transfer) driving a live-recalculating balance-before/delta/after summary (wired to the account `<select>` and amount `<input>`); new "تركيب الرصيد الحالي" donut chart + legend; expanded transaction table with a "الطريقة" (method) column.
- *Not copied:* no real submit/persistence logic — the form recalculates a preview only, consistent with this being a design preview, not a functional treasury.
- *KPI source:* pending-approval count/amount and balance composition are drawn from the same transaction/method data already in the table below.
- *Chart purpose:* balance-composition donut answers "how much of the treasury sits in which method" — a real reconciliation question, not decorative.
- *Responsive/RTL-LTR:* baseline; this page's RTL `i-arrow-end` flow-arrow mirroring bug (see below) was found and fixed here, then verified to also benefit `public-home.html`'s pre-existing use of the same icon.

**14. Payroll (`payroll.html`) — Tier C**
- *Real Sanad source:* audit-identified payroll module.
- *Preserved:* KPI strip, payroll-history table, vertical workflow steps, per-employee breakdown, net-composition distribution — all from V2.
- *Reference principles:* a "selected employee" detail panel next to the payroll table (select-a-row-see-detail), same CRM-list pattern used on `clients-companies.html`, applied because payroll review is inherently a per-employee task.
- *V3 changes:* KPI strip converted to count-up; employee table expanded to 4 rows with a status column; new "بيانات الموظف المحدد" panel showing base/allowances/deductions/net/note/status for whichever row was last clicked, wired via a `select(row)` JS function.
- *Not copied:* no invented pay components — base/allowances/deductions are the same fields already in the table row.
- *KPI source/chart purpose:* the selected-employee panel's net figure reconciles the same base+allowances−deductions=net relationship shown 3 ways (KPI, table, panel) from one consistent dataset, unchanged from V2's reasoning.
- *Responsive/RTL-LTR:* baseline; row-click-to-panel interaction verified working correctly.

**15. Settings / CMS / Security (`settings-cms-security.html`) — Tier C**
- *Real Sanad source:* audit-identified settings/CMS/security module.
- *Preserved:* the sticky secondary settings nav, grouped panels, integration status cards, activity-log table, danger-zone pattern from V2.
- *Reference principles:* single-focused-panel workspace (only one settings section visible at a time, switched via the side nav) rather than one long stacked scroll — a standard settings-app pattern, applied because the brief explicitly calls for settings to feel like "a focused single-panel workspace, not an endless stacked page."
- *V3 changes:* added `data-settings-panel="svc|site|mail|cms|activity"` to each panel (all but the first start `hidden`); wired a new generic `.settings-nav`/`[data-settings-panel]` switcher in `app.js` (mirrors the existing `[data-tabs]` mechanism, but nav-driven) — no HTML restructuring beyond the panel-switching attributes.
- *Not copied:* n/a. *KPI/chart:* n/a (this page has no KPIs/charts, by design — it's a configuration workspace).
- *Responsive/RTL-LTR:* baseline; this page's nav-stretch layout bug (`align-items:stretch` default ballooning the short nav column to the tall content column's height) was found and fixed here (`align-items:start` + `position:sticky`).

**16–19. Full-navigation sidebar (`sidebar-full-nav.html`) — light pass**
- *Real Sanad source:* `views/partials/admin_nav.ejs` + `lib/permissions.js` module list — all 18 real modules, unchanged from V2.
- *Preserved:* the collapsible-group mechanism and module list exactly as V2 built it.
- *V3 changes:* the collapsible-group animation was rewritten from a JS height-measuring approach to a pure-CSS `grid-template-rows: auto 1fr → auto 0fr` trick (scoped via `:has()` so it only applies where this page's `.side-group-body` wrapper exists, leaving every other page's plain `.side-group` untouched); `aria-expanded`/`inert` wired on the toggle/body for correct assistive-tech state.
- *Not copied / KPI / chart:* n/a — this is a navigation reference page.
- *Responsive/RTL-LTR:* baseline; group collapse/expand verified to correctly remove collapsed content from the tab order via `inert`.

### Deliberately not copied from the reference images (V3-specific)

- No decorative photography anywhere in the admin app (staff/office/handshake imagery some SaaS
  references use) — the brief explicitly restricts the admin app to icons/charts/avatars/compact
  empty-state illustrations; only the public homepage may use abstract product-UI mockups.
- No continuously blinking/pulsing "urgent" indicators, even though several references use them
  for overdue items — Sanad's urgency is communicated through the existing icon/label/color
  system instead, per the brief's explicit motion restriction.
- No confetti/celebratory animation on the loading→success demo, even though some references use
  it for a completed action — kept to a simple fade-in message, consistent with "professional,
  restrained, institutional" motion.
- No new KPIs that would require data Sanad doesn't expose (e.g. no "employee performance score,"
  no "predicted churn," no "NPS") — every new KPI in this pass traces to a field or count already
  shown elsewhere on the same or an adjacent page; anything that would need new data is a
  **possible future enhancement**, not built into this preview (see below).

### Possible future-functional ideas discovered during this pass (not implemented)

These surfaced naturally while designing V3 pages but require real backend/data work beyond a
visual-preview scope, so they were **not** built — noted here for future consideration, kept
separate from anything actually implemented:
- A real "selected employee"/"selected client" detail-panel pattern (built visually in
  `payroll.html`/`clients-companies.html`) could generalize into a shared reusable partial if
  Sanad wanted this interaction pattern elsewhere (e.g. cases, requests).
- The treasury transaction-entry preview only recalculates a display value; a real implementation
  would need actual balance validation, an audit trail, and permission checks before persisting.
- The settings single-panel-workspace pattern could be extended with a "search settings" input if
  the number of real settings sections grows.

### V3 accessibility notes

No regressions to Phase 0B's contrast/focus/aria work — verified specifically because this pass
added interactive motion (drawers, dialogs, dropdowns) that could easily have broken it:
`aria-live`/`role="status"`/`role="alert"` on alerts unchanged; `main` landmarks unchanged; every
drawer/dialog/dropdown open moves focus in and every close returns it to the opener (verified by
the Playwright motion QA above, in both normal and reduced motion); `aria-hidden`/`inert` correctly
remove closed drawer/collapsed-group content from the tab order; all motion respects
`prefers-reduced-motion: reduce` with no feature depending on an animation completing.

---
