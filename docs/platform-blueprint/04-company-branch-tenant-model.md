# 04 — Company / Office / Branch / Tenant Model

Source: `lib/tenant-policy.js`, `lib/license.js`, `lib/entitlements.js`,
`lib/office-branches.js`, `routes/admin/client.js`, `routes/admin/settings.js`
(branches tab), `server.js` (`/platform-owner-access`), and migrations
`038_companies_and_branches.js`, `055_tenant_office_branches.js`.

## Three distinct hierarchy levels — do not conflate these

This is the single most important structural fact in the whole platform,
and the naming in the codebase is genuinely confusing (three different
things are all called "tenant"/"branch" in different files), so it's
worth stating precisely.

```
PLATFORM (external product, not in this codebase)
  └── one deployed Sanad instance ("tenant" in the licensing sense)
        ├── office_branches      — the office's OWN physical locations  (B)
        │     └── users, requests, cases, agenda_events, … scoped here
        └── companies            — the office's CORPORATE CLIENTS       (C)
              └── company_branches — that client's own locations
                    └── requests, agenda_events tagged to this company/branch
```

### A. Platform level — **tag A/G**, not modeled in this codebase's DB

The "Sanad platform" that manages many deployed instances is a **separate
central product**, outside this repository. Evidence: `server.js`'s
`/platform-owner-access` route consumes a one-use, HMAC-signed,
short-lived token minted elsewhere to let a platform operator SSO into a
tenant instance for support (payload carries `tenant_id`, `exp`, `nonce`,
redirect target; spent nonces recorded in `platform_access_nonces` so a
link can't be replayed). `lib/emails.js` even defines a
`subscriptionDecision()` template (approve/reject a tenant application)
that is **never called anywhere in this repo** — confirming tenant
onboarding lives entirely in that separate central product.

Two local mechanisms connect a deployment to that platform:

- **`lib/tenant-policy.js`** — reads `DATA_DIR/tenant-license.json` (a
  file, not a DB row). `state()` → `{managed, allowed, status, expired,
  end}`. No license file = **`managed: false`**, i.e. a standalone
  self-hosted single-office install with **zero** subscription gating —
  this is the natural "fully independent white-label deployment" mode,
  already built and working. A managed instance's `allowance(kind,
  adding)` enforces numeric caps (`max_users`, `max_requests`,
  `max_branches`, `storage_mb`) read straight from the license file,
  checked at real creation points (new staff account, new request, new
  booking, bulk import).
- **`lib/entitlements.js`** — a separate, orthogonal **feature-flag**
  layer, stored per-deployment as one JSON setting
  (`platform_entitlements`). Fixed catalogues in code: 20 `MODULES` keys
  (requests, cases, agenda, payroll, treasury, …) and 9 `PUBLIC_ELEMENTS`
  keys (home, services, consultations, tracking, client_portal, …), plus
  a `serviceIds` allow-list (`'*'` or explicit ids). **Unset defaults to
  "everything enabled"** — entitlements are an opt-in *restriction*, not
  an opt-in *unlock*, so a fresh standalone deploy needs no entitlements
  configuration to be fully functional.

**For the blueprint**: these two mechanisms *are* the white-label
"subscription tier / package" system, already implemented and reusable
as-is (tag A): license = quantity caps + trial/active/expired status,
entitlements = which modules/public pages/services a given deployment
shows at all. A future multi-tenant-in-one-database architecture (several
companies sharing one deployment) does **not** exist today — see
`13-database-erd.md` for the Postgres reference schema that sketches this
as a target, unimplemented architecture.

### B. Office/branch level — `office_branches` — **tag A (mechanism) / D (data)**

The office's own internal locations (e.g. a Cairo branch and an
Alexandria branch of the *same* law firm). `office_branches(id, name,
code, active, is_main)`, exactly one `is_main=1` row, seeded on install.
`office_branch_id` was added (migration 055) to nearly every entity table:
`users`, `clients`, `companies`, `company_branches`, `requests`,
`legal_cases`, `agenda_events`, `data_import_batches`, `report_profiles`,
`report_exports`.

`lib/office-branches.js` `resolveBranchId(submitted, user)` — resolution
order: a submitted valid active branch → the acting user's own branch →
the main branch. **Never returns null**, so no record is ever
"unassigned."

**Important limitation, cross-referenced from `05-roles-permissions-
security.md`**: `office_branch_id` is a labeling/reporting/default
dimension, **not an enforced access boundary** — it's used as a real
WHERE-clause filter in only two places (`routes/public.js`,
`routes/admin/report_profiles.js`). A staff member's visibility into
requests/cases is governed by `request_assignees`/permission abilities,
not by which office branch they belong to. A white-label variant that
needs true per-branch data isolation (staff at Branch A structurally
cannot see Branch B's records) would need to extend `lib/access.js`'s
filters to include branch scoping — this does not happen automatically
today.

Admin CRUD: `routes/admin/settings.js` (branches tab) — create (unique
name), toggle active (blocked for the main branch, which can never be
deactivated).

### C. Corporate client level — `companies` / `company_branches` — **tag D**

The office's **customers**, kept deliberately separate from the office's
own `office_branches`. `companies(name, legal_name, registration_no,
tax_no, phone, email, address, contact_name, active)` →
`company_branches(company_id, name, code, phone, email, address, manager)`
→ a request optionally carries `company_id`/`branch_id`. There is **no**
`is_company` flag on `clients` — the individual-vs-corporate distinction
lives entirely at the **request** level, not the client-account level (see
`07-client-engine-appointments.md`).

`company_contacts` (representative/contact persons, optionally tied to one
branch) is the "representative" concept for corporate clients —
independent from `clients.relation` (which is the *individual*-client
representative concept, e.g. a guardian acting for a minor).
`company_services` is a join table letting the office restrict which
catalogue services a given corporate client is entitled to order.

Admin surface: `routes/admin/client.js` (`GET /companies`, company
file/detail, printable company/branch profile documents via
`lib/reporting.js`, contact/service management).

## Global vs tenant-scoped vs branch-scoped vs user-scoped — quick reference

| Scope | Examples |
|---|---|
| **Global** (code-level, same for every deployment) | Permission catalogue keys, `STATUS` enum, module/public-element key lists |
| **Deployment/"tenant"-scoped** (one DB file = one office) | Everything — this is a single-tenant-per-deployment architecture; there is no cross-office row in any table |
| **Office-branch-scoped** (labeling only, not enforced isolation) | `users`, `requests`, `legal_cases`, `agenda_events`, `report_profiles`, `data_import_batches` all carry `office_branch_id` |
| **Company/company-branch-scoped** (corporate client dimension) | `requests.company_id`/`branch_id`, `company_contacts`, `company_services` |
| **User-scoped** (real access boundary) | `request_assignees`, `case_assignees`, `support_ticket_assignees` — presence in these join tables is what actually restricts a non-privileged staff member's visibility |
| **Client-scoped** | `clients.id` ownership of `requests`/`bookings`/`support_tickets` via `client_id` |

## Onboarding, subscription, trial — what exists vs. what's external

- **Trial/active/suspended status, numeric usage limits, expiry dates**:
  exist, enforced by `lib/tenant-policy.js`/`lib/license.js` — but the
  license *file itself* is provisioned externally (by the central
  platform), not through any UI inside this codebase.
- **Feature/module entitlement per deployment**: exists
  (`lib/entitlements.js`), stored locally, but again the initial
  provisioning is presumably done by the central platform (see
  `pilot-fixtures.js` for an example of programmatically merging new
  module keys into a tenant's entitlement set).
- **Company (corporate-client) onboarding/approval within one
  deployment**: a plain admin CRUD action (`routes/admin/client.js`), no
  approval workflow, no trial concept — companies are just customer
  records.
- **No "start/end date" or "package tier" concept on `companies`** — only
  the whole-deployment license carries that, not individual corporate
  clients within a deployment.
