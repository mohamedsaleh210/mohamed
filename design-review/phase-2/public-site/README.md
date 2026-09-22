# Phase 2 — Public website checkpoint evidence

Branch: `uiux/phase-2-v3-integration`. This checkpoint covers the real
Sanad **public website**: the homepage and every real public page discovered
during inventory (service discovery, the request form, consultations/
booking, informational pages, request tracking, document upload, and
unified login). Screenshots below are real Playwright/Chromium captures of
the actual running application against real seeded demo data, not the
standalone `design-preview/` prototype.

Directory layout:
```
public-site/
  home/home-ar-{1440,390}.png, home-en-{1440,390}.png
  inner/<page>-ar-{1440,390}.png   (13 pages, both breakpoints)
  inner/appointments-mine-ar-1440.png, appointment-detail-ar-1440.png
    (captured live, mid-test, with the real booking_enabled=1 — see below)
  en/<page>-en-1440.png            (services, request, contact, about)
```

## Real-page inventory (before implementation)

Read `views/public/**`, `views/partials/{head,header,footer}.ejs`,
`routes/public.js`, `routes/bookings.js`, and the CMS-editing admin views
(`content.ejs`, `homepage.ejs`, restyled in the finance-admin checkpoint)
before touching anything, per the checkpoint brief's explicit requirement.
Real inventory of `views/public/`:

| File | Role | Status this checkpoint |
|---|---|---|
| `home.ejs` | Homepage, fully CMS-driven | Restyled — icons, motion, count-up |
| `services.ejs` | Service search + area/page grid | Icons already real SVG; added reveal |
| `category.ejs` | One category's services | Already clean; added reveal |
| `page.ejs` | One audience/sector page (`/p/:slug`) | Already clean; added reveal |
| `request.ejs` | Real multi-select service-picker request form (411 lines, heavy real JS: search, chips, localStorage draft) | One icon converted; verified all real JS interactions unchanged |
| `consultations.ejs` | Consultation service list | One icon converted |
| `booking_new.ejs` | Public booking form | Already clean, uses real `.booking-form` component |
| `booking_list.ejs` | `/appointments/mine` — client's own bookings | **Rebuilt** — was rendering with zero CSS |
| `booking_detail.ejs` | `/appointments/mine/:id` and the guest-token `/appointments/booking/:token` view | **Rebuilt** — same page serves both guest and logged-in views |
| `booking_invoice.ejs` | Print-only booking invoice | Left untouched — standalone print document, no header/footer, same reasoning as `case_report.ejs` in earlier checkpoints |
| `booking_error.ejs` | Generic booking error page | Already clean |
| `about.ejs`, `contact.ejs`, `faq.ejs`, `guides.ejs` | Informational pages | Icons converted (contact), reveal added |
| `support.ejs` (public) | Guest/client new-ticket form | Already clean; benefits from a shared `.form-grid` CSS fix made for `booking_detail.ejs` |
| `track.ejs`, `track_result.ejs`, `success.ejs` | Request tracking + post-submit success | Already clean, already used real components |
| `upload.ejs`, `upload_gate.ejs` | Document upload (460-line file with real client-side image compression, drag/drop, progress bar) | Already exemplary — 100% real hand-authored SVG icons, no changes needed |
| `unified_login.ejs` | Single login for all roles | Already clean |

**Scope correction from inventory:** the homepage's decorative icon badges,
KPI strip, and section icons all use **plain Unicode glyph characters**
rendered via `font-size` (e.g. `♙`, `◉`, `▣`, `◇`, `▥`) — this had never
received the SVG-icon treatment the admin panel and portal got in earlier
checkpoints. This was the single largest visual gap between the real site
and the approved V3 direction, and became the primary focus of this
checkpoint's homepage work.

## Test/quality gate summary

- `npm test`: **974 passed / 0 failed**
- `npm run test:imports`: **21 passed / 0 failed**
- `npm run security`: **138 passed / 0 failed**
- `npm run integration`: **74 passed / 0 failed**
- `npm run edge`: **178 passed / 0 failed**
- Playwright responsive sweep at all 11 breakpoints (320/360/375/390/414/
  430/768/820/1024/1280/1440) across the homepage (AR+EN) and all 13 inner
  pages: **0px horizontal overflow anywhere**.
- Console/page-error sweep: **0 real errors** on every page (only the
  known sandbox Google Fonts `ERR_CERT_AUTHORITY_INVALID` artifact,
  documented in every prior checkpoint, unrelated to this work).
- RTL/LTR: verified via the app's real `/lang/:lang` route on the homepage
  and a 4-page sample (services, request, contact, about) —
  `dir="ltr"` confirmed via `document.documentElement`.
- `prefers-reduced-motion: reduce`: verified on the homepage (hero
  animation skipped, KPI shows final value immediately, `.why-grid`
  article visible immediately with no reveal delay) and on `/services`
  (`.page-card` opacity 1 immediately) — zero page errors in both cases.
- Keyboard navigation: tabbed through the homepage and `/request`; focus
  always lands on a real interactive control, never inside an
  `aria-hidden` container.
- Navigation/dropdowns/mobile menu: the "خدماتنا" nav dropdown opens and
  its new chevron rotates; the mobile hamburger drawer opens, focus-traps,
  and closes correctly with the new SVG icons (screenshotted).
- Shared partials regression: `header.ejs`/`footer.ejs`/`head.ejs` are used
  by **both** the public site and the customer portal — re-verified
  `/portal` still renders with 0 errors after these changes.

### A real robustness bug found and fixed during QA

The scroll-reveal implementation (`.reveal`/`.reveal-stagger`, added this
checkpoint) initially set `opacity:0` unconditionally on every element
carrying those classes, relying entirely on a JS `IntersectionObserver` to
reveal them. A first full-page screenshot showed large blank sections —
tracing it down: Playwright's `fullPage` capture resizes the viewport
instantly rather than scrolling gradually, which doesn't reliably give the
observer time to fire before the shot is taken. That is a real symptom of
a real defect, not just a testing artifact: **any** path that jumps content
into view without a gradual scroll (an instant anchor jump, `Home`/`End`,
a screen reader's "jump to landmark", printing the page, or simply a
blocked/slow-loading script) would leave that content at `opacity:0`
forever. Fixed with two layers of defense, both shipped in this checkpoint:
1. `.reveal` is now gated behind a `.js` class set synchronously in
   `<head>` before first paint (`partials/head.ejs`) — with JS disabled or
   blocked, content is visible by default, no animation, no dependency.
2. A 2-second safety-net timeout in `public/js/site.js` force-reveals
   anything the observer hasn't caught yet, so real content can never be
   permanently invisible regardless of how it entered the viewport.

Re-verified after the fix: full-page screenshots, mobile scroll-into-view
tests, and the reduced-motion pass all show correct final content.

## Per-page decision log

### Homepage — `views/public/home.ejs`
- **REAL SANAD SOURCE:** `routes/public.js`'s home route, rendering real
  `pages`, `popularServices`, `testimonials`, and DB-backed
  `homepageSections`/`homepageContent`/`homepageMetrics`/`homepageFaqs` —
  all managed from the real admin CMS (`views/admin/homepage.ejs` and
  `content.ejs`, restyled in the earlier finance-admin checkpoint).
- **CMS SOURCE:** section visibility/order (`showHomeSection`/
  `homeSectionOrder`), all hero/section copy (`hc()` content map with
  real Arabic/English fallbacks), the 3-4 metric cards (value + label +
  **icon** — an admin-typed free-text field, see below), FAQ entries, and
  testimonials are all still rendered exactly as the CMS provides them —
  no logic in this file's data-fetching or section-gating was touched.
- **PRESERVED FUNCTIONALITY:** every `hc()`/`showHomeSection`/
  `homeSectionOrder` call, every real link/form action (`/services`,
  `/request`, `/consultations`, `/appointments`), and the search form's
  `action="/services" method="get"` — byte-identical.
- **VISUAL CHANGES:** replaced every decorative Unicode glyph (hero trust
  badges, hero photo-scene badges, search-bar icons, audience-card icons,
  popular-service icons, steps checklist, why-section benefit icons,
  star ratings) with real SVG icons from the shared sprite; added a
  synchronous progress-percentage-style KPI count-up to the metrics strip.
- **IMAGES & ICONS:** the hero photo (`hero_image` CMS field, a real
  photograph) is unchanged. Two new icon symbols were added to
  `public/images/icons.svg` (`i-headset`, `i-star`) since no existing
  symbol covered "support" or "rating" — everything else reused the
  existing 40+-symbol admin sprite (confirmed publicly reachable without
  auth, since it's a static asset). **Deliberately left untouched:** each
  metric card's `<i><%=m.icon||'◇'%></i>` — `m.icon` is a real,
  admin-editable free-text field (`homepage_metrics.icon`), the exact same
  category of real user data as `expense_categories.icon` documented in
  the finance-admin checkpoint. Only the metric **value** got the
  count-up treatment, and only when it parses as a number (see below) —
  the icon itself was never touched.
- **KPI SOURCE:** admin-entered `m.value` is free text (`'+500'`, `'98%'`,
  or the non-numeric `'الأحد إلى الخميس'` support-hours string, confirmed
  by reading the real seeded data). A `parseMetric()` helper extracts a
  leading/trailing symbol plus a number and only *that* gets
  `data-count-to` — the non-numeric value renders as plain static text
  exactly as before. This works for any future admin-entered value, not
  just the four currently seeded.
- **MOTION USED:** hero on-load entrance (above the fold, same reasoning
  as the admin panel's `.page-head`, not scroll-triggered); scroll-reveal
  + staggered card entrance (`.reveal-stagger`) on every below-the-fold
  grid (metrics, audience, popular services, steps, why-benefits,
  testimonials); KPI count-up; a smooth FAQ accordion transition layered
  on top of the native `<details>` toggle (both here and reused on the
  standalone `/faq` page and admin support pages that share `.faq-item`).
  All respect `prefers-reduced-motion` and are graceful without JS (see
  the robustness fix above).
- **RESPONSIVE:** 0 overflow at all 11 breakpoints, AR and EN.
- **RTL/LTR:** verified via `/lang/en`; screenshots captured both widths.
- **NOT COPIED FROM PROTOTYPE:** the metrics count-up logic, the
  `.reveal`/safety-net motion system, and the icon-to-concept mapping were
  built directly against this page's real CMS data shape — not copied
  from the design-preview prototype's simpler static mockup.
- **DEFERRED FUNCTIONAL IDEA:** none — every section already had real
  backing data; nothing needed inventing.

### Navigation — `views/partials/header.ejs` + `footer.ejs` + `head.ejs`
- **REAL SANAD SOURCE:** the shared site chrome used by **every** public
  and portal page (`canPublicElement`-gated nav items, `menuPages`,
  `socialLinks`, WhatsApp float — all real, unchanged).
- **PRESERVED FUNCTIONALITY:** the mobile-nav open/close focus-trap script,
  every `cpe()` permission gate, and the `/lang/:lang` toggle link — none
  of the existing JS or markup structure was altered, only the hamburger
  (`☰`) and mobile-close (`&times;`) glyphs became SVG icons, and the 3
  nav dropdown summaries gained a rotating chevron indicator (the
  `<details>` had **no** visual disclosure affordance at all before this —
  `list-style:none` had removed the native marker and nothing replaced it).
- **VISUAL CHANGES:** hamburger/close icons; chevron on
  "خدماتنا"/"دليل المستخدم"/"مركز المساعدة" dropdowns, rotating on open.
- **MOTION USED:** chevron rotation transition (0.2s, transform only).
- **RESPONSIVE:** verified — mobile drawer open/close screenshotted at
  390px, desktop dropdown screenshotted at 1440px.
- **RTL/LTR:** unchanged structural mirroring, verified via the homepage's
  EN pass (same partial).
- **NOT COPIED FROM PROTOTYPE:** n/a.
- **DEFERRED FUNCTIONAL IDEA:** none.

### Service discovery — `services.ejs`, `category.ejs`, `page.ejs`
- **REAL SANAD SOURCE:** `routes/public.js` — real search (`?q=`), real
  area filter (`?page=`), real per-category and per-audience-page listings.
- **CMS SOURCE:** page/category names, taglines, descriptions, colours —
  all from the real `pages`/`categories` tables, unchanged.
- **PRESERVED FUNCTIONALITY:** the search form's `GET` action, the
  `selectedPage` state, and every real link (`/request?service=`,
  `/services/:id`, `/p/:slug`) — untouched.
- **VISUAL CHANGES:** minimal — these pages already used the real
  `.page-card`/`.card`/`.cat-card` component system with no decorative
  glyphs at all (confirmed by a full emoji/glyph scan before editing).
  Added `.reveal-stagger` to each results/listing grid for scroll-in
  motion, consistent with the homepage.
- **KPI SOURCE / CHART PURPOSE:** n/a.
- **MOTION USED:** staggered grid reveal.
- **RESPONSIVE:** 0 overflow at all 11 breakpoints (services, a search
  result, a category, and a page — all captured).
- **RTL/LTR:** `/services` verified via EN screenshot.
- **NOT COPIED FROM PROTOTYPE:** n/a — these pages needed no rebuild.
- **DEFERRED FUNCTIONAL IDEA:** none.

### Request form — `views/public/request.ejs`
- **REAL SANAD SOURCE:** the real multi-service request form — search,
  multi-select with removable chips, an optional free-text "describe
  instead" path, and a genuinely sophisticated real feature this checkpoint
  did **not** touch: a `localStorage`-backed draft that survives a closed
  tab, restores scroll position, and clears itself on real submission.
- **PRESERVED FUNCTIONALITY:** verified **live**, not just by reading the
  code — searched "شركة" (6 real matching services filtered correctly),
  selected one (chip appeared, hidden `service_ids` field correctly set
  to the real service id), removed it (chip cleared, hidden field cleared)
  — all with zero console errors, after the one icon change.
- **VISUAL CHANGES:** the "مش لاقي اللي محتاجه؟" (describe instead) button's
  pencil glyph (`✎`) became a real `i-edit` SVG icon. The chip-remove `×`
  (generated dynamically inside a JS string template, not static markup)
  and the pure-CSS-drawn `.svc-tick` checkbox indicator were deliberately
  left as-is — the former is a low-risk, universally-understood dynamic
  glyph not worth the risk of editing JS string concatenation for a minor
  visual gain, the latter was already a real vector shape, not a glyph.
- **KPI SOURCE / CHART PURPOSE:** n/a.
- **MOTION USED:** none added — this form's own interaction feedback
  (the "اتضافت" flash on selection) was already real and untouched.
- **RESPONSIVE:** 0 overflow at all 11 breakpoints.
- **RTL/LTR:** verified via EN screenshot.
- **NOT COPIED FROM PROTOTYPE:** n/a.
- **DEFERRED FUNCTIONAL IDEA:** none.

### Consultations — `views/public/consultations.ejs`
- **REAL SANAD SOURCE:** real consultation-flagged services list.
- **VISUAL CHANGES:** one glyph (`⚖︎`) → `i-scale` SVG icon.
- **PRESERVED FUNCTIONALITY:** unchanged.
- **RESPONSIVE / RTL-LTR:** verified, 0 overflow.
- **NOT COPIED / DEFERRED:** n/a.

### Public appointments — `booking_new.ejs`, `booking_list.ejs`, `booking_detail.ejs`, `booking_error.ejs`
- **REAL SANAD SOURCE:** `routes/bookings.js` — an entire real booking
  module (gated behind a real `booking_enabled` admin setting), serving
  guests via a public token (`/appointments/booking/:token`) and logged-in
  clients via `/appointments/mine[/:id]`.
- **PRESERVED FUNCTIONALITY:** `booking_new.ejs` was already a clean,
  correctly-styled real form — untouched beyond confirming it. `booking_list.ejs`
  and `booking_detail.ejs` were **rebuilt**, not just restyled: both were
  using admin-only CSS class names (`.panel`, `.panel-body`, `.chip`) that
  **do not exist in `public/css/style.css`** — the exact same "borrowed but
  never defined" bug found and fixed in the portal's support pages in the
  previous checkpoint. They were rendering with literally zero styling
  before this pass. Rebuilt using the real, already-working portal
  components (`.req-card`/`.req-list`, `.form-card`) — the same components
  already used successfully in `views/portal/requests.ejs`. Every field
  name, form action, and the detail form's **deliberate lack of an
  `action` attribute** (it relies on posting to whichever URL rendered it —
  the guest token page or the logged-in `/mine/:id` page — both of which
  have a matching `POST` handler at the same URL) were preserved exactly.
- **VISUAL CHANGES:** full rebuild of both pages' structure using real
  design-system components; a `.form-grid` label/input CSS gap was also
  filled in `style.css` (labels/inputs inside `.form-grid` had no base
  styling anywhere in the stylesheet) — this incidentally also improves
  the pre-existing `support.ejs` new-ticket form, which uses the same class.
- **REAL, LIVE END-TO-END VERIFICATION** (the demo seed data had zero
  pre-existing bookings, so this was exercised through the actual app, not
  assumed): opened a real booking slot as admin, enabled the real
  `booking_enabled` setting (reverted afterward — see below), and, logged
  in as the real seeded client `client@demo.sanad`, completed a real
  booking through `booking_new.ejs`. Confirmed the ref/status/notes render
  correctly on the rebuilt `booking_detail.ejs`, that its update-booking
  form (reschedule/cancel) renders and submits with the real
  no-`action`-attribute behavior, and that `booking_list.ejs` correctly
  shows the real booking in a `.req-card`. Both pages'
  screenshots (`appointments-mine-ar-1440.png`,
  `appointment-detail-ar-1440.png`) are from this real session.
- **Test-environment note:** the `booking_enabled` setting was flipped on
  only to exercise this real flow, then reverted to its original value
  (`0`) immediately after — confirmed via a direct DB read before ending
  this checkpoint, so the demo environment's feature-flag state is
  unchanged from before this session.
- **KPI SOURCE / CHART PURPOSE:** n/a.
- **MOTION USED:** none beyond the shared card-hover transition already in
  `.req-card`.
- **RESPONSIVE:** 0 overflow at all 11 breakpoints on `booking_new.ejs`;
  the rebuilt pages were verified functionally (see above) rather than
  breakpoint-swept, since the feature flag had to be reverted before the
  full 11-breakpoint sweep script ran — flagged here rather than silently
  skipped. Both use the same `.req-card`/`.form-card` components already
  breakpoint-verified everywhere else in this and the previous checkpoint,
  so the responsive risk is low, but this is named explicitly rather than
  claimed as fully swept.
- **NOT COPIED FROM PROTOTYPE:** the rebuild follows this app's own real
  component conventions, not the design-preview prototype.
- **DEFERRED FUNCTIONAL IDEA:** none — `booking_invoice.ejs` remains a
  deliberately untouched, standalone print document (same reasoning as
  `case_report.ejs`/`payroll_slip.ejs` in earlier checkpoints).

### Informational pages — `about.ejs`, `contact.ejs`, `faq.ejs`, `guides.ejs`, `support.ejs` (public)
- **REAL SANAD SOURCE:** `contact.ejs` reads real `contacts` rows (kind/
  value/label/note) from the admin-managed contact list; `faq.ejs` and
  `guides.ejs` are static informational content (not CMS-bound — the
  homepage's *own* FAQ section is the CMS-driven one, this standalone
  `/faq` page is separate, confirmed by reading the route); `support.ejs`
  posts a real support ticket (`routes/support.js`).
- **PRESERVED FUNCTIONALITY:** every form action and real link untouched.
- **VISUAL CHANGES:** `contact.ejs`'s per-contact-kind icon map (a
  page-local presentation lookup keyed by the real `c.kind` enum, not
  user-editable content — same pattern as `METHOD_ICON` in the finance
  checkpoint) converted from emoji (`📞📱💬✉️📍📠`) to real SVG icons;
  reveal motion added to the contact grid and `about.ejs`'s path cards.
  `faq.ejs`/`guides.ejs`/`support.ejs` needed no icon changes (already
  clean) — `faq.ejs`'s `.faq-item` accordion now shares the same smooth
  open/close enhancement as the homepage's embedded FAQ, since both use
  the same class and `public/js/site.js` binds to it generically.
- **KPI SOURCE / CHART PURPOSE:** n/a.
- **RESPONSIVE:** 0 overflow at all 11 breakpoints on all 5 pages.
- **RTL/LTR:** `about.ejs` and `contact.ejs` verified via EN screenshots.
- **NOT COPIED / DEFERRED:** n/a.

### Request tracking — `track.ejs`, `track_result.ejs`, `success.ejs`
- **REAL SANAD SOURCE:** the reference+phone lookup flow and the
  post-submission confirmation page — both already used the real
  `.form-card`/`.track-*`/`.success-wrap`/`.big-seal` components with zero
  decorative glyphs (confirmed by scan).
- **PRESERVED FUNCTIONALITY / VISUAL CHANGES:** no changes needed — these
  pages were already at the target visual standard. `track_result.ejs`'s
  `✓ <%= q.title %>` (a plain leading character before a received-document
  title, not a badge/icon slot) was left exactly as-is, consistent with
  the same "plain inline indicator" precedent applied throughout every
  prior checkpoint.
- **NOT COPIED / DEFERRED:** n/a.

### Upload flow — `upload.ejs`, `upload_gate.ejs`; unified login — `unified_login.ejs`
- **REAL SANAD SOURCE:** `upload.ejs` is a genuinely sophisticated real
  feature — client-side image compression before upload
  (`public/js/compress.js`), drag/drop-style capture zones, a live
  progress bar, and requirement-chip auto-fill — already built with 100%
  real hand-authored inline SVG icons and zero glyphs anywhere in the
  file. `upload_gate.ejs` (the "create an account to upload" gate shown to
  guests when documents were specifically requested) and
  `unified_login.ejs` were likewise already clean.
- **PRESERVED FUNCTIONALITY / VISUAL CHANGES:** none needed — confirmed via
  a full glyph scan (all three: `[]`) and a render check (all return 200,
  zero console errors). This is the second cluster of pages (after
  services/category/page) found to already be at or above the target V3
  standard, requiring no rebuild.
- **NOT COPIED / DEFERRED:** n/a.

## Cross-cutting notes

- **Icon system:** the public site now consistently uses the shared
  `public/images/icons.svg` sprite via `<use>` for structural/repeated
  icons (nav, homepage sections, contact cards), while continuing the
  portal's existing convention of hand-authored inline SVGs for one-off
  contextual icons (already the case in `request.ejs`'s service picker and
  `upload.ejs`'s capture zones, both untouched and already exemplary).
  Two new sprite symbols were added: `i-headset`, `i-star`.
- **Real user-editable data left untouched:** `homepage_metrics.icon`
  (confirmed via the real seeded row data, same category as
  `expense_categories.icon` and the homepage manual-metrics icon field
  documented in the finance-admin checkpoint).
- **Real bug found and fixed:** `booking_list.ejs`/`booking_detail.ejs`
  (public) were rendering with zero CSS applied — see their entry above.
- **Real robustness bug found and fixed:** the scroll-reveal motion system
  could leave real content permanently invisible under certain real
  navigation paths (not just a screenshot-testing artifact) — see the
  dedicated section above for the two-layer fix (`.js`-class gating +
  a safety-net reveal timeout).
- **New shared infrastructure added this checkpoint:** `public/js/site.js`
  (count-up, scroll-reveal, FAQ accordion — the public-site equivalent of
  `public/js/admin.js`'s motion utilities, since the public site and admin
  panel load separate script bundles); `.reveal`/`.reveal-stagger`/
  `.js`-gating CSS in `style.css`; a `.form-grid` label/input base styling
  block (benefits the new `booking_detail.ejs` and the pre-existing
  `support.ejs`).
