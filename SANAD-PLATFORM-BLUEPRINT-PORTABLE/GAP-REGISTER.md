# Gap Register

Every honest limitation discovered during the reverse-engineering
extraction, carried forward explicitly rather than silently absorbed into
the reusable platform blueprint as if it were a deliberate design choice.
**A Sanad limitation is not automatically a reusable-platform
requirement** — each row below states plainly what the *current
implementation* does, whether the *blueprint* should keep that behavior
as-is, and what a *future build* should do about it.

Columns: **Preserve in blueprint?** = should this exact behavior be
documented as the reusable default. **Improve in future build?** =
should a new company's build fix this rather than copy it. **Effort** =
rough sizing (S/M/L) if a future build chooses to improve it.

## Architecture

| Gap | Current Sanad | Preserve in blueprint? | Improve in future build? | Effort | Dependency |
|---|---|---|---|---|---|
| Tenancy model | **CURRENT SANAD**: single-tenant-per-deployment — one SQLite DB file per company, cross-customer isolation is infrastructure-level, not row-level | Yes, document as Build Mode A (see `BUILD-MODES.md`) | Only if Mode B (true multi-tenant) is explicitly chosen | L | See `BUILD-MODES.md` for the full requirement list |
| Branch access boundary | **CURRENT SANAD**: `office_branch_id` is a labeling/reporting/default-assignment dimension; the actual data-visibility boundary is per-user request assignment, not branch membership | Document honestly as-is; do not claim branch isolation exists | Yes, if a company needs staff at Branch A to be structurally unable to see Branch B's records | M | Requires extending `lib/access.js`-equivalent filters to include branch scoping everywhere requests/cases/clients are queried |
| Multi-tenant Postgres schema | **CURRENT SANAD**: a Postgres reference schema exists in the source repo sketching real `tenants`/RLS architecture, but implements none of the finance/HR/cases/bookings modules | Reference only — never present as "the current architecture" | Yes, as the Mode B starting skeleton | L | Every operational module needs fresh design against this schema |

## Money / Tax

| Gap | Current Sanad | Preserve in blueprint? | Improve in future build? | Effort | Dependency |
|---|---|---|---|---|---|
| Tax/VAT engine | **CURRENT SANAD**: `report_profiles` carries `vat_rate`/`vat_registered`/`prices_include_tax` fields, but nothing in the codebase ever computes a tax amount from them — identity-labeling only | Document the fields' real (non-functional) purpose honestly | Yes, if the target country/company requires tax calculation | M–L | Depends on the country's actual tax rules — not a generic add |
| E-invoicing | **CURRENT SANAD**: no integration, hooks, or government tax-authority API reference of any kind | No | Yes, if the target country legally requires it | L | Country-specific regulatory integration |
| Multi-currency | **CURRENT SANAD**: `treasuries.currency` column exists but is never read; one global `settings.currency` value, no FX table, no conversion function anywhere | Document as single-currency; the currency *value* is company-configurable, the *capability* is not | Yes, if the company operates in multiple currencies | M | Needs an exchange-rate source and conversion logic throughout finance |
| Formal quote/approval workflow | **CURRENT SANAD**: flat `fee_items` summed into a total; no quote→approval→accepted state machine (the Postgres reference schema sketches one, unimplemented) | Document the current flat model as the real mechanism | Yes, if a formal sales-quote process is required | M | The Postgres reference schema's `quotes`/`quote_items` tables are a starting point |
| Payroll commissions | **CURRENT SANAD**: no distinct commission concept; "advances" exist only as a manual deduction line, no formal advance-request/disbursement workflow (unlike custody, which has a full lifecycle) | Document as absent | Yes, if the company needs sales-style commissions or a formal advance workflow | S–M | Could reuse the custody lifecycle pattern as a template |
| Custody return-request / close flow | **CURRENT SANAD**: `custody_return_requests` table and a `status='closed'` field exist in the schema but no route ever uses them — scaffolded, not wired | No — don't document as working | Yes, if formal custody settlement is required | S | Schema already exists; only routes/UI are missing |

## Cases / Legal Operations

| Gap | Current Sanad | Preserve in blueprint? | Improve in future build? | Effort | Dependency |
|---|---|---|---|---|---|
| Time/hourly billing on cases | **CURRENT SANAD**: none — cases carry no hours-logged or rate field; all fees stay on the parent request | Document as absent | Yes, if the target company bills by the hour | M | Would need a time-entry table + case-level billing, distinct from request fees |
| Arbitration / formal judgment-appeal entities | **CURRENT SANAD**: no arbitration concept; judgment/appeal exist only as a free-text `decision` field and a status value, no structured sub-entities | Document as absent | Only if a law-firm target needs it | M | Legal-domain-specific design work |

## Files / Documents

| Gap | Current Sanad | Preserve in blueprint? | Improve in future build? | Effort | Dependency |
|---|---|---|---|---|---|
| `documents.internal` flag enforcement | **CURRENT SANAD**: the main file gateway (`GET /files/:fileId`) and portal/tracking queries never check this staff-only flag — a client who owns a request can fetch an internal-flagged document; `support-files.js` correctly enforces the equivalent flag | No — this is a real defect, not a design choice | **Yes, always** — fix this in any rebuild rather than reproduce it | S | Straightforward query filter addition |
| Automated appointment reminders | **CURRENT SANAD**: `agenda_events.reminder_minutes` is stored but never read anywhere after insert — a dead field | Document as absent/dead | Yes, if reminders are wanted | S–M | A scheduled job similar to `lib/deadlines.js`'s pattern |

## Content / Public Site

| Gap | Current Sanad | Preserve in blueprint? | Improve in future build? | Effort | Dependency |
|---|---|---|---|---|---|
| Orphaned homepage CMS sections | **CURRENT SANAD**: `partners`/`system`/`plans` sections are seeded, admin-editable, but never rendered in the homepage template — a real discrepancy from an earlier redesign | Document as a discrepancy, not a hidden feature | Wire them up or drop them from seed, whichever the new build needs | S | Template-only fix |
| General static-page CMS | **CURRENT SANAD**: none — about/FAQ/guides are hand-coded templates with zero admin UI; only catalogue "pages" (audience-sector landing pages) are truly CMS-editable | Document the real scope of what's editable | Yes, if the company needs to self-serve edit these pages | M | A genuine page-builder feature, not present today |
| SEO infrastructure | **CURRENT SANAD**: no sitemap.xml, no robots.txt, every public page shares one generic meta description, no OG/Twitter/structured-data tags | Document as absent (greenfield) | **Yes, recommended for any public-facing rebuild** | S–M | Straightforward, should be built once into the reusable core rather than per-company |
| True multi-language (beyond ar/en) | **CURRENT SANAD**: `pick()` hardcodes Arabic as the fallback language; `STATUS`/`UI` dictionaries only support ar/en; most page content is hand-duplicated inline, not centrally keyed | Document the ar/en-specific coupling honestly | Yes, if a third language or a non-Arabic-primary market is needed | L | A real i18n rebuild — touches `pick()`, the dictionaries, and every inline bilingual ternary |

## Security

| Gap | Current Sanad | Preserve in blueprint? | Improve in future build? | Effort | Dependency |
|---|---|---|---|---|---|
| New-device alert coverage | **CURRENT SANAD**: the full-featured staff login route triggers a new-device admin alert; the public unified-login entry point (also usable by staff) does not | No — flag as an inconsistency | Yes — make both entry points call the same device-tracking function | S | — |
| CSP `unsafe-inline` | **CURRENT SANAD**: `script-src`/`style-src` both allow `'unsafe-inline'`, no nonce/hash scheme — weakens XSS mitigation meaningfully | No — flag as a known weakening | Yes, if the templating approach allows a nonce/hash-based CSP | M | Depends on how inline scripts/styles are used across templates |
| Manual CSRF deferred-check | **CURRENT SANAD**: multipart routes must explicitly call a deferred CSRF check post-multer; easy to forget on a new route (no gap found in the current codebase, but the pattern is structurally risky) | Document the mechanism and the risk | Yes, consider a middleware-enforced registry instead of a manual per-route call | S–M | — |
| Audit log retention | **CURRENT SANAD**: no purge/retention job for `audit_log` — rows accumulate indefinitely | Document as absent | Yes, if the company has a compliance/retention requirement | S | — |
| Restore-apply audit event | **CURRENT SANAD**: scheduling a restore is audited; the restore actually *applying* at next boot only logs to console, not `audit_log` | No — flag as a minor gap | Yes, add an audit event on apply | S | — |
| 2FA | **CURRENT SANAD**: none, anywhere — single-factor password auth throughout | Document as absent | Yes, if required by the company's security posture | M | — |
| Login throttling scope | **CURRENT SANAD**: IP-based, not account-based — one noisy IP (e.g. office NAT) throttles every account behind it; a distributed attacker rotating IPs isn't slowed | Document the trade-off honestly | Consider account-based or hybrid throttling if the risk profile warrants it | S–M | — |

## Reporting / AI / Misc

| Gap | Current Sanad | Preserve in blueprint? | Improve in future build? | Effort | Dependency |
|---|---|---|---|---|---|
| Report-profile editing | **CURRENT SANAD**: only create + set-default routes exist for letterhead identities — no edit route; correcting a typo means creating a new profile | Document as-is | Yes, add an edit route | S | — |
| Generic report builder | **CURRENT SANAD**: every export's filters are hardcoded per route; no saved/configurable report-template concept | Document as absent | Only if the company needs ad hoc custom reports | M–L | — |
| Server-side PDF generation | **CURRENT SANAD**: no PDF library; tabular reports rely on browser print-to-PDF (deliberate, for correct Arabic RTL shaping); the one exception is a hand-written binary-PDF builder for employee access cards | Document the deliberate rationale, don't assume a PDF library is missing by accident for RTL contexts | Only reconsider if a non-RTL or non-Arabic build wants native PDF generation | M | Evaluate PDF libraries' current RTL support before choosing to change this |
| Backup manifest checksum | **CURRENT SANAD**: integrity is verified via SQLite's own `PRAGMA integrity_check`/`foreign_key_check`, not a stored file checksum | Document as sufficient for the current use case | Optional — add a checksum field for defense-in-depth | S | — |
| Restore timing | **CURRENT SANAD**: a scheduled restore only applies on the next server process restart, not immediately | Document clearly — this is an operational detail any deployment doc must state | Optional — a hot-restore path is possible but adds real complexity/risk | M–L | — |
| AI system-prompt tiers | **CURRENT SANAD**: one hardcoded base prompt plus one office-configurable instruction layer — no separate platform-level tier | Document as-is | Only if a managed multi-tenant deployment needs a platform-wide prompt layer distinct from each office's own | S | Relevant mainly under Build Mode B |
| AI assistant visual identity | **CURRENT SANAD**: text-only, no avatar/character | Document as absent | Yes, if the company's onboarding template requests an assistant persona/avatar | S–M | New UI work, no backend dependency |
| Client notification preferences | **CURRENT SANAD**: none — no opt-in/opt-out on the `clients` table; email/in-app sends are unconditional | Document as absent | Yes, if required | S–M | — |
| SMS scope | **CURRENT SANAD**: SMS is used in exactly one place (employee access-card send) — no client-facing SMS anywhere despite the provider-neutral webhook existing | Document the real (narrow) scope honestly | Yes, extend SMS usage if the company wants it (e.g. booking confirmations) | S | The webhook mechanism already exists; only new call sites are needed |
| "Remember me" login | **CURRENT SANAD**: no such feature anywhere | Document as absent | Optional | S | — |

## How to use this register during a build

Before implementing anything this register marks as a Sanad limitation,
check the "Improve in future build?" column. A "Yes" there is a signal
that copying Sanad's exact current behavior would be reproducing a real
defect or a genuine feature gap, not following the platform's design
intent — build the improved version instead, scoped by the onboarding
template's actual requirements for the new company. A "No"/document-as-is
row means the current behavior is a legitimate, deliberate trade-off
(e.g. the browser-print-to-PDF choice for RTL correctness) that a future
build should understand before deciding to change it, not blindly follow
or blindly "fix."
