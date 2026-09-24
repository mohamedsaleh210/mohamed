# Build Modes

Two future deployment modes for a company built from this blueprint. The
current Sanad implementation **only actually provides Mode A** — do not
assume Mode B works without doing the architectural work this document
lists. Pick a mode explicitly in `COMPANY-ONBOARDING-TEMPLATE.md` §9
before Phase 1 of the build begins.

---

## Mode A — Independent Instance

One company per deployment, one company per database. **This is what
the current Sanad implementation actually is** — verified directly in
`blueprint/04-company-branch-tenant-model.md` and
`blueprint/05-roles-permissions-security.md`: each deployment reads its
own SQLite file (`DATA_DIR`), and cross-customer isolation is an
**infrastructure** property (separate process/container/database file per
customer), not a query-level filter.

### What Mode A gives you, already built

- Complete data isolation by construction — there is no code path that
  could leak one company's data into another's, because no other
  company's data is ever in the same database file.
- The license/subscription mechanism (`lib/tenant-policy.js` equivalent)
  already supports a "standalone, unmanaged" state with zero gating — a
  genuinely simple self-hosted deployment needs no multi-tenant
  infrastructure at all.
- The entitlements mechanism (module/public-element enable-disable) works
  per-deployment out of the box.
- Every module documented in the blueprint works as described, with no
  additional tenant-scoping work required.

### What Mode A costs

- Each new company needs its own deployment (own database file, own
  process/container, own domain or subdomain) — no shared infrastructure
  economics across companies.
- Platform-wide operations (e.g. "show me usage across all customers")
  require a separate central system reaching into each deployment, not a
  single query — this is exactly what Sanad's own external "central
  platform" product does today (see the `/platform-owner-access` SSO
  mechanism documented in `blueprint/04`), which is itself outside this
  codebase.

### When to choose Mode A

- A small number of companies, each wanting genuinely separate
  infrastructure (their own domain, their own backup/restore lifecycle,
  their own scaling).
- A company that wants to self-host entirely independently.
- The fastest path to a working build, since it requires no new
  tenant-isolation engineering — everything in the blueprint applies
  directly.

---

## Mode B — True Multi-Tenant SaaS

Multiple companies/offices sharing **one** platform deployment and **one**
database, with strict tenant isolation enforced in code (row-level
filtering, not just process separation). **The current Sanad
implementation does not provide this.** Do not build Mode B by simply
adding a `tenant_id` column here and there — every layer that currently
assumes "there is only one company's data in this database" needs
deliberate rework.

### What already exists as a starting point

A Postgres reference schema (`db/postgres/001_foundation.sql` in the
original Sanad repository, summarized in `blueprint/13-database-erd.md`)
sketches exactly this target: UUID primary keys, a real `tenants` table,
`tenant_domains` (custom-domain routing), `tenant_memberships` (per-tenant
role/permission JSONB, replacing the role-string + override-table model),
and Postgres **row-level security policies** keyed on a
`current_tenant_id()` session function. **This schema is aspirational and
unimplemented** — it covers only the platform/tenant/catalog/request/
quote/CMS/audit core. It has no finance, HR, payroll, treasury, custody,
cases, bookings, or support-ticket tables at all.

### Architectural changes Mode B requires, module by module

| Area | What must change from Mode A |
|---|---|
| Database | Every table gets a `tenant_id` (or inherits scope from a parent that has one); row-level security (Postgres RLS or equivalent application-level enforcement) on every tenant-scoped table, not just an optional filter a query might forget |
| Permissions | The current role-string + `user_permissions`-exceptions model is per-user, not per-(user, tenant) — a user who belongs to more than one tenant needs a `tenant_memberships`-style composite structure (exactly what the Postgres reference schema sketches), not the current single `users.role` column |
| Sessions | Session data must carry which tenant context is active; the current `TENANT_ID`-based cookie-naming trick (used today only to avoid cookie collisions between separate deployments sharing a proxy) is not sufficient for one process serving many tenants simultaneously |
| File storage | `UPLOAD_DIR` today is one directory per deployment; Mode B needs per-tenant storage scoping and per-tenant storage-quota enforcement (the existing `storageAllowance()` mechanism assumes one tenant per process) |
| Backup / restore | The current backup format snapshots one whole `DATA_DIR` — Mode B needs per-tenant backup/restore/export, which is a different operation than "copy the whole database file" |
| Branch model | Today's `office_branches` (a company's own internal locations) and a Mode B `tenants` table are two different concepts at two different levels — do not conflate them; a Mode B tenant would itself contain the existing branch model underneath it |
| AI assistant | The permission-intersection rule (`office data-sources ∩ user permissions`) needs an added tenant dimension: `tenant scope ∩ office data-sources ∩ user permissions` |
| License/entitlements | The existing `lib/entitlements.js`-style per-deployment JSON setting becomes per-tenant-row instead of per-deployment-file — a smaller change than most of the above, since it's already a data-driven allow-list |
| Every route/query | Any query written under Mode A's "there's only one company here" assumption needs an explicit tenant filter — this is the single largest source of risk in a Mode A→B migration, since a forgotten filter is a real cross-tenant data leak, not a cosmetic bug |

### When to choose Mode B

- Genuinely many companies, expected to share operational
  infrastructure/cost.
- A managed SaaS product being sold to many customers from one deployed
  platform.
- Willingness to invest the significantly larger engineering effort
  (L-sized, per `GAP-REGISTER.md`'s sizing) required to get tenant
  isolation right — this is not a weekend refactor of Mode A.

### The critical warning

**Never let a build described as Mode B silently ship as Mode A with a
`tenant_id` column bolted on but not actually enforced everywhere.** That
produces something that looks multi-tenant in the schema but leaks data
in practice — worse than honestly building Mode A and running multiple
separate deployments. If Mode B is chosen, the row-level-security (or
equivalent application-level enforcement, verified with real tests
attempting cross-tenant access) must be treated as a Phase 4/5
acceptance-blocking requirement, not a nice-to-have hardening pass at the
end.

---

## Decision summary

| | Mode A | Mode B |
|---|---|---|
| Matches current Sanad implementation | Yes, exactly | No — aspirational schema only, unimplemented |
| Isolation guarantee | Infrastructure-level (separate DB file/process) | Must be code-level (RLS or equivalent), new engineering |
| Effort to build from this blueprint | Direct — every module applies as documented | Large — every module needs tenant-scoping added |
| Best for | Few companies, each wanting real separation, or self-hosting | Many companies sharing one managed platform |
