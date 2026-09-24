# MASTER BLUEPRINT — Sanad Platform Architecture (Consolidated)

This is the single consolidated entry point into the platform
architecture. Every section below is a summary with a pointer into the
detailed document in `blueprint/` — read this first for the shape of the
whole system, then go deep on whichever module you're building.

DNA tags (full legend in `blueprint/00-README-and-methodology.md`):
**A** Core Platform DNA · **B** Optional Module · **C** Country-Specific ·
**D** Company-Configurable · **E** Brand-Specific · **F** Content-Specific
· **G** Integration-Specific · **H** Security/Governance.

**Golden rule: SAME PLATFORM DNA ≠ SAME WEBSITE DESIGN.** Everything
tagged A/B/H below is the reusable engine. Everything tagged E/F is
Sanad's own choice and must be replaced per company, never inherited.

---

## 1. Module map

| Module | Tag | What it does | Detail |
|---|---|---|---|
| Public website | A(structure)/F(copy) | Marketing site, catalogue browse, request/booking entry, tracking | `blueprint/02` |
| Services engine | A(mechanism)/D(data) | pages → categories → services catalogue | `blueprint/02`, `03` |
| Request workflow engine | A | Full lifecycle: creation → assignment → fees → payment → completion/archive/erase | `blueprint/03` |
| Company/office/branch/tenant model | A(mechanism)/D(data) | Deployment hierarchy, corporate clients, branch scoping | `blueprint/04` |
| Roles & permissions | A | Role-default + per-user-exception model, Super Admin tier | `blueprint/05` |
| Security | A/H | Auth, CSRF, headers, audit, tenant isolation | `blueprint/05` |
| HR / employee engine | A | Profile, onboarding (access card), offboarding (handover) | `blueprint/06` |
| Client engine | A | Individual + corporate clients, representative concept | `blueprint/07` |
| Appointments/consultations | B | Booking → 1:1:1 request+agenda+booking pivot | `blueprint/07` |
| Cases (legal ops) | B (legal-specific) | Request-promotes-to-matter-file pattern | `blueprint/08` |
| Financial system | A(mechanism)/C(currency) | Treasury, revenue, expenses, custody, payroll | `blueprint/09` |
| Documents/files | A/H | Upload, authorization, storage | `blueprint/10` |
| Backup/restore/export | A | Manual/scheduled backup, restore-on-restart, branch export (non-restorable) | `blueprint/10` |
| AI assistant | B/G | Permission-intersected data access, honest failure states | `blueprint/11` |
| Notifications | A/G | In-app (primary), email, SMS (narrow) | `blueprint/12` |
| Settings | A(shape)/D(values) | Flat key-value store, write-only-secret convention | `blueprint/12` |
| Database | A | ~82 SQLite tables; a separate Postgres target schema exists, unimplemented | `blueprint/13` |
| Reporting | A(mechanism) | CSV + browser-print exports, per-branch letterhead branding | `blueprint/14` |
| Localization | A(mechanism)/C(content) | ar/en only, session-scoped, not a full i18n system | `blueprint/02`, `14` |
| Responsive/UX system | A | Table→card, searchable select, tabs, dialogs, pager | `blueprint/15` |
| Motion system | A(patterns)/E(values) | Entrance/hover/tab/skeleton/chart-draw categories | `blueprint/15` |
| Content protection | A(mechanism)/D(config) | Deterrence-only copy/drag/right-click blocking + watermark | `blueprint/02` |
| Brand | E | Sanad's own identity — never a default | `blueprint/SANAD-BRAND-REFERENCE.md` |

## 2. Role map

Four role strings (`admin`, `supervisor`, `lawyer`, `accountant`) each
with a default permission set, plus per-user grant/revoke exceptions, plus
a Super Admin **flag** (not a 5th role) layered on top of `admin` with no
permission ceiling. Client accounts are entirely separate, with no role
concept. Full catalogue (~70 permission keys across 11 groups) and the
anti-lockout mechanism protecting the last admin/Super Admin: `blueprint/05`.

```
Super Admin (flag, unconditional)
  └── admin (role) — everything except erase group
        supervisor — broad operational, no users.manage/settings.manage
        lawyer — own-file only (requests.view_all absent by default)
        accountant — money/treasury/payroll, no request/case editing

clients (separate table, no role/permission concept)
  — individual (with a `relation` representative concept)
  — corporate (via requests.company_id, no separate login type)
```

**For a white-label company**: role *names* and *permission catalogue
contents* are tag D — rename/reshape per company's org structure using
the existing mechanism; the resolve-on-every-request enforcement pattern
and the Super Admin anti-lockout guarantees are tag A/H and should be
kept as-is.

## 3. Service architecture

`pages` (audience sector) → `categories` → `services`, with
`request_services` allowing one request to carry several services. Seed
data (`db/catalogue.js` equivalent) is the swap point per company — the
structure itself is reusable. **No formal quote/approval workflow exists
today** — pricing is flat fee-line-items (`fee_items`) summed into
`total_amount`, with a payment ledger (`payments`) and separate
discount/write-off concepts. A richer quote state machine exists only as
an *unimplemented* target in the Postgres reference schema. Detail:
`blueprint/03`.

## 4. Request/workflow map

```
CREATE (public guest / office intake / bulk import / booking)
  → new (default status)
  → reviewing / in_progress / awaiting_docs / awaiting_payment  (any order, no formal transition table)
  → completed (requires: 0 open todos, ≥1 document, a completion_summary)
       ↳ reopening increments reopened_count
  → cancelled (no confirmation/reason required — the one status change with no guard)
  → archive (archived_at set, data intact) — REQUIRED before →
  → erase (permanent, requires typed ref + reason, ability requests.erase)
```

Assignment is many-to-many (`request_assignees`), asymmetric
(`canAssign` easier than `canUnassign`). Visibility is per-user-assignment
based, not branch-based. Comments are staff-only; `requirements` is the
one client-visible checklist. Full detail incl. automatic status
transitions and the closure two-step guard: `blueprint/03`.

## 5. Data relationships

Full entity inventory and Mermaid ERDs (Platform/Tenant, Request/
Workflow, Finance, HR/Payroll, Client, Operations, AI/Settings/Audit) in
`blueprint/13`. Headline structural facts:

- **Single-tenant-per-deployment** — one SQLite DB file per company, not
  shared-database multi-tenancy. See `BUILD-MODES.md` for what Mode B
  (true multi-tenant) would require instead.
- **Office branches are a labeling dimension, not an enforced access
  boundary** — real visibility is governed by `request_assignees`/
  `case_assignees` and permission abilities, not branch membership.
- A separate, unimplemented Postgres target schema exists in the source
  repo sketching a real `tenants` table + row-level security — useful as
  a Mode-B starting skeleton, not as evidence Mode B already works.

## 6. Security model

Summary (full detail `blueprint/05`): server-side permission re-resolution
on every request (never trusts session cache), CSRF via constant-time
comparison (with a manual-deferred-check risk for multipart routes,
flagged), hand-written security headers (CSP has `unsafe-inline` — a
known weakening worth fixing in a rebuild), bcrypt password hashing +
strong password policy, IP-based (not account-based) login throttling,
device-fingerprint tracking with new-device alerts (staff login only —
the public unified-login entry point has a gap here, flagged), audit
logging with automatic money-detail redaction for users lacking
`money.view`, and a redundant, layered Super Admin anti-lockout guarantee.
Tenant isolation is infrastructure-level (separate deployment), reinforced
by a license/subscription gate that can lock a whole deployment read-only.

## 7. Finance

Single-currency (no FX engine — tag C, swap the one currency setting).
Treasury (general cash ledger) + Revenue (request-centric payment/
discount/write-off tracking) + Expenses (two approval paths: direct
reimbursement vs. custody-funded) + Custody (staff cash-advance lifecycle,
FIFO drawdown) + Payroll (salary profiles → runs → items, Excel import/
export, roll-forward of stable fields only). **No functioning tax/VAT/
e-invoicing engine** — only identity-labeling fields exist. Full detail:
`blueprint/09`.

## 8. HR

Deliberately minimal account creation (username+password+role only —
everything else self-filled by the employee), profile-completeness
gating, a genuine employee login-card/QR onboarding flow (email/SMS/PDF
distribution, self-invalidating on use), and a mandatory work-handover
flow on deactivation (prevents orphaned assigned work). Full detail:
`blueprint/06`.

## 9. Client portal

Individual-account-only login (no company-login type — corporate
identity lives on the request, not the account). Token-based email
verification (never OTP), Google OAuth, guest-to-client auto-linking by
email/phone match. Deliberately curated client-visible data slice (no
comments, no todos, no audit trail, no itemized payment ledger). Full
detail: `blueprint/07`.

## 10. Appointments/Consultations (optional module)

One `booking_enabled` toggle gates the entire module. Every booking
atomically creates a linked request + agenda event + booking row (1:1:1)
— appointments reuse the request billing/assignment machinery rather than
a parallel system. Client self-service is deliberately narrow (reschedule/
cancel only). Full detail: `blueprint/07`.

## 11. Cases (legal-specific optional module)

Request-promotes-to-matter-file pattern: a case is never a replacement
for a request, only an explicit conversion once real legal work begins.
No time/hourly billing on cases — fees stay on the parent request. Legal-
specific status enum and category seed data (tag C) vs. the reusable
"intake → formal matter file" *shape* (tag A), which could generalize to
other professional-services white-label variants with real rework, not a
relabel. Full detail: `blueprint/08`.

## 12. Files

One authorization gateway (`GET /files/:fileId`) for all uploaded
document bytes; random on-disk filenames, original names DB-only; HEIC
conversion server-side. **A known, real gap**: the `documents.internal`
staff-only flag is not consistently checked at this gateway — flag for
fixing in any rebuild. Full detail: `blueprint/03`, `10`.

## 13. Backup

Manual + scheduled office-scope backups (SQLite online-backup API, safe
against a live DB), full/platform scope reserved for the platform owner.
Integrity verified via SQLite `PRAGMA integrity_check`/`foreign_key_check`
(no separate checksum). **Restore only takes effect on the next server
restart**, always preserving the prior live data as a timestamped
rollback snapshot first. **Branch export is explicitly, structurally
never restorable** — a read-only JSON+files export, distinct from a
backup. Never let a rebuild's UI blur this distinction. Full detail:
`blueprint/10`.

## 14. AI

Formal rule: `AI ACCESS = OFFICE-LEVEL DATA-SOURCE ALLOWLIST ∩
REQUESTING USER'S REAL PERMISSIONS` — reuses the exact same ability
checks the human UI uses, module by module. Honest "provider not
connected" failure state (never fabricates a response). Two hardcoded
providers (OpenAI/Anthropic), one hardcoded base system prompt plus one
office-configurable instruction layer (no separate platform-tier prompt).
Full detail: `blueprint/11`.

## 15. Reports

CSV (UTF-8 BOM) + browser-print HTML exports, no server PDF library
(deliberate, for correct Arabic RTL shaping) except one hand-written
binary-PDF builder for employee access cards. Per-branch letterhead
identity (`report_profiles`) is create-and-set-default only, no edit
route. No generic report-builder — filters are hardcoded per route. Full
detail: `blueprint/09`, `14`.

## 16. Settings

One flat `settings(key, value)` table. Full inventory of every key found
(site/brand, AI, backup, content protection, finance, notification,
security/platform) in `blueprint/12`. Reusable write-only-secret UX
convention for API keys (never echoed back, explicit "clear" checkbox).

## 17. Public website

Hybrid static/CMS homepage (13 sections, 3 of them currently orphaned/
unrendered — a flagged discrepancy), catalogue browse, request/booking
entry, guest tracking (ref+phone, never ref alone), a real upload gateway.
**No general static-page CMS** — about/FAQ/guides pages are hand-coded
templates with no admin UI. **No SEO infrastructure** (no sitemap,
robots.txt, per-page meta description, structured data) — greenfield for
any rebuild. Full detail: `blueprint/02`.

## 18. Localization

Small `STATUS`/`UI` dictionaries (ar/en only) plus per-template inline
bilingual ternaries plus DB columns with parallel `_ar`/`_en` suffixes —
**not a comprehensive translation-key system**. Session-scoped switch, no
third language possible without code changes. Treat language (ar/en
mechanism) and country (Egypt-specific business rules: national ID
format, currency, court fields, case categories) as two separate
configuration axes — this codebase currently conflates them. Full detail:
`blueprint/02`, `14`.

## 19. UX system (brand-neutral)

Reusable, extractable interaction patterns: table→card responsive
transform (with a documented `[hidden]` pitfall), a full accessible
searchable-select component, pure-CSS radio-driven tabs, native
`<dialog>` modals, SVG-sprite icon delivery, master/detail layout, a
numbered pager. Design-token *shape* (semantic color/radius/shadow/motion
layer) is reusable; actual values are brand-specific. Full detail:
`blueprint/15`.

## 20. Motion

Reusable pattern *categories* (on-load entrance for above-the-fold
content, staggered reveal, hover lift, tab-switch fade, drawer/dialog
open, auto-dismissing success banners that never auto-dismiss errors,
skeleton shimmer scoped to genuinely-async content only, chart draw-in) —
`prefers-reduced-motion` handled at both CSS and JS-timer level (the
"skip the timer, don't just shorten it" pattern is worth keeping). Actual
timing/easing values are Sanad's specific "calm/understated" personality
choice — a different company should choose its own. Full detail:
`blueprint/15`, `SANAD-BRAND-REFERENCE.md`.

## 21. Content protection (optional, deterrence-only)

Office-wide toggle for select/drag/right-click blocking + a server-
generated SVG watermark, scoped out of the client portal and admin panel
by construction, with form-field exemptions. **Must always be described
as deterrence, never as screenshot prevention** — the code itself is
explicit about this and any rebuild's UI copy must preserve that honesty.
Full detail: `blueprint/02`.

---

## Where to go next

- Filling in a new company's details → `COMPANY-ONBOARDING-TEMPLATE.md`
- Populating machine-readable config → `config/*.example.json`
- Briefing a fresh build session → `NEW-COMPANY-MASTER-PROMPT.md`
- Sequencing the actual build → `IMPLEMENTATION-PHASES.md`
- Validating a finished build → `ACCEPTANCE-CHECKLIST.md`
- Knowing what's honestly unfinished → `GAP-REGISTER.md`
- Choosing single-tenant vs. multi-tenant → `BUILD-MODES.md`
