# Company Onboarding — El Gerwany (شركة الجرواني)

Filled per `SANAD-PLATFORM-BLUEPRINT-PORTABLE/COMPANY-ONBOARDING-TEMPLATE.md`.

**Legend** — ✅ confirmed from existing Sanad data (source noted) · 🟡 proposal, needs Mohamed's approval · ❓ required from Mohamed / the company (cannot be guessed)

---

## 1. Company Identity

| Field | Value | Status |
|---|---|---|
| Arabic company name | شركة الجرواني للمحاماة والاستشارات القانونية | ✅ `RELEASE-v16.4.0.md` |
| English company name | El Gerwany (spelling as used in Sanad's service page) | ✅ `db/migrations/044` — ❓ confirm official Latin spelling (Gerwany / Gerwani / Elgrwany) |
| Legal name (contracts/letterhead) | ❓ | ❓ |
| Short name | الجرواني / El Gerwany | 🟡 |
| Country of operation | Egypt | ✅ (services are Egyptian government procedures: رخص تشغيل، حماية مدنية، شهادة سلبية، عقد مشهر…) |
| Business type | Law firm **+** corporate licensing / permits / documentation services for companies and establishments | ✅ law firm (`RELEASE-v16.4.0.md`) · ✅ company services (`044`) |
| Phones / WhatsApp / emails / address | ❓ | ❓ |
| Branches | ❓ (single office assumed until told otherwise) | ❓ |
| Primary domain | ❓ (Sanad account username `elgrwanylaw` suggests a possible handle) | ❓ |
| Staging domain | ❓ | ❓ |

## 2. Branding

| Field | Value | Status |
|---|---|---|
| Logo (primary) | Mohamed has it — upload to `gerwani-platform/assets/incoming/logo/` (SVG preferred) | ❓ file pending |
| Logo mark / icon-only | Derive from supplied logo only if it contains a separable mark; never redraw | ❓ |
| Favicon | Generated from the supplied logo mark (32/180/192/512 + SVG) | 🟡 |
| Primary / secondary / accent colors | Anchored to the supplied logo's colors, then tuned — see `brand/creative-direction.md` (3 options) | 🟡 pending logo |
| Surface + semantic palette | Derived from primary (OKLCH), contrast-checked AA | 🟡 |
| Heading / body fonts | Per chosen direction (recommended: IBM Plex Sans Arabic + IBM Plex Sans) | 🟡 |
| Visual style direction | Recommended: **"المسار — The Path"**: precise, civic-modern, process-first | 🟡 |
| Photography style | Real, documentary photography of the team and the work (offices, filing, signing, site visits); no stock handshakes | 🟡 · photos: Mohamed has them ❓ upload |
| Illustration style | None, or minimal line diagrams of process steps | 🟡 |
| Icon style | Outline, 1.5px stroke, squared caps (distinct from Sanad's 1.75px round-cap sprite) | 🟡 |
| Card style | Low radius (4–6px), hairline borders, no soft shadows | 🟡 |
| Motion personality | Crisp and purposeful (progress/path line drawing), not decorative | 🟡 |
| Signature interaction | "License path" tracker: a service's steps drawn as a path that fills as the request advances | 🟡 |
| 3D usage | **None** — fails the value gate (no physical product/spatial data) | 🟡 |
| Video / motion graphics | None at launch; optional short documentary loop if footage is supplied | 🟡 |
| AI assistant identity | ❓ enable? (see §8) | ❓ |
| Watermark | Disabled by default | 🟡 |
| Email identity | ❓ from name/address, footer legal text | ❓ |
| PDF / print identity | ❓ letterhead logo, signature image, stamp image, signatory name/title, invoice prefix | ❓ |

## 3. Public Website

| Field | Value | Status |
|---|---|---|
| Hero headline | 🟡 draft: «ترخيص منشأتك في مسار واحد واضح — من الطلب حتى التجديد» (EN: "Your business licenses on one clear path — from application to renewal") | 🟡 |
| Tagline | ✅ existing: «التراخيص والتشغيل والموافقات في مسار واحد» / "Licensing and operational approvals in one path" | ✅ `044` |
| Primary CTA | 🟡 «ابدأ طلب خدمة» · secondary «احجز استشارة قانونية» | 🟡 |
| About (who / mission / vision) | ❓ founding year, partners, story, credentials (bar registration), mission | ❓ |
| Homepage featured services | 🟡 the 6 company-service categories (see §5) + legal consultation | 🟡 |
| Statistics | ❓ only real, verifiable numbers (years, licenses issued, clients) — omit section if none | ❓ |
| Trusted clients / partners | ❓ names/logos with permission, or omit | ❓ |
| Testimonials | 🟡 start empty, collect over time (no invented testimonials) | 🟡 |
| FAQ | 🟡 draft from real process questions (documents needed, timelines, renewals) — to be approved | 🟡 |
| Contact page | ❓ hours, map location, WhatsApp | ❓ |
| Social accounts | ❓ | ❓ |
| Footer / legal pages | 🟡 Privacy policy, terms of service, cookie note (if analytics) | 🟡 |

## 4. Module Selection

| Module | Status | Notes |
|---|---|---|
| Requests/workflow engine | ENABLED | core |
| Cases (legal operations) | 🟡 ENABLED | it is a law firm — confirm they want litigation/case tracking in this platform |
| Appointments/consultations | 🟡 ENABLED | Gerwani already used Sanad's appointment slots (`RELEASE-v16.4.1`) |
| Client portal | ENABLED | core — track requests, upload documents, see renewals |
| Company/branch multi-location | 🟡 DISABLED | enable only if more than one office ❓ |
| Treasury / Revenue / Expenses | 🟡 ENABLED | fees, government charges paid on behalf of clients |
| Custody (staff cash advances) | 🟡 ENABLED | field staff pay government fees in cash — confirm |
| Payroll | ❓ | confirm whether they want HR/payroll here |
| Performance reviews | ❓ | |
| Report profiles / branded documents | 🟡 ENABLED | letterhead, invoices, receipts |
| Agenda/calendar | 🟡 ENABLED | |
| Errands/field trips | 🟡 ENABLED | **core to licensing work** (visits to government offices) |
| Renewals tracking | ✅ ENABLED — CUSTOMIZED | Sanad added `issued_on / expires_on / renewal_on` specifically for Gerwani (`044`); make it a first-class feature (client reminders, renewal dashboard) |
| Support tickets | 🟡 DISABLED at launch | |
| Content/CMS (homepage editor) | 🟡 ENABLED | |
| Data import/export | 🟡 ENABLED | migrate Gerwani's existing Sanad tenant data ❓ (see §10) |
| AI assistant | ❓ | |
| Backup/restore | ENABLED | core |
| Content protection | DISABLED | |
| Notifications — email | 🟡 ENABLED | renewal reminders |
| Notifications — SMS/WhatsApp | ❓ | renewal reminders by SMS/WhatsApp are high-value but need a provider (cost) |

## 5. Services

- [x] 🟡 **Hybrid**: Sanad's structure (pages → categories → services) with Gerwani's own content:
  - Page 1 — **Company services** (29 services in 6 categories, ✅ from `044`), full list in `config/SERVICES-CONFIG.json`
  - Page 2 — **Legal services** ❓ (the firm's legal practice areas are not in Sanad data; proposed placeholders only)
- Per service still ❓: required documents, form fields, pricing model (🟡 proposed: quote-after-review), which services need renewal tracking (🟡 proposed in config), typical duration.

## 6. Roles

- [x] 🟡 Standard template, relabeled: admin → مدير الشركة · supervisor → مدير قسم · lawyer → محامٍ · accountant → محاسب
- [x] 🟡 One custom role: **أخصائي تراخيص / Licensing specialist** (based on "lawyer": own-file access + errands)
- ❓ Confirm titles and whether field agents (مندوبين) need their own restricted role.

## 7. Country Settings

| Field | Value | Status |
|---|---|---|
| Currency | EGP | 🟡 |
| Tax | ❓ VAT-registered? (note: no tax engine exists — new engineering if required) | ❓ |
| ID format | Egyptian national ID, 14 digits; commercial register no. and tax card no. for company clients | 🟡 |
| Invoice rules | ❓ numbering prefix; e-invoicing (ETA) requirement? (not implemented — new engineering) | ❓ |
| Phone format | +20, 11-digit mobiles | 🟡 |
| Date / calendar | Gregorian, dd/mm/yyyy, Western digits (0–9) | 🟡 |
| Primary language | Arabic | 🟡 |
| Secondary | English | 🟡 |
| Direction | RTL (Arabic) + LTR (English) | 🟡 |

## 8. AI Assistant

All ❓: enabled?, provider/model, persona, allowed data sources, roles permitted, chat retention.

## 9. Deployment Mode

- [x] 🟡 **Mode A — Independent instance** (one company, its own deployment and database). Gerwani is a single company; Mode B is unnecessary.

## 10. Anything else

- ❓ **Data migration**: Gerwani currently exists as a tenant inside Sanad (tenant DB). Should its existing clients/requests/renewals be migrated into the new platform? (needs the tenant DB export; real client data must be handled privately)
- ❓ Hosting preference and budget; domain ownership.
- ❓ Existing brand guidelines, if any, beyond the logo.
