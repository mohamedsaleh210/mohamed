# Company Onboarding Template

Fill this in completely for each new company before starting a build. Do
not let a coding session guess any answer here — an unanswered question
should stay blank and be asked, never assumed from Sanad's own defaults.
Copy this file per company (e.g. `ONBOARDING-<company-slug>.md`).

---

## 1. Company Identity

- Arabic company name: `____`
- English company name: `____`
- Legal name (for contracts/letterhead): `____`
- Short name / abbreviation: `____`
- Country/countries of operation: `____`
- Business type (law firm / accounting firm / consulting / other
  professional services / non-professional-services — say which): `____`
- Contact information: phone(s), WhatsApp, email(s), physical address(es): `____`
- Branch locations (name, code, address, phone per branch): `____`
- Primary domain: `____`
- Staging/preview domain (if different): `____`

## 2. Branding

- Logo (file, primary): `____`
- Logo mark / icon-only version: `____`
- Favicon: `____`
- Primary color (hex): `____`
- Secondary color (hex): `____`
- Accent color (hex): `____`
- Supporting/surface palette (background, card, line, muted text, and
  semantic success/warning/danger/info colors, if not derived
  automatically from primary/secondary/accent): `____`
- Typography — heading font: `____`
- Typography — body font: `____`
- Visual style overall direction (e.g. minimal/corporate, warm/editorial,
  bold/energetic, technical/data-dense): `____`
- Photography style (real photography / stock / none — and subject
  matter direction): `____`
- Illustration style (if any — flat, isometric, line-art, none): `____`
- Icon style (outline / filled / duotone, stroke weight if outline): `____`
- Card style (radius: sharp/soft/rounded; shadow: flat/soft/elevated): `____`
- Motion personality (calm/understated, energetic, minimal/none,
  playful): `____`
- Animation style specifics (any signature interaction the company
  wants): `____`
- 3D usage (none / hero only / product visualization / other): `____`
- Video/motion graphics (none / hero video / explainer / other): `____`
- AI assistant identity (name, personality, avatar/character if any, or
  "text-only, no persona"): `____`
- Watermark (enabled by default? text? — see content-protection module,
  optional): `____`
- Email identity (from name, from address, footer content/legal text): `____`
- PDF/print identity (letterhead logo, signature image, stamp image,
  signatory name/title, invoice number prefix): `____`

## 3. Public Website

- Hero message (headline): `____`
- Slogan/tagline: `____`
- Primary CTA(s): `____`
- About section content (who the company is, mission/vision): `____`
- Services to feature on the homepage: `____`
- Statistics to display (if any — e.g. years in business, clients
  served): `____`
- Trusted clients/partners to display (names/logos, if any): `____`
- Testimonials (initial set, or "start empty and collect over time"): `____`
- FAQ content (initial question/answer set): `____`
- Contact page content (hours, map, additional notes): `____`
- Social accounts to link: `____`
- Footer content (legal links, additional nav, copyright text): `____`
- Legal pages needed (terms of service, privacy policy, other regulatory
  pages this jurisdiction requires): `____`

## 4. Module Selection

For every module, mark **ENABLED**, **DISABLED**, or **CUSTOMIZED**
(and describe the customization if so):

| Module | Status | Customization notes |
|---|---|---|
| Requests/workflow engine | | (this is core — cannot be disabled) |
| Cases (legal operations) | | only relevant if the company is a law firm |
| Appointments/consultations | | |
| Client portal | | (core) |
| Company/branch multi-location | | |
| Treasury | | |
| Revenue | | |
| Expenses | | |
| Custody (staff cash advances) | | |
| Payroll | | |
| Performance reviews | | |
| Report profiles / branded documents | | |
| Agenda/calendar | | |
| Errands/field trips | | |
| Renewals tracking | | |
| Support tickets | | |
| Content/CMS (homepage editor) | | |
| Data import/export | | |
| AI assistant | | |
| Backup/restore | | |
| Content protection (watermark/deterrence) | | |
| Notifications (email/SMS) | | |

## 5. Services

Choose one:

- [ ] Same service architecture as Sanad (pages → categories → services),
      reusing Sanad's structural pattern with entirely new content
- [ ] Selected Sanad-derived service families (list which): `____`
- [ ] Completely custom service architecture (describe): `____`
- [ ] Hybrid (describe): `____`

Per service (repeat as needed): name (ar/en), category, required
documents, custom form fields, is-it-a-consultation, pricing model (fixed
/ quote-after-review), renewal/expiry tracking needed?, country
applicability.

## 6. Roles

Choose one:

- [ ] Standard role template (admin, supervisor, lawyer/staff,
      accountant) with Sanad's default permission shape, relabeled
- [ ] Custom role names (list, with a one-line description of each): `____`
- [ ] Custom permissions per role (describe deviations from the standard
      catalogue): `____`

## 7. Country Settings

- Currency: `____`
- Tax model (none / VAT / sales tax — and rate if known; **note: no
  functioning tax-calculation engine exists in the current codebase —
  this is new engineering, not configuration, see `GAP-REGISTER.md`**): `____`
- Identity/ID terminology and format (e.g. national ID digit count/
  format): `____`
- Invoice rules (numbering convention, required fields, e-invoicing
  requirement — **e-invoicing is not implemented today, new
  engineering**): `____`
- Phone number format: `____`
- Date/time format and calendar (Gregorian/Hijri/other): `____`
- Primary language: `____`
- Secondary language(s), if any (**note: true multi-language beyond
  ar/en requires rebuilding the i18n layer, see `GAP-REGISTER.md`**): `____`
- Text direction: RTL / LTR: `____`

## 8. AI Assistant

- Enabled?: `____`
- Provider (OpenAI / Anthropic / other — other requires new integration
  work): `____`
- Model: `____`
- Assistant identity/persona (name, tone): `____`
- Allowed data sources (which modules the assistant may read from): `____`
- Report generation needed beyond chat?: `____`
- Roles permitted to use the assistant: `____`
- Retention period for chat history: `____`

## 9. Deployment Mode

- [ ] Mode A — Independent instance (one company, one deployment/
      database — see `BUILD-MODES.md`)
- [ ] Mode B — True multi-tenant SaaS (multiple companies sharing one
      platform — **requires the architectural changes documented in
      `BUILD-MODES.md`; do not assume this is a simple config flag**)

## 10. Anything else

Open notes, special requirements, integrations not covered above: `____`
