# Implementation Phases for a New Company Build

Each phase names its inputs (what must already exist), its outputs, and
which blueprint documents govern it. Do not start a phase whose inputs
aren't ready — most rework in a build like this comes from skipping
ahead of an unanswered question.

## Phase 0 — Intake and Requirements

**Input**: nothing. **Output**: a fully completed
`COMPANY-ONBOARDING-TEMPLATE.md`, `BUILD-MODES.md` mode decision.
**Governs**: all sections of the onboarding template. Do not proceed to
Phase 1 with any onboarding question left blank and unasked.

## Phase 1 — Architecture / Configuration

**Input**: Phase 0 output. **Output**: populated
`MODULE-CONFIG.example.json` (renamed, filled), `ROLES-PERMISSIONS-
CONFIG.example.json` (renamed, filled), deployment-mode decision recorded.
**Governs**: `MASTER-BLUEPRINT.md` §1-2, `BUILD-MODES.md`. Decide the
tech stack fit (the blueprint describes behavior, not a mandated stack —
match it to what the new build will actually use) and confirm every
module dependency (e.g. bookings needing requests+agenda) is understood
before module-by-module work starts.

## Phase 2 — Brand / Design System

**Input**: Phase 0's branding answers. **Output**: populated
`BRAND-CONFIG.example.json` and `MOTION-DESIGN-CONFIG.example.json`
(renamed, filled), an actual design-token file/stylesheet foundation
implementing them. **Governs**: `MASTER-BLUEPRINT.md` §19-21,
`blueprint/15`, `SANAD-BRAND-REFERENCE.md` (read only to know what to
avoid). Do not begin Phase 3 with placeholder colors/fonts still in
place.

## Phase 3 — Public Website

**Input**: Phase 2 design system, populated `CONTENT-CONFIG.example.json`
and `SERVICES-CONFIG.example.json`. **Output**: homepage, catalogue
browse, request/booking entry, tracking, static pages (about/faq/guides —
hand-written per company, no CMS exists for these), contact page.
**Governs**: `blueprint/02`, `03`. Remember: no SEO infrastructure exists
in the source blueprint — build sitemap/robots.txt/meta tags fresh in
this phase if the new company needs them (see `GAP-REGISTER.md`).

## Phase 4 — Authentication / Roles

**Input**: Phase 1's role configuration. **Output**: staff login, client
portal login/registration, password policy, session handling, the
permission-resolution engine, and (if a top administrative tier is
wanted) the anti-lockout guarantees. **Governs**: `blueprint/05`, `06`,
`07`. This phase's security mechanisms are Core Platform DNA — implement
them fully even for a company with simple role needs; do not thin them
out.

## Phase 5 — Operational Modules

**Input**: Phase 4 auth, Phase 1 module selection. **Output**: the
request/workflow engine, and any of cases/appointments/support tickets/
agenda/errands/renewals that were selected ENABLED. **Governs**:
`blueprint/03`, `07`, `08`, `12`. Build the request engine first even if
other operational modules are disabled — several of them (bookings,
cases) depend on it structurally.

## Phase 6 — Finance / HR

**Input**: Phase 5 request engine. **Output**: treasury/revenue/
expenses/custody/payroll (whichever were selected), employee profile and
onboarding/offboarding flows. **Governs**: `blueprint/06`, `09`. Confirm
early whether the new company needs real tax/VAT calculation — this is
new engineering (`GAP-REGISTER.md`), not a configuration toggle, and
belongs in this phase's scope if required.

## Phase 7 — Client Portal

**Input**: Phase 4 auth, Phase 5 requests. **Output**: client
registration/verification, the curated client-facing request view,
booking self-service, support-ticket self-service. **Governs**:
`blueprint/07`.

## Phase 8 — AI / Integrations

**Input**: Phase 0's AI answers, Phase 5-6 modules (the AI assistant
reads from them). **Output**: the AI assistant (if enabled) with its
permission-intersection mechanism wired to the actual modules built, plus
any email/SMS/payment integrations selected. **Governs**: `blueprint/11`,
`12`.

## Phase 9 — Security / Backup

**Input**: everything built so far. **Output**: full security-header
review, backup/restore/export mechanism (manual + scheduled), audit
logging coverage across every mutating action. **Governs**:
`blueprint/05`, `10`. Confirm the backup-vs-export distinction is
correctly implemented before this phase closes — a UI bug here is a data-
safety bug.

## Phase 10 — Responsive / Accessibility

**Input**: a functioning UI across all built modules. **Output**:
responsive behavior at real breakpoints (not necessarily copying Sanad's
literal px values — see `blueprint/15`), `prefers-reduced-motion` handled
at both CSS and JS-timer level, keyboard/focus/ARIA coverage for custom
components (especially any searchable-select equivalent).

## Phase 11 — QA / Acceptance

**Input**: a complete build. **Output**: every item in
`ACCEPTANCE-CHECKLIST.md` verified, screenshots captured, all roles
tested end to end. **Governs**: `ACCEPTANCE-CHECKLIST.md`.

## Phase 12 — Deployment Preparation

**Input**: an accepted build. **Output**: environment configuration,
secrets handling (following the write-only-secret UX convention from
`blueprint/12`), a documented deploy process, a final local preview ready
for the company's own inspection before any production deployment
decision (which remains a separate, explicit, human-approved step — this
phase prepares for it, it does not itself deploy to production).
