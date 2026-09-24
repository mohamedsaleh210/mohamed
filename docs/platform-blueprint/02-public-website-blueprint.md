# 02 — Public Website Blueprint

Source: direct reading of `routes/public.js`, `routes/track.js`, `routes/files.js`,
`routes/unified_login.js`, `routes/upload.js`, `routes/bookings.js`, every
view under `views/public/*.ejs`, `routes/admin/{content,homepage,social}.js`,
`db/catalogue.js`, the relevant migrations, `lib/content-protection.js`,
`lib/i18n.js`, and `middleware/locals.js`. DNA tags per the legend in
`00-README-and-methodology.md`.

## Route inventory

Mount order in `server.js` (all after CSRF/locals/license/entitlements
middleware): `ADMIN_PATH` → admin panel, then `/support-files`, `/portal`,
`/appointments` (bookings), `/support`, `/` (unified login), `/upload`,
`/track`, `/` (files), `/` (public).

| Route | View | Purpose | Tag |
|---|---|---|---|
| `GET /` | `public/home.ejs` | Homepage — hybrid static/CMS (see below) | A (structure) / F (copy) |
| `GET /p/:slug` | `public/page.ejs` | Audience-sector landing page (a "page" entity) | D |
| `GET /services` | `public/services.ejs` | Page list, or search (`?q=`) across services | A |
| `GET /services/:id` | `public/category.ejs` | Category detail + sibling categories | A |
| `GET /consultations` | `public/consultations.ejs` | Services flagged `is_consultation=1` | B |
| `GET/POST /request` | `public/request.ejs` | Multi-service request submission form | A |
| `GET /request/success/:ref` | `public/success.ejs` | Confirmation + upload link + account upsell | A |
| `GET /contact` | `public/contact.ejs` | Contacts (DB `contacts` table) + office hours/map | D |
| `GET /about` | `public/about.ejs` | 100% hardcoded Arabic-only vision/mission | F (fully rewrite per company) |
| `GET /faq` | `public/faq.ejs` | 100% hardcoded Arabic-only Q&A array | F |
| `GET /guides` | `public/guides.ejs` | 100% hardcoded role-based how-to guides | F |
| `GET /lang/:lang` | — (redirect) | Entire language-switch mechanism | A |
| `GET /track`, `POST /track` | `public/track.ejs` | Guest ref+phone request tracking | A |
| `GET /track/:id` | `public/track_result.ejs` | Status/requirements/documents for a tracked request | A |
| `GET/POST /upload/:id` | `public/upload.ejs` / `public/upload_gate.ejs` | Document upload, token or session gated | A |
| `GET /files/:fileId` | — | The only path serving uploaded file bytes | A/H |
| `GET/POST /login` | `public/unified_login.ejs` | Single login form for both staff and clients | A/H |
| `GET/POST /appointments/*` | `public/booking_*.ejs` | Appointment/consultation booking (gated by `lib/bookings.enabled()`) | B |

Generic error pages (`400/403/404/413/500/csrf/subscription`) live in
`views/errors/` and are shared across public/admin/portal — **A**.

## Homepage: what's actually editable

The homepage is a **hybrid**, not a fully CMS-driven page. `homepage_sections`
(13 seeded sections, each with `visible`/`sort`) controls section order and
show/hide for: hero, search, metrics, audiences, popular, steps, why,
testimonials, faq, cta (plus `consultations`, which isn't a seeded row but
defaults to visible). **Section-level visibility/order = D (company-configurable)
via existing admin UI.**

| Section | Text content | Card/data content |
|---|---|---|
| hero | `homepage_content` keys, editable (F) | — |
| search | 100% hardcoded (E/F — needs template edit) | page `<select>` options, DB-driven (A) |
| metrics | — | fully `homepage_metrics` rows (D/F) |
| audiences | `homepage_content` title/desc (F) | first 3 `pages` rows — catalogue-driven (D) |
| popular | `homepage_content` title/desc (F) | `services.home_pinned` ranking (D) |
| steps | 100% hardcoded incl. fake progress mockup (F — template edit required) | — |
| why | 100% hardcoded incl. fake dashboard mockup (F — template edit required) | — |
| testimonials | fully DB-driven, admin-approved (D/F) | — |
| faq | fully DB-driven, admin-approved (D/F) | — |
| cta | 100% hardcoded except WhatsApp link (`settings.whatsapp`) | — |

**Discrepancy recorded:** three seeded homepage sections — `partners`,
`system`, `plans` — and their `homepage_content` rows exist in the database
and are editable in the admin homepage editor, but **`views/public/home.ejs`
never renders any of them** (verified: zero template matches). This is
orphaned configuration from an earlier design pass, not a hidden feature —
a white-label rebuild should either wire these sections up or drop them
from the seed, not assume they work today.

Admin surface: `routes/admin/homepage.js` (bulk content save, popular-service
pinning, section visibility/sort, testimonial/FAQ moderation), gated
`can('content.manage')`. **A** (the editor mechanism) / **D** (what gets typed
into it).

## Service catalogue → public surfacing

Structure: `pages` (audience sector, e.g. Visas/Companies) → `categories`
→ `services`, plus a `request_services` join table so one request can carry
several services. Full engine detail is in
`03-services-and-request-engine.md`; here: how it reaches the public site.

- `db/catalogue.js` is **seed data only** — a fresh-install fixture consumed
  once by `db/seed.js`. Editing it has zero effect on an existing database.
  This is the right place to swap in a new company's starter catalogue. **D**.
- `pages.colour`, `icon`, `tagline_*`, `intro_*` drive the audience-sector
  landing pages' visual identity per sector — **D**, though the hex-colour
  field is a raw CSS colour, not a design-token reference, so a white-label
  rebuild may want to constrain it to the brand's approved palette rather
  than leaving it fully freeform.
- `scope_services_by_page` (setting, default on) limits the public
  request-form service picker to the page the visitor arrived through —
  **A** (mechanism) / **D** (on/off).
- **Tenant-specific seed found and flagged:** migration
  `044_gerwani_services_and_renewals.js` seeds a dedicated
  "gerwani-company-services" page and ~30 named services for one specific
  client engagement, and `middleware/locals.js` explicitly excludes that
  page's slug from the public nav menu. **This is Sanad-client-specific
  data (tag F/company-instance-specific), not platform seed, and must not
  be copied into a white-label starting catalogue.**

## Content protection

Covered in depth in `05-roles-permissions-security.md`'s security section;
summary here for the public-site angle. `lib/content-protection.js` config
(`content_protection_*` settings) drives: select/drag/right-click deterrence
(CSS + JS, both with form-field/contenteditable/`mailto:`/`tel:`/`.cp-allow-copy`
exemptions) and a server-generated inline-SVG watermark. **A** (mechanism) /
**D** (on/off, text, opacity) / **E** (default watermark text "Sanad | سند").

Scoped explicitly **out** of `/portal` (`!req.path.startsWith('/portal')`)
and never touches the admin panel (different head partial). Only 7 public
templates opt in (home, services, category, about, guides, faq, page) —
form-bearing pages (contact, request, upload, track, booking\*) are
deliberately excluded so users can still select/copy in form fields.

**Only one watermark application exists**: the homepage hero photo. This is
a single hardcoded hookup on one image, not a general "watermark every
image" system — a white-label rebuild wanting broader watermarking would
need to extend the mechanism, not just reconfigure it.

The code is explicit, in comments and in the admin UI copy, that this is
**deterrence, not prevention** — screenshots are always technically
possible and the feature must never be described otherwise.

## Localization

`lib/i18n.js` is small and **not** a comprehensive translation layer:

- `STATUS` — 7 request-lifecycle status labels + colours (ar/en).
- `UI` — ~26 reused chrome strings (ar/en), exposed globally as `t.xxx`.

Everything else is either (a) inline bilingual ternaries duplicated per
template (`lang==='ar' ? '...' : '...'`), (b) DB content with parallel
`_ar`/`_en` columns picked via `pick(row, field)` (Arabic is always the
fallback), or (c) genuinely **Arabic-only with no English path at all**
(`about.ejs`, `faq.ejs`, `guides.ejs`, the home.ejs "steps"/"why" sections,
and most of the admin panel).

Language switch: `GET /lang/:lang` sets `session.lang` (any value other
than `'en'` silently becomes `'ar'` — no validation error, no third
language possible) and redirects back to `Referer`. Session-only — no
cookie, no URL-path locale, no `Accept-Language` negotiation, no persisted
per-client language preference.

`res.locals.dir` (`rtl`/`ltr`) drives `<html dir=...>`; CSS mixes logical
properties with explicit `[dir="rtl"]` overrides where logical properties
don't cover it (nav slide direction, floating WhatsApp button position,
arrow glyph direction computed inline per-template).

**For a white-label rebuild:** the whole i18n approach assumes
Arabic-primary/English-secondary specifically — fallback direction is
hardcoded AR→EN in `pick()`, and there is no central translation-key table
that a third language could just add a column to. Adding a language, or
flipping the primary language, means touching `pick()`, `lib/i18n.js`, and
every inline ternary across ~15 templates. **Tag C** (this specific
bilingual shape is a country/market choice, not core platform DNA) — a
reusable blueprint should note that true multi-language support is a
**rebuild**, not a config flag, in the current implementation.

## Static content system — what's real

There is **no general admin-editable "static page" / CMS-page-builder
system**. The only admin-editable public content is: catalogue "pages"
(audience-sector landing pages, full CRUD via `routes/admin/content.js`)
and homepage copy/sections (above). `/about`, `/faq`, `/guides` are
developer-edited templates only, with no DB table and no admin UI — for a
new company, these three pages must be **rewritten in code**, not
configured. **Tag F** for the current Sanad content; **tag A gap** for the
absence of a general page-builder (worth building if future companies need
to self-serve more static content).

**Discrepancy noted:** `guides.ejs`'s anchor ids (`client`, `office`,
`staff`, `accountant`, `admin`) don't match the header nav dropdown's link
targets (`#companies`, `#employees`, `#admin`, `#clients`) — a latent,
harmless but real mismatch from template drift.

## SEO — honest gap assessment

**No `sitemap.xml`, no `robots.txt` exist anywhere in the codebase.**
Every public page currently ships the *same* generic meta description (no
view sets a `pageDescription` local, so `head.ejs`'s single fallback string
is used everywhere). No Open Graph tags, no Twitter Card tags, no canonical
URL, no JSON-LD structured data. `noindex,nofollow` is correctly applied to
admin/auth views only — public marketing pages have no explicit positive
indexing signal either.

This is essentially **greenfield** for a white-label build: sitemap
generation, `robots.txt`, per-route `pageTitle`/`pageDescription` locals,
and OG/Twitter/structured-data tags would all need to be added from
scratch. **Tag A gap** — recommend building this once into the reusable
core (parameterized by domain/company name), not per-company.

## Security headers (cross-reference)

`server.js` sets CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options:
nosniff`, `Referrer-Policy`, `Permissions-Policy` globally — full detail in
`05-roles-permissions-security.md`. **Tag A/H.**
