# Sanad v16.7.3 — UI/UX Audit & Design Plan

**Baseline commit:** `4f4bc0191f7046fb995e1ba6eec1940239bb7ea0` ("Import Sanad v16.7.3 application from provided ZIP (#2)")
**Baseline verified against:** `origin/main` HEAD at the time of this audit (exact match)
**Audit type:** Analysis and design planning only. No files were modified, no branches created, nothing committed as part of the audit itself.
**Method:** Direct read of the actual EJS/CSS/JS implementation (not screenshots or documentation) — ~110 templates, all 4 stylesheets (~200KB total CSS), all 4 client JS files, and the project's own responsive-hardening release/test documentation.

Findings are tagged **PRESERVE** / **IMPROVE** / **STANDARDIZE** / **REDESIGN** throughout, per the requested categorization.

---

## Scoping correction

The codebase implements **four roles** — `admin`, `supervisor`, `lawyer`, `accountant` (`lib/permissions.js`). There is no distinct "office manager," "deputy manager," or "secretary/reception" role anywhere in the permission system, nav gating, or views. In practice: **office/branch manager ≈ admin** (admin is "absence of a limit," not a permission set); **deputy manager ≈ supervisor** (the only role with near-admin breadth: cases, requests, treasury, clients, HR); **lawyer/employee = lawyer** role; **accountant = accountant** role; **secretary/reception has no dedicated surface** — intake/booking work is done by whoever holds `bookings.create`/`requests.create`, typically supervisor or lawyer. This audit maps findings to the roles that actually exist rather than inventing screens that don't.

---

## 1. Current UI/UX Architecture Map

Sanad is a **server-rendered, no-build EJS monolith** — Express + EJS, zero frontend framework, zero bundler. Four hand-written stylesheets, four hand-written client scripts. There is no component library, no CSS framework, no design-token build pipeline.

```
Public site (style.css + responsive.css)          Admin panel (admin.css + responsive-admin.css)
  views/public/*.ejs  (21 templates)                 views/admin/*.ejs  (58 templates)
  views/partials/header|footer|head.ejs               views/partials/admin_head|admin_nav|admin_foot.ejs
                                                        views/partials/crumbs|undo_banner.ejs
Customer portal (reuses public chrome — no shell of its own)
  views/portal/*.ejs (9 templates) → includes views/partials/header.ejs/footer.ejs directly

Shared client JS: public/js/{admin,compress,keep-place,password}.js
```

Three visually/architecturally distinct "skins" exist in the codebase today: the **public marketing site** (its own token set in `style.css :root`), the **admin/office panel** (a separate, larger token set in `admin.css :root`), and the **customer portal**, which has **no skin of its own** — it borrows the public site's chrome wholesale (§11). Templates throughout are written as dense, single-line minified EJS (no line breaks) — functionally fine, but it makes the source hard for a human to scan or diff, and it's why several bugs below (dead ternaries, undefined CSS vars, duplicate tab links) survived unnoticed.

---

## 2. Inventory of Major Page/Template Families

| Family | Count | Location | Notes |
|---|---|---|---|
| Public marketing/discovery | 21 | `views/public/` | home, about, services, category, page(sector), faq, guides, contact |
| Public booking/consultation | 6 | `views/public/booking_*`, `consultations.ejs` | guest-facing appointment flow |
| Public intake/tracking | 7 | `request.ejs`, `success.ejs`, `upload*.ejs`, `track*.ejs` | request submission → document upload → guest tracking |
| Auth (3 parallel systems) | 8 | `unified_login.ejs`, `portal/login.ejs`, `admin/login.ejs` + forgot/reset ×2 | see §11, §13 |
| Customer portal | 9 | `views/portal/` | requests, support, auth — no dedicated shell |
| Admin shell/chrome | 3 partials | `admin_head/nav/foot.ejs` | topbar+sidebar, 3 mobile-menu hotfixes resolved cleanly |
| Admin dashboard/account/settings | 9 | `dashboard, account, profile, settings, permissions, security*, activity, notifications` | permissions.ejs is the standout screen |
| Requests & cases | 9 | `requests*, request_*, cases*, case_*` | the operational hub; `request_detail.ejs` is 1,423 lines, the largest template in the app |
| Clients/companies | 5 | `clients, client, companies, company, contacts` | |
| Agenda/bookings/errands | 9 | `agenda, bookings, booking_*, errands, trip, destination, handover` | `handover.ejs` is mis-filed — it's HR offboarding, not errands |
| Treasury/payroll/expenses | 10 | `treasury, revenue, expenses*, custod*, payroll*` | best-disciplined module in the app |
| Reports/print/CMS | 8 | `report_*, access_card_print, content, homepage, social` | print-quality varies sharply (§9) |
| Renewals/support/trash | 4 | `renewals, support*, trash` | |

---

## 3. Existing Design-System Assessment

**What exists today:**
- Two separate `:root` token sets — `style.css` (public) and `admin.css` (admin) — both define color, radius (admin only), and shadow tokens with sane semantic naming (`--ok/--warn/--danger/--info` + `-bg` pairs). This is a real, usable foundation. **PRESERVE the concept.**
- No spacing scale as tokens anywhere — every padding/gap is a hardcoded pixel value.
- No typography scale as tokens — sizes are hardcoded per rule, though public-site headings do use fluid `clamp()` (a good pattern, §16).
- Component classes exist and are mostly reused: `.btn/.panel/.stat/.chip/.badge/.tbl/.alert/.field` — but each has been **redefined 2–4 times across chronological "version-drop" blocks** (`/* v10 */`, `/* v12.3 */`, `/* v14 */`, `/* v15.1 */`, `/* v16.5 */` comments in both `admin.css` and `style.css`), so the cascade order is now load-bearing. Confirmed literal duplicate rules (same selector, same breakpoint, functionally identical) between the v16.5-era block still living inside `admin.css`/`style.css` and the newer `responsive-admin.css`/`responsive.css` files.
- **Two classes of live bugs from this drift**, both concrete and fixable:
  - `admin.css` references `var(--paper)` and `var(--ink-deep)` — **never declared** in its own `:root` — so `.page-tab.on`, `.export-list a:hover`, and `.emp-avatar` silently lose their intended fill.
  - `style.css` (public site) references `var(--brass-soft)`, `var(--bg)`, `var(--gold)`, `var(--danger)` — these are **only defined in `admin.css`**, which the public site never loads — so the selected-services chip box and the required-field asterisk color silently fall back to nothing.
- **Icon system is fractured three ways**, in both public and admin: Unicode box-drawing glyphs (`▦▤▣◷⚙`), emoji (`🔔💬📞📱✉️`), and genuine inline SVG (footer social icons, upload-mode buttons). At least one glyph collision exists (`▣` used for both "cases" and "treasury" in the same admin nav map). No `aria-hidden` on decorative icon wrappers. **REDESIGN candidate** — this is the single highest-leverage visual-polish fix available (one small SVG set, applied everywhere).
- Status/badge styling uses **three incompatible technical patterns** side by side: inline `style="background:#hex"` (request status), a single fixed color with zero differentiation (case status — a genuine regression, `lib/cases.js` has no color field at all unlike `lib/i18n.js`), and mapped `.chip.ok/.warn/.danger/.brass` variant classes (agenda status — the only reusable, theme-able pattern of the three). **STANDARDIZE onto the chip-variant pattern.**
- No shared modal/dialog primitive exists. One real `<dialog>` (agenda "add appointment"); everywhere else uses `<details>`-as-popover or a hand-rolled `data-edit-*`/`data-done` JS toggle idiom, duplicated with slightly different attribute names in at least three files.

---

## 4. Responsive/Mobile Assessment

The v16.5 → v16.7 hardening work is **real and, at its newest layer, genuinely good** — this should not be assumed broken or thrown out.

- `responsive.css` (public, ~5KB) and `responsive-admin.css` (admin, ~9KB) are small, coherently organized, mobile-first, and use `clamp()`/`min()`/logical properties correctly. They are the cleanest CSS in the codebase. **PRESERVE both files as-is.**
- The **table→card responsive pattern** (`data-label` attributes + CSS `::before{content:attr(data-label)}`, with an explicit `.table-scroll` opt-out for genuinely dense analytical tables) is a deliberate, well-executed two-mode design — operational lists collapse to cards, financial/analytical tables keep native horizontal scroll. **PRESERVE.** One gap: the `.table-scroll` escape hatch exists in CSS but isn't actually applied to any of the wide treasury/payroll/permission tables that would benefit from it — **IMPROVE** (apply the class, no new CSS needed).
- **The 3-hotfix mobile-menu history (v16.7.1/2/3) resolved cleanly.** Cross-checked the current `admin_nav.ejs` + `admin.js` + `responsive-admin.css` against each hotfix doc: the end state is coherent, not patchwork. Only debt: a dead `.menu-btn` CSS selector (three references, `admin.css:119-127,786,1750`) left over from before the v16.7.3 rename to `.account-menu-toggle` — it matches nothing today and risks confusing a future editor into re-triggering the same bug class. **IMPROVE — delete it.**
- **Breakpoint fragmentation is real**: ~24 distinct `@media` thresholds across the four CSS files, accumulated across seven version eras (v6→v16.7). The requested audit matrix (320/360/375/390/414/430/768/820/1024/1280/1440) mostly falls *between* the project's own thresholds rather than on them — the project instead clusters around its own component-driven breakpoints (999/1000 admin dock, 1180 public nav collapse, 820 tablet reflow, a dense 560–900 band). This is a **defensible strategy** (fluid `clamp()`-driven, not device-driven) but it's undocumented as a deliberate scale, and several thresholds are near-duplicates from different code eras (620 vs 640, 900 vs 980 vs 1000, 820 vs 821). **STANDARDIZE**: name the de facto scale explicitly (it's already close to usable) rather than adding more breakpoints.
- Data-heavy tables (treasury, payroll, permissions) currently all default to card-collapse on mobile/tablet rather than using the scroll escape hatch — reasonable for readability but loses at-a-glance grid scanning for accountant users on a tablet. **IMPROVE.**
- The project's own test docs (`RESPONSIVE-TEST-REPORT-v16.7.0-AR.md`, `FINAL-VERIFICATION-v16.5.0.txt`) are honest that **actual browser/pixel verification never ran** in their build environment (Chromium download failures) — their "PASS" rows are CSS/DOM-level and syntax checks, not rendered-viewport confirmation. Treat their breakpoint-matrix claims as verified design intent, not browser-tested fact.

---

## 5. RTL/LTR Assessment

The bidi implementation is **more mature than most of what this audit found elsewhere in the codebase** — but it has one genuinely load-bearing bug.

- Direction is driven correctly end-to-end: `middleware/locals.js` sets `dir` from session `lang`, both `head.ejs` and `admin_head.ejs` render `<html lang dir>` per request, and `lang` is a real, reachable toggle (not just a public-site cosmetic) — it persists through login on both the admin and portal sides.
- Public site (`style.css`): broad, correct use of logical properties (`margin-inline`, `padding-inline`, `inset-inline-end`) throughout; direction-flipped arrow glyphs computed in EJS (`dir==='rtl'?'←':'→'`); numeric/reference values consistently use `direction:ltr;unicode-bidi:isolate` (`.num`, `.req-ref`, `.up-ref`) — a deliberate, repeatedly-applied, correct pattern. Mobile nav drawer slide direction is explicitly and correctly handled per-`dir`. **PRESERVE all of this.**
- Admin desktop shell (`admin.css`) uses **physical** `left/right` under explicit `[dir=rtl]/[dir=ltr]` selector pairs instead of logical properties — and the code comments explaining *why* (a documented specificity/transform interaction that broke the sidebar once already) show this was a deliberate, reasoned engineering choice, not an oversight. **PRESERVE as documented.**
- **The one real, concrete LTR-breakage bug in the codebase**: `admin.css:46-59` sets `body.admin{direction:rtl;text-align:right}` **unconditionally**, with no `[dir="ltr"] body.admin` reset anywhere in the file. Because this is a direct author rule on the element (not inherited), it wins regardless of `<html dir="ltr">`. Result: when an office-staff user switches to English, the sidebar/topbar/main *positions* correctly flip left (those *are* gated by `[dir]`), but all body text stays right-aligned/RTL-flowing — a broken hybrid UI, not a cosmetic nit. This has never been called out in the project's own responsive docs, which only claim drawer- and nav-direction correctness. **REDESIGN priority: fix immediately** — it's a one-line, low-risk CSS fix with outsized correctness impact for every English-mode office user.
- Two minor, low-blast-radius spot-checks worth doing later: a shared admin `<select>` arrow rule mixes a physical `background-position:left` with a logical `padding-inline-start`, which will visually collide in LTR mode (affects every select in the admin panel — small fix, wide reach); and a couple of physical `left/right` offsets inside a homepage decorative "tracking widget" mockup (intentionally pinned LTR, low risk).

---

## 6. Accessibility Assessment

**Genuine strengths, worth preserving:**
- Both public and admin mobile nav drawers implement a real focus trap (Tab/Shift-Tab cycling, Escape-to-close, return-focus-to-opener, background-scroll lock, `aria-expanded`/`aria-hidden` management) — unusually solid for a no-framework stack.
- `autocomplete` attributes (`email`, `current-password`, `new-password`, `username`) are used correctly and consistently across all login/register/reset surfaces — password managers will work well throughout.
- Labels are properly `for`/`id`-associated everywhere checked.
- `:focus-visible` is globally defined in the admin panel; `prefers-reduced-motion` is respected; touch targets are deliberately enlarged under `@media(pointer:coarse)`.
- Required-field marking, `.field.req` auto-asterisk, and the shared `password.js` strength/match/toggle widget are consistently built (though not consistently *wired*, see §13).

**Gaps, ranked by severity:**
1. **A ticket-list table with `onclick` on `<tr>` and no `<a>`/keyboard path** (`views/portal/support.ejs`) — a total loss of function for keyboard/screen-reader users, not a degradation. **REDESIGN priority.**
2. **Contrast failures**, all measured against actual token hex values:
   - `.btn.brass` (white text on `--brass` #c9a24b) ≈ **2.4:1** — this is the site's *primary CTA style*, used dozens of times site-wide (nav "Request service," hero CTAs, form submits). Fails AA badly.
   - `--muted-2` (#8b9aa1, admin chip/secondary text) ≈ **2.9:1** — fails AA.
   - Small bold `--brass-deep` links (e.g. "forgot password?") ≈ **3.4:1** — fails AA for normal-size text.
   - `--muted` on `--paper` background (public body/help copy) ≈ **4.2:1** — just under AA.
   These four pairs recur across dozens of components; fixing the tokens fixes the whole app at once (deferred to a later phase per scope).
3. Error banners (`.form-alert`, `.alert.err`) and the live password-strength/match feedback have no `role="alert"`/`aria-live` — screen-reader users may not hear that a submission failed or that their password meets requirements.
4. Form-field `:focus` in the public site removes the default outline and substitutes only a border-color shift (no ring/shadow) — borderline for WCAG 2.4.7.
5. Public pages other than the homepage have no `<main>` landmark.
6. Nav/stat icons (Unicode glyphs) lack `aria-hidden`, risking redundant glyph-name announcement before the adjacent text label.

---

## 7. Navigation/Information-Architecture Assessment

- **Admin**: single consistent pattern — fixed topbar + collapsible sidebar with grouped `<details>` sections (Business, Clients & Relations, Employees, Finance, Settings), all permission-gated via `can()`/`cm()`. Structurally sound and consistently applied everywhere. Breadcrumbs (`crumbs.ejs`) are broadly adopted (43 admin views) but Arabic-only/admin-only by design.
- **Public site**: header+nav+footer pattern is consistently included everywhere via one partial; breadcrumbs are used inconsistently (present on 7 page types, absent on `about/faq/guides/consultations/unified_login/support`).
- **Customer portal — the weakest IA in the app**: no dedicated authenticated shell at all. A logged-in customer checking case status sees the *entire* marketing header (Services mega-menu, Guides dropdown, "Book appointment" CTA, language switch) above their actual task; the only concession to being logged-in is one link/label swap (`/login`→`/portal`). Portal pages then hand-roll three different breadcrumb-like patterns (`crumb-home`, `.crumbs`, `.crumbs-bar`) rather than sharing one. **REDESIGN candidate**: give the portal a minimal authenticated shell (logo + My Requests / Support / Logout), dropping marketing nav once a client session exists.
- **Auth entry points are genuinely confusing at the architecture level**: three separate login implementations exist — `unified_login.ejs` (a smart router trying both staff and client tables), `portal/login.ejs` (client-only, reachable mainly by direct/redirect link, effectively orphaned since the header always links to `unified_login`), and `admin/login.ejs` (staff-only). Two of these do the same job (customer login) with different field labels, different error copy, and no visual relationship. **REDESIGN**: pick one customer-login surface and retire or clearly re-scope the other.

---

## 8. Dashboard Usability Assessment by Role

Mapped to the four real roles:

- **Admin** (≈ "office manager"): sees everything — full sidebar, all dashboard financial tiles (`showMoney`), permissions/settings/security modules. The `permissions.ejs` screen (plain-language labels, role-vs-override provenance chips, danger-group highlighting, live "N of M" counts) is the **strongest, most usable admin screen in the entire audit** — a genuine reference pattern.
- **Supervisor** (≈ closest fit to "deputy manager"): near-admin breadth per `lib/permissions.js` (cases, requests, treasury, clients, HR, content) but the dashboard itself doesn't tailor its widget *set* to this — role-awareness is limited to a `showMoney` gate and one label swap ("My requests" vs "All requests" for lawyers).
- **Lawyer/employee**: dashboard is scoped only by that single label swap; otherwise sees the same dense multi-`stat-grid` dashboard (up to ~11 stat tiles before any real content) as everyone else. No lawyer-specific view.
- **Accountant**: has no dashboard customization either; reaches their actual daily tools (payroll, treasury, custody approvals) via the same generic sidebar as everyone else.

**Overall**: the dashboard is dense-by-default for every role rather than role-composed. **IMPROVE** (deferred): define per-role widget sets.

---

## 9. Tables/Forms/Filters Usability Assessment

**Tables**: `requests.ejs`, `clients.ejs`, `companies.ejs`, `trash.ejs` share one real, consistent pattern (`<table class="tbl">` + `data-label` responsive collapse + `.row-actions`). **`cases.ejs` breaks this entirely** — it's a bespoke CSS-grid list with no column headers, no `data-label` responsive behavior, and no pagination. Three different row-click models exist across list pages. **STANDARDIZE onto the cases.ejs anchor-row pattern** (deferred).

**Pagination**: `requests.ejs` and `clients.ejs` implement near-identical hand-rolled windowed pagination (duplicate code, not shared). `cases.ejs`, `errands.ejs`, `renewals.ejs`, `agenda.ejs` have **no pagination at all** — unbounded result sets, a real scalability risk.

**Filters**: at least **four different filter-bar markup/CSS patterns** exist for the same conceptual job. No saved filters anywhere.

**Forms**: `request_new.ejs` and `booking_new.ejs` independently reimplement the same "conditional field reveal" JS idiom at least four times across the codebase rather than sharing one helper. `request_new.ejs` also loses typed field values on a validation-error round trip in the general case. The multi-select "pick many" `<details class="picker-box">` idiom **is** consistently reused — genuine win, **PRESERVE**.

**Print pages — quality dispersion is the clearest "half-finished" signal in the app.** `request_print.ejs` and `access_card_print.ejs` are production-grade: `@page` rules, `page-break-inside:avoid`, dedicated mobile fallback breakpoints, hidden on-screen chrome. `report_print.ejs`, `payroll_slip.ejs`, and `case_report.ejs` are comparatively bare. **STANDARDIZE** (deferred): extract one shared print-document base.

---

## 10. Public Website Assessment

Strong bones, inconsistent polish.
- `request.ejs` (localStorage draft-autosave, sticky searchable service picker, 7-day restore) and `upload.ejs` (client-side image compression, drag/tap capture, real upload-progress feedback, graceful no-JS fallback) are **genuinely best-in-class flows** for a no-framework stack. **PRESERVE.**
- `consultations.ejs`, `booking_list.ejs`, and `booking_detail.ejs` look like an earlier, abandoned iteration next to `services.ejs`/`request.ejs`. **REDESIGN candidates** (deferred).
- CMS-driven homepage (`home.ejs`) is genuinely flexible for show/hide/reorder/text content, but its backing CSS has three stacked "era" overrides of the same selectors. **REDESIGN (consolidation)**, deferred, not urgent.
- Footer copy is hard-coded Arabic and never actually translates in English mode, despite every other part of the site being careful about bilingual branching — a concrete, easy **IMPROVE** (in Phase 0A scope).
- The `.btn.brass` contrast failure and the icon-system fragmentation are the two most visible "doesn't look fully professional" signals a first-time visitor would notice (deferred to a later, color/redesign phase).

---

## 11. Customer Portal Assessment

- **No dedicated authenticated shell** — every portal page inherits the full public marketing header/footer verbatim. Over-scoped, not under-built. **REDESIGN candidate**, deferred — explicitly out of Phase 0A scope.
- **Two live, divergent customer-login implementations** (`unified_login.ejs` vs `portal/login.ejs`). Deferred — explicitly out of Phase 0A scope; `routes/unified_login.js` must not be touched.
- `portal/support.ejs`/`support_detail.ejs` are **hardcoded Arabic-only**, breaking from the otherwise-consistent bilingual pattern used in `portal/login/register/requests`. Bilingual text is deferred; the **keyboard-accessibility fix for `portal/support.ejs`'s ticket rows is in Phase 0A scope** (functionality only, not the Arabic-only copy).
- Positive: `portal/requests.ejs`'s simplified card view and `portal/request_detail.ejs`'s client-safe case summary are **well-judged data simplifications** of the admin model. **PRESERVE** this scoping discipline.
- The shared `password.js` widget is wired inconsistently (admin has "suggest strong password," portal forms don't) — a trivial parity fix, deferred.

---

## 12–13. Visual Consistency Issues & Duplicated Patterns

The recurring meta-pattern across all six audit workstreams: **the same UI concept is solved 2-4 different ways in different corners of the app**, almost always because a feature was built in isolation rather than against a shared component.

| Concept | # of parallel implementations found | Where |
|---|---|---|
| Status/badge coloring | 3 (inline hex style, fixed-color class, chip-variant class) | requests vs cases vs bookings vs agenda |
| Filter bar | 4 | requests / cases / bookings / clients |
| List-row click affordance | 3 | requests (`onclick` tr) / clients (button) / cases (anchor-row) |
| Breadcrumb component | 3 named classes | admin `crumbs-bar` / portal `.crumbs` / portal `.crumb-home` |
| Print document base | effectively 2 quality tiers | request_print+access_card_print vs report_print+payroll_slip+case_report |
| Conditional-field-reveal JS | 4 hand-written copies | request_new / booking_new / agenda / errands |
| Modal/overlay | no shared primitive | one native `<dialog>`, everywhere else `<details>` or ad hoc JS toggles (3 copies) |
| Customer login | 2 divergent implementations | unified_login vs portal/login |
| Error-alert class | 2 names, one literally duplicated in CSS | `.alert.err` vs `.alert.danger` |
| Icon system | 3 | Unicode glyphs / emoji / inline SVG |
| KPI/stat-strip component | 3 | `.stat-grid`/`.icon-stat` / `.case-kpis` / none at all (booking_detail) |

None of this is catastrophic individually — the app works — but it's exactly the kind of drift a design-system pass is meant to close. All standardization items above are deferred beyond Phase 0A, which is scoped to correctness fixes only.

---

## 14. Components/Patterns That Should Be Standardized (future phases)

Priority order (highest leverage first): status/badge coloring → filter-bar markup → print-document base → breadcrumb component → list-row click affordance → icon system → error-alert class → pagination → conditional-field-reveal/modal-toggle JS.

---

## 15. Elements That Should NOT Be Changed (they already work well)

- **Password UX** (`public/js/password.js`)
- **Mobile nav drawers** (public and admin) — real focus trap, Escape, scroll lock, correct `aria-*` management
- **Table→card responsive pattern** (`data-label`/`::before`, with `.table-scroll` opt-out)
- **`responsive.css`/`responsive-admin.css`** in full
- **The three-hotfix mobile-menu resolution** (current state is coherent — only the one dead selector needs removal)
- **Currency/number formatting discipline** (`en-US` + `.num{direction:ltr;unicode-bidi:isolate}`)
- **`permissions.ejs`** — the best-designed admin screen in the app
- **`users.ejs`**'s same-screen permission assignment during employee creation
- **`access_card_print.ejs`** — the best-executed print page
- **`request.ejs`'s draft-autosave and `upload.ejs`'s compression/progress flow**
- **Admin's documented physical-`[dir]` sidebar/topbar positioning**
- **Payroll's staged, status-aware journey banner**
- **RTL logical-property usage on the public site**, and the `direction:ltr;unicode-bidi:isolate` convention for reference numbers app-wide

---

## 16. Proposed Sanad Design System (future phases — not implemented in Phase 0A)

Consolidate what already exists rather than inventing a new visual language: merge the two `:root` token sets (fixing the six cross-file leaked `var()` references — handled minimally/non-visually in Phase 0A, full token consolidation deferred), formalize a spacing scale, formalize the fluid type scale already used on the public homepage, extend radius/shadow tokens to the public site, adopt one small SVG icon set, converge status/badge styling onto the `.chip.{variant}` pattern, build one shared modal/dialog primitive, and document the de facto breakpoint scale explicitly.

---

## 17. Proposed Page-Layout System (future phases)

| Tier | Width | Behavior |
|---|---|---|
| **Compact** | ≤ 620px | Single column everywhere; tables → cards; stat grids → 2-up |
| **Comfortable** | 621–999px | 2-column grids where content allows; admin sidebar stays a drawer |
| **Docked** | 1000–1279px | Admin sidebar docks permanently; public nav shows full horizontal menu |
| **Wide** | ≥ 1280px | Content max-width caps engage; dense tables can use `.table-scroll` |

---

## 18–20. Prioritized Implementation Phases, Files Affected, Risk Assessment

**Phase 0 (superseded by 0A below) / Phase 0A — Correctness only.** See the Phase 0A implementation record appended below this audit for the exact scope approved and implemented.

**Phase 1 — Accessibility & contrast tokens** (deferred): `--brass`/`--muted`/`--muted-2`/`--brass-deep` contrast fixes, `aria-live` on error/password-feedback regions, `aria-hidden` on icon wrappers. Risk: low-medium, app-wide visual ripple from token changes — needs screenshot-diff verification.

**Phase 2 — Standardize badges, filters, print base, pagination** (deferred): `lib/cases.js` status colors, `cases.ejs` brought into `.tbl` pattern, shared print-base partial, shared pagination partial, filter-bar component. Risk: medium — touches list/detail pages across modules; must preserve exact `req.query` param names.

**Phase 3 — Icon system unification** (deferred): one SVG set replacing Unicode glyphs/emoji app-wide. Risk: low, presentational only.

**Phase 4 — Customer portal shell** (deferred): dedicated authenticated shell, login-surface consolidation decision. Risk: medium-high — touches session/redirect logic, requires separate explicit sign-off before touching `routes/unified_login.js`.

**Phase 5 — Spacing/typography tokens + dashboard role-tailoring** (deferred): Risk: medium — dashboard changes touch the highest-traffic page for every role; needs per-role UAT.

Across all phases: no route, API, schema, auth, permission, or accounting-logic files are touched except where explicitly flagged and separately approved (`lib/cases.js` status colors in Phase 2; login consolidation in Phase 4).

---

## Phase 0A — Correctness-Only Implementation (Approved Scope)

Approved by the user on top of this audit, restricted to the following seven verified correctness issues, with everything else (color/contrast, typography, spacing, icons, dashboard composition, portal shell, login consolidation, `lib/cases.js`, CSS version-block consolidation) explicitly deferred:

1. Add the minimum correct `[dir="ltr"] body.admin` direction/text-alignment override in `admin.css`, preserving the documented physical `[dir]` positioning of sidebar/topbar.
2. Fix the admin `<select>` arrow direction/position for both RTL and LTR with the smallest safe CSS change.
3. Resolve the undefined CSS custom properties (`--paper`, `--ink-deep` in admin; `--brass-soft`, `--bg`, `--gold`, `--danger` in public) by mapping to the existing token system.
4. Remove the confirmed dead `.menu-btn` CSS selectors, without touching `.account-menu-toggle` or current mobile-menu behavior.
5. Make the public footer bilingual using the existing `lang`/`dir` mechanism, without redesigning it.
6. Fix the keyboard-inaccessible ticket-row navigation in `views/portal/support.ejs` with a real semantic link, preserving existing destination/functionality.

Implementation details, exact files changed, test results, and verification evidence for Phase 0A are recorded in the pull request associated with branch `uiux/phase-0a-correctness`.

### Phase 0A follow-up — admin `<select>` arrow root cause (resolved)

Item 2 above was verified with real Playwright/Chromium browser testing to have a deeper root cause than "direction/position" alone: the dropdown arrow icon did not render in **either** direction. Root cause: `body.admin select` (admin.css, the "v12.3 unified visual system" block, no `@media` wrapper — applies at every breakpoint) sets the `background` shorthand (`background:#fdfdfc`), which resets `background-image`/`-repeat`/`-size`/`-position` to their initial values. That selector's specificity (`body`+`.admin`+`select` → (0,1,2)) is higher than `.field select`/`.toolbar select` (0,1,1), so it always won regardless of source order, blanking the arrow app-wide (~24 admin views use `.field`, e.g. `request_new.ejs`, `agenda.ejs`, `client.ejs`) at all six audited breakpoints (360–1440px) in both languages. The LTR-specific position override happened to already have enough specificity ((0,2,1)) to win on its own — which is why LTR position alone looked "correct" even with no visible icon to position.

Fixed with two new rules in `public/css/admin.css`, scoped `body.admin .field select`/`body.admin .toolbar select` (0,2,2) and its `[dir="ltr"]`-prefixed mirror (0,3,2), restoring only `background-image`/`-repeat`/`-size`/`-position`. Deliberately did not touch `padding-inline-start` (also lost to the same shorthand, left as-is) so padding, dimensions, colors, border, and focus behavior are byte-identical to Phase 0A before and after, verified via computed-style comparison at all six breakpoints in both directions. Fix is entirely inside `admin.css`; no EJS, JS, `responsive.css`, `responsive-admin.css`, or public-site file was touched.

### Known baseline issue — `adam` demo/dev credential inconsistency (not fixed, out of scope)

Discovered during Phase 0A browser verification, **not caused by this audit or its fixes**, and **not fixed** (touches `db/seed.js`, which is authentication code and explicitly out of scope for a UI/UX phase):

`db/seed.js` creates the bootstrap admin account `adam` with the documented password `1234` on first run. Immediately afterward, in the same `seed()` call, a separate one-time "owner account" initialization block (gated by a `owner_account_initialized_v1` setting, guarded by `NODE_ENV !== 'test'` and no `TENANT_ID`) overwrites that same account's username/password to `process.env.PLATFORM_ADMIN_USERNAME`/`PLATFORM_ADMIN_PASSWORD`, falling back to a **hardcoded default password `Mas@123456789`** when those env vars aren't set. Because this runs once per database (flag-gated) and non-production developer/demo setups typically don't set `PLATFORM_ADMIN_PASSWORD`, the documented `adam/1234` login (referenced in `TEST-ACCOUNTS.txt`, `db/demo-data.js` comments, and `README.md`) silently does not work on a fresh local/demo database — the real password is the hardcoded fallback instead. This is a pre-existing baseline behavior, verified independently of any Phase 0A change (reproduced on a freshly reseeded database with none of this audit's fixes applied). Flagging it here for visibility; any fix belongs to a separately-scoped, explicitly-approved change to `db/seed.js`, not a UI/UX phase.
