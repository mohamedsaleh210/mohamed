# Phase 2 Final Audit — RTL / LTR

## Method

Used the real language mechanism (`/lang/en`, `/lang/ar` routes, which set the session's
`lang`/`dir` and are read by every view via `dir="<%= dir %>"` on `<html>`) — never a manual
`dir` override. All admin/portal/public modules were spot-checked against a representative page
each.

## Admin panel

Admin (`office-panel`) is Arabic-only by design (confirmed: `admin/login.ejs` hardcodes
`lang="ar" dir="rtl"` on `<html>`, and no `/lang` toggle exists inside the admin shell). This is
existing, correct, intentional behavior — not a gap. All admin-side fixes in this audit
(`imports.ejs`, `contacts.ejs`, `agenda.ejs`, `denied.ejs`, `destination.ejs`,
`consultations.ejs`, `profile.ejs`, `clients.ejs`, `expenses.ejs`, `revenue.ejs`) were verified
rendering correctly in RTL — icons sit on the correct (trailing) side of their label text,
`.import-steps`/`.dialog-close`/`.contact-icon` all use logical CSS properties already
established by the design system (no hardcoded `left`/`right`).

## Portal & public site

Both support full AR/EN via the real `/lang` route. Re-verified this audit:

- `portal/verified.ejs` (this audit's fix): the result icon (now SVG `i-check-circle` /
  `i-alert-triangle`) is direction-agnostic — no mirroring concerns, renders identically both ways
- `public/track_result.ejs` (this audit's fix): the inline check icon before the tracked item
  title reads correctly in both directions (`.track-done` is a simple flow line, no positioning
  assumptions)
- `public/guides.ejs`: switching to English correctly flips the header, nav, footer, and page
  chrome to LTR (confirmed: nav labels, breadcrumb arrows, WhatsApp button, footer columns all
  translate). **However, this audit found the guide body content itself has never been
  localized** — the five role sections' headings, numbered steps, and the "live-shot" mockup's
  numbers stay in Arabic regardless of language. This is a real, pre-existing content gap (not
  introduced this session — the `guides` array in the template has always been literal Arabic
  strings with no `lang === 'ar' ? … : …` branching, unlike every other public page). See
  `DEFERRED-ISSUES.md` — deferred because fixing it means authoring and approving real English
  copy for 25 guide steps plus 5 mock-UI labels, which is a content decision, not a visual fix.
  Screenshot: `screens/guides-en-1440.png`.

## Directional details re-checked

- Breadcrumb chevrons (`dir === 'rtl' ? '‹' : '›'` pattern) — unaffected by this audit's changes, still correct both ways
- The new SVG icons added this audit (`i-lock`, `i-message`, `i-check-circle`, `i-alert-triangle`, `i-check`, `i-x`) are all symmetric/non-directional glyphs — no mirroring needed, none applied, correct
- Sidebar edge, mobile drawer direction, dialog positioning (`agenda.ejs`'s `<dialog>`): unaffected by this audit's icon-only change to the close button; `<dialog>` centers via the browser's native top-layer, direction-agnostic

## Result

No new RTL/LTR defect introduced. One pre-existing, real content-localization gap found and
documented (public guides page has no English guide content) — deferred to a content decision,
not silently missed.
