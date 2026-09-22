# Phase 2 Final Audit — Known Issues Classification

Per the brief's required classification: **FIX NOW** / **DEFER** / **INTENTIONAL** / **LEGACY/PRINT**.

## Revisited from previous checkpoints

| Issue | Classification | Notes |
|---|---|---|
| Unmapped demo support-ticket status | **INTENTIONAL** | Pre-existing backend/demo-data characteristic, not a visual defect. Not touched this audit — re-confirmed out of scope (business/data issue, not styling). |
| Agenda non-manual status fallback | **INTENTIONAL** | `agenda.ejs`'s status `<select>` is only rendered for `source==='manual'` events; non-manual ones (request/case/trip-sourced) correctly show a read-only `.chip` instead — this is the real, intended behavior (you can't manually override a status derived from another module), not a bug. Re-confirmed this audit while fixing the same file's dialog-close icon; no change needed. |
| Shared site-header focus-order nuance | **INTENTIONAL** | Previously documented, not re-litigated; header.ejs was not touched in this audit. |
| Settings Google-tab duplicate/dead render blocks | **DEFER** | Re-inspected `settings.ejs` this audit (rendering fine, no visual defect, the "←" arrows are legitimate instructional-prose navigation breadcrumbs for Google Cloud Console, not Sanad UI — see `VISUAL-CONSISTENCY-AUDIT.md`). Any actual dead/duplicate render-block cleanup is a code-structure change to a large, already-shipped, already-tested settings page outside a pure visual audit's low-risk mandate — deferred to a dedicated code-cleanup pass, not attempted here to avoid touching integration behavior on a page this audit did not otherwise need to modify. |
| `denied.ejs` legacy glyph/visual treatment | **FIX NOW — done** | Fixed this audit: 🔒 emoji → SVG `i-lock`. See `COMPLETE-PAGE-MATRIX.md`. |
| Report/print pages intentionally excluded | **LEGACY/PRINT** | Re-confirmed: `case_report.ejs`, `report_print.ejs`, `request_print.ejs`, `access_card_print.ejs` are all print/PDF-oriented, out of the interactive-V3 scope by design. |
| User-editable icon fields intentionally preserved | **INTENTIONAL** | `expense_categories.icon`, `homepage_metrics.icon` — real per-row, admin-editable DB fields. Re-confirmed untouched this audit. |

## New issues found this audit

| Issue | Classification | Notes |
|---|---|---|
| `imports.ejs` stepper/success/row-check glyphs (✓) | **FIX NOW — done** | See `COMPLETE-PAGE-MATRIX.md`. |
| `imports.ejs` card icons sourced from `lib/data-import.js`'s hardcoded emoji `DEFINITIONS[key].icon` | **FIX NOW — done** | View-only fix (page-local icon-name map); source JS file untouched. |
| `imports.ejs` `.file-drop` responsive overflow bug (+43px to +759px at every breakpoint) | **FIX NOW — done** | Real, pre-existing bug (confirmed present before this session's edits too). See `RESPONSIVE-AUDIT.md`. |
| `admin/consultations.ejs`, `admin/destination.ejs` empty-state glyphs | **FIX NOW — done** | Converted to the standard `.empty .big` SVG pattern. |
| `admin/clients.ejs`, `expenses.ejs`, `revenue.ejs` "fully settled" ✓ table-cell glyph | **FIX NOW — done** | Same pattern, all three fixed identically. |
| `admin/agenda.ejs` dialog-close `×` with no `aria-label` | **FIX NOW — done** | See `ACCESSIBILITY-AUDIT.md`. |
| `admin/contacts.ejs` rendering `routes/admin/contacts.js`'s hardcoded `KINDS.icon` emoji directly | **FIX NOW — done** | View-only fix; route constant untouched (confirmed unused elsewhere in backend logic). |
| `errors/403.ejs`, `admin/denied.ejs`, `portal/verified.ejs` raw emoji result icons | **FIX NOW — done** | All converted to the shared SVG sprite. |
| `public/track_result.ejs` literal ✓ glyph | **FIX NOW — done** | |
| `admin/profile.ejs` ID-capture "✓" tag (static + JS-set) | **FIX NOW — done** | Both the EJS-rendered and the JS `textContent`-updated instance fixed identically. |
| `public/guides.ejs`'s decorative browser-chrome mockup missing `aria-hidden` | **FIX NOW — done** | |
| **`public/guides.ejs` has no English translation for its guide content** | **DEFER** | Real, pre-existing content gap (not introduced this session — the `guides` array has always been hardcoded Arabic with zero `lang`-conditional branching, unlike every other public page). Switching to English correctly flips header/nav/footer, but the five guide sections' headings, numbered steps (25 items total), and mock-UI labels stay Arabic. **Why deferred rather than fixed**: closing this gap means authoring genuine, approved English copy for real user-facing guidance content — a content-authoring/approval decision, not a visual-system fix, and explicitly the kind of thing this audit should surface rather than invent unilaterally. See `RTL-LTR-AUDIT.md` for detail and `screens/guides-en-1440.png` for evidence. |
| Notification/audit-log text bodies contain inline emoji as literal business-generated content (🔴✅💰📍🔐🗑📂📥⚠️🕓 across `routes/admin/*.js`, `lib/deadlines.js`) | **INTENTIONAL** | Real, dynamic, stored/generated content (not a decorative template icon) — see `VISUAL-CONSISTENCY-AUDIT.md` for the full list and reasoning. Editing it means changing notification-generation business logic, explicitly out of scope. |
| `lib/payments.js`'s `METHODS.icon` emoji rendered inside native `<option>` elements | **INTENTIONAL** | Already correctly decided and documented in a previous checkpoint (code comment in `revenue.ejs`); re-confirmed still correct, not re-litigated. |
| `errors/400.ejs` / `413.ejs` inline hardcoded styles instead of the shared stylesheet | **LEGACY (deliberate)** | Rendered with `layout:false` from raw body-parser error handlers in `server.js`, before session/CSRF/locals middleware runs — self-contained by design so they render reliably even in an early-failure path. Colors already match the real design tokens almost exactly (one, `--muted`, differs by ~2% hex value). Judged not worth touching: the risk of editing an early-failure rendering path outweighs a near-invisible color drift on a page real users essentially never see (malformed request / payload too large). |
| Code hygiene: 6 unused SVG symbols in `public/images/icons.svg` (`i-filter`, `i-logout`, `i-chevron-start`, `i-chevron-end`, `i-arrow-end`, `i-spinner`) | **FIX NOW — done** | Confirmed zero references anywhere in `views/`, `public/js/`, or `public/css/` (including no dynamic string-construction pattern that could reference them indirectly). Removed as a low-risk hygiene cleanup explicitly requested by the audit brief. |
| `!important` usage (91 instances across admin.css/style.css) | **INTENTIONAL** | Reviewed — all sampled usages are legitimate, narrowly-scoped overrides: `@media print` hiding UI chrome, and mobile-breakpoint dialog-sizing overrides. Not "unnecessary"; not touched. |

## No E-status (functional/backend) issues found

This audit did not encounter any real page whose defect required a backend/business-logic
change to fix visually — every finding above was resolvable at the presentation layer alone.
