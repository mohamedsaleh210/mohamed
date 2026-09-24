# 16 — White-Label Brand & Content Configuration Layer

This is the actionable output of the whole extraction: the schema a
future company's information should be poured into, built from what's
already mechanically supported in the codebase (existing settings tables,
`report_profiles`, `entitlements`) plus what would need to be added
(a proper brand-token file, a content-config layer beyond the current
homepage-only CMS).

## Design principle

No Sanad brand value should ever be a mandatory default in the reusable
core. Every field below is either (a) already a real, working
configuration point in the current codebase, or (b) explicitly marked
**[NEW]** — something that doesn't exist yet and would need to be built.

## Brand configuration

```yaml
brand:
  company_name: string          # [existing: settings.site_name_ar/en]
  legal_name: string            # [existing: report_profiles.legal_name / company_name_ar]
  short_name: string            # [NEW — no distinct "short name" field exists today]
  logo_primary: image_url       # [NEW — no logo asset exists today, only report_profiles.logo_file for print letterheads]
  logo_mark: image_url          # [NEW — no equivalent to a standalone icon-mark logo]
  favicon: image_url            # [NEW — none exists today, a real gap even for Sanad itself]

  primary_color: hex            # [existing pattern: report_profiles.primary_color, already hex+regex-validated]
  secondary_color: hex          # [NEW — report_profiles only has primary/accent, not a 3-tier scale]
  accent_color: hex             # [existing: report_profiles.accent_color]
  surface_palette:              # [NEW — would need a proper token file; current CSS hardcodes bg/card/line per stylesheet]
    background: hex
    card: hex
    line: hex
    muted_text: hex
    success: hex
    warning: hex
    danger: hex
    info: hex

  typography_heading: font_family   # [NEW — currently one hardcoded font (Tajawal) for everything]
  typography_body: font_family      # [NEW — same]
  icon_style: enum[outline|filled|duotone]  # [NEW — currently one fixed 1.75px-outline style]
  image_style: enum[photography|illustration|3d]  # [NEW — currently one photograph, no defined style guide]
  illustration_style: string    # [NEW]
  border_radius_style: enum[sharp|soft|rounded]  # [existing pattern: --radius token, but not exposed as a company choice today]
  shadow_style: enum[flat|soft|elevated]         # [NEW — token exists, not exposed as a choice]
  motion_personality: enum[calm|energetic|minimal]  # [NEW — Sanad's own "calm/understated" is a specific unexposed choice, see SANAD-BRAND-REFERENCE.md]

  hero_style: enum[photo|illustration|product-mockup|video]  # [NEW]
  dashboard_style: enum[dense|spacious]  # [NEW — current admin panel has one fixed density]
  voice_tone: enum[formal|friendly|technical]  # [NEW — no tone config exists; copy is hand-written per view]
  avatar_assistant_character: string  # [NEW — the AI assistant has no visual character/avatar today, text-only]

  watermark:                    # [existing, fully working: content_protection_watermark_* settings]
    enabled: bool
    text: string
    opacity: int  # 1-40

  email_branding:                # [existing: mail_from_name/mail_from_email settings + emails.js templates]
    from_name: string
    from_email: string
    footer_html: string          # [NEW — current templates hardcode footer content]

  pdf_branding:                  # [existing, fully working: report_profiles table]
    logo_file: image
    signature_file: image
    stamp_file: image
    header_text: string
    footer_text: string
    signatory_name: string
    signatory_title: string
    invoice_prefix: string
```

## Content configuration layer

The current homepage CMS (`homepage_content`, `homepage_sections`,
`homepage_metrics`, `testimonials`, `homepage_faqs`) is a real, working,
admin-editable system — **reuse it as-is for a new company's homepage
copy** (tag A mechanism). What it does **not** cover, and what a
white-label rebuild needs to add or rewrite per company:

```yaml
content:
  homepage:                      # [existing mechanism — repoint at new company's copy]
    hero: {eyebrow, title, description, primary_cta, secondary_cta, image}
    metrics: [{icon, label, value}]        # existing homepage_metrics rows
    audiences_intro: {title, description}   # cards themselves are catalogue-driven (D)
    popular_intro: {title, description}     # cards are services.home_pinned (D)
    testimonials: [{customer_name, quote, rating}]   # existing table, needs approval workflow reused
    faq: [{question, answer}]              # existing homepage_faqs table

  homepage_hardcoded_sections:    # [NEW — these are currently baked into home.ejs, not DB-editable]
    search_copy: {label, placeholder, hint}
    steps: {heading, description, steps: [{title, description}]}
    why: {heading, description, benefits: [{icon, title, description}], closing_quote}
    trust_badges: [{icon, caption}]

  static_pages:                  # [NEW — no admin-editable static-page system exists today]
    about: {vision, mission, sections: [...]}
    faq_standalone: [{question, answer}]   # distinct from homepage_faqs
    guides: [{role, title, steps: [...]}]

  catalogue:                     # [existing mechanism: pages -> categories -> services, db/catalogue.js as seed]
    pages: [{slug, name_ar, name_en, tagline, intro, colour, icon}]
    categories: [{page_slug, name_ar, name_en, desc_ar, desc_en}]
    services: [{category, title_ar, title_en, body_ar, body_en, is_consultation}]

  legal:                         # [existing settings]
    contact_info: {office_hours, address, map_url, emails}
    social_links: [{platform, url, label}]   # existing social_links table
```

## Enabled-modules configuration — already fully working

Reuse `lib/entitlements.js` as-is (**tag A**, no changes needed):

```yaml
enabled_modules:                 # maps to platform_entitlements setting -> modules[]
  - requests
  - cases            # omit for a non-legal white-label company
  - agenda
  - clients
  - employees
  - payroll
  - treasury / revenue / expenses
  - consultations / bookings   # omit if appointments aren't relevant
  - support
  - content
  - reports
  - ai

enabled_public_pages:            # maps to platform_entitlements setting -> publicElements[]
  - home / services / consultations / appointments / tracking
  - client_portal / support / contact / guides
```

A module disabled here 403s in the admin panel and 404s on the public
site — already built, already tested (per the engagement's own regression
suite), reusable verbatim.

## Country/locale configuration — needs new engineering, not just config

Per `14-reporting-localization.md`, this is genuinely two separate axes
that the current codebase conflates:

```yaml
locale:
  primary_language: enum        # [rebuild required — pick() hardcodes ar as fallback]
  secondary_languages: [enum]   # [rebuild required — only ar/en exist today]
  default_direction: rtl|ltr    # [existing mechanism, driven by primary_language]

country:
  identity_field_format: regex  # [rebuild required — national_id validator is hardcoded 14-digit Egyptian]
  currency: string              # [existing: settings.currency — single-currency only, no FX]
  tax_engine: enum[none|vat|sales_tax]  # [NEW — no functioning tax calculation exists today at all]
  legal_practice_areas: [string]  # [existing mechanism: case_categories table — replace seed data]
  court_system_fields: [string]   # [existing columns on legal_cases/case_hearings — relabel per jurisdiction]
```

## Pricing/packages — partially existing

The license/subscription **mechanism** already exists
(`lib/tenant-policy.js`) and is reusable as-is for a managed multi-tenant
rollout: numeric caps (`max_users`, `max_requests`, `max_branches`,
`storage_mb`) + status (trial/active/suspended) read from a license file
per deployment. **What's missing**: any UI for defining/selling named
package tiers (e.g. "Starter/Pro/Enterprise") — today a package is just
whatever numbers happen to be in that deployment's license file, set
externally by the central platform, not through any in-app screen.

## Domain/contact information — already fully working

`settings.site_domain`, `office_emails`, `whatsapp`, `office_hours_*`,
`office_address_*`, `office_map_url`, `contacts` table (phone/mobile/
whatsapp/email/address/fax, grouped by kind) — reuse the entire mechanism
as-is; only the values change per company.

## What a fresh white-label deployment actually needs, end to end

1. **Reusable as-is (tag A)**: permission engine, request/workflow engine,
   backup/restore/export system, entitlements module toggles, settings
   write-only-secret convention, AI permission-intersection mechanism,
   the table→card/searchable-select/tab UX components, the license/quota
   mechanism.
2. **Reconfigure via existing settings (tag D)**: currency value, contact
   info, homepage copy (within its current sections), catalogue seed,
   which modules/public pages are entitled, backup schedule, AI provider/
   prompt/model.
3. **Swap assets, no new engineering (tag E, once the brand-token system
   below exists)**: logo, colors, fonts, icon style, hero imagery,
   watermark text.
4. **Rewrite by hand (no CMS today)**: `/about`, `/faq`, `/guides`, and
   the hardcoded homepage "steps"/"why"/search-copy sections.
5. **New engineering required, not configuration**: a real brand-token
   system (colors/fonts/radius/shadow/motion as company-level config
   rather than hardcoded per-stylesheet values), a static-page CMS
   beyond the homepage, multi-language support beyond ar/en, a real tax/
   VAT/invoicing engine, sitemap/robots.txt/SEO metadata infrastructure,
   per-branch data isolation if that's a hard requirement (today branch
   is a labeling dimension, not an access boundary), and — if true
   shared-database multi-tenancy is wanted instead of one-deployment-
   per-company — the Postgres reference schema in `13-database-erd.md`
   as the starting skeleton, with every operational module (finance/HR/
   cases/bookings/support) designed fresh against it.
