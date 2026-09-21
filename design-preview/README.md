# Sanad Design System Preview — Phase 1

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
  sidebar-full-nav.html — refinement-pass addition: full 14-module nav, collapsible groups
  screenshots/          — real Playwright/Chromium screenshots (390/768/1440, AR+EN)
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
