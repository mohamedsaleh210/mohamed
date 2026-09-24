# 14 — Reporting Matrix & Localization/Country Engine

## Reporting matrix

Cross-reference: the shared mechanism (`lib/reporting.js`) is documented
in full in `09-financial-system.md`. Summary matrix of what exists across
the app (all via that same `csv()`/`print()`/`profileDoc()` trio — **tag
A** for the mechanism):

| Module | Export kinds | Format | Scope gate |
|---|---|---|---|
| Requests | list CSV/print | CSV + browser-print | `requests.export` |
| Treasury | transaction ledger CSV/print | CSV + browser-print | `treasury.export` |
| Revenue | payments / expenses / per-request summary / owed-to-staff (4 kinds) | CSV + browser-print | `revenue.export` |
| Expenses | expense list, custody overview | CSV + browser-print | `expenses.export` |
| Payroll | per-run CSV/print, plus genuine `.xlsx` import/export | CSV/print + real Excel | `payroll.export` |
| Staff directory | employee list | CSV + browser-print | `users.export` |
| Cases | case-file report (hearings+events+tasks+parties+assignees) | browser-print | `cases.report` |
| Bookings, client, errands, performance, renewals, support | list exports | CSV + browser-print | each module's own `.export`/`.reports` ability |

**Filtering is per-route, hardcoded** — there is no generic "report
definition" table letting an admin configure arbitrary saved filtered
report templates. Each export type's filters (date range, method, page/
category, scope) are written into that specific route file. A white-label
variant wanting a true report-builder would be adding a new capability,
not configuring an existing one.

**Report-profile branding vs. report-data export are two separately-
gated concerns**: `report_profiles.manage` controls who can create/set-
default a letterhead identity; each module's own `.export` ability
controls who can actually pull data out. They don't share a permission.

## Localization / Country Engine

Cross-reference: full detail in `02-public-website-blueprint.md`'s
Localization section. Summary for this document's cross-cutting purpose:

- **`lib/i18n.js`** is intentionally small — a 7-value `STATUS` label
  dictionary and a ~26-key `UI` chrome-string dictionary, both `ar`/`en`
  only. **This is not a comprehensive translation-key system.**
- **The overwhelming majority of Arabic text is NOT centrally translated**
  — it's either inline bilingual ternaries duplicated per template, or
  DB content with parallel `_ar`/`_en` columns (`pick()` helper, Arabic
  always the fallback), or genuinely Arabic-only with no English path at
  all (`about.ejs`, `faq.ejs`, `guides.ejs`, most of the admin panel).
- **Language switch** (`GET /lang/:lang`) is session-only — no cookie, no
  URL-path locale, no `Accept-Language` negotiation, no persisted
  per-client-account language preference, and any value other than
  `'en'` silently becomes `'ar'` (no third language possible without code
  changes).
- **RTL/LTR** driven by one `dir` local on `<html>`, CSS mixing logical
  properties with explicit `[dir="rtl"]` overrides for what logical
  properties don't cover (nav slide direction, floating button position,
  arrow glyphs computed inline per template).

### Country-specific business rules found (tag C — distinct from the language layer above)

| Rule | Where | Note |
|---|---|---|
| National ID: exactly 14 digits | `lib/profile.js` `validNationalId` | Egyptian format, hardcoded |
| Currency: EGP, single-currency | `settings.currency`, no FX anywhere | See `09-financial-system.md` |
| Case categories: 8 Egyptian legal practice areas | `case_categories` seed | See `08-cases-legal-operations.md` |
| Court/hearing fields (`court`, `circuit`, `judicial_year`) | `legal_cases`/`case_hearings` | Egyptian court-system shape |
| Tax/VAT fields present but non-functional (identity-only) | `report_profiles` | See `09-financial-system.md` |
| Arabic-primary/English-secondary bilingual shape | throughout | Fallback direction is hardcoded AR→EN everywhere |

### For a white-label rebuild targeting a different country or language pair

**Two genuinely separate axes, often conflated in this codebase:**

1. **Language translation** (Arabic ↔ English) — the `pick()`/`STATUS`/
   `UI` mechanism, plus every inline ternary. Adding a third language or
   flipping the primary language is a **rebuild**, not a config flag —
   touching `pick()`, `lib/i18n.js`, and ~15 templates' inline ternaries.
2. **Country/market business rules** (national ID format, currency, court
   system, tax regime) — scattered validators and seed data, not
   centralized in one "country config" module. A white-label deployment
   for a new country needs to locate and rewrite each of these
   individually (national ID regex, case categories, currency setting,
   any future tax engine) — there is no single switch.

Recommendation for the blueprint's white-label config layer
(`16-white-label-config-schema.md`): treat "language" and "country" as
two independent configuration axes from day one of any rebuild, since
this codebase's current coupling of "Arabic" with "Egypt" throughout
makes them easy to conflate.
