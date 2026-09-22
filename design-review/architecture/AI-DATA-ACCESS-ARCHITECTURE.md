# AI DATA ACCESS & REPORTING ARCHITECTURE

**Status: analysis only. Nothing in this document has been implemented.** No code, schema,
route, or permission was changed to produce it. This extends the project's Handoff/Audit record
with a design for a future permission-aware AI data assistant, as requested. Every reference to
"real Sanad" behavior below (roles, permissions, entitlements, audit, settings) is grounded in the
actual codebase at `main` @ `a1f3345087b8b22f4c31f38152f14386cc0f11df`, not assumed.

---

## 0. Grounding: what already exists (and what doesn't)

This design deliberately reuses four patterns Sanad already has, rather than inventing new ones:

| Existing mechanism | File | Reused for |
|---|---|---|
| Per-user ability check `can('domain.verb')` / `req.userCan()` | `lib/permissions.js`, `middleware/auth.js` | The "User Permission" term in the intersection model |
| Tenant-level module on/off switches (`MODULES`, 20 real keys) | `lib/entitlements.js` | The exact toggle UX pattern for "AI Enabled Sources" |
| Free-form, structured action log (`audit.log(req, action, {type,id,label,details})`) | `lib/audit.js` | AI audit logging, same table shape, new action prefix |
| Money-entry masking by role (`MONEY_ACTIONS`, `isMoneyEntry`) | `lib/audit.js` | Precedent for "sensitive fields excluded unless authorized" |
| Settings page, tab-per-concern (`?tab=site/mail/google/branches/staff/files/backup`) | `views/admin/settings.ejs` | Where a new `?tab=ai` panel belongs |
| Platform owner vs. tenant admin distinction (`isSanadOwner`, `req.session.platformOwnerAccess`, `TENANT_ID`) | `middleware/auth.js`, `server.js` | Maps directly to "Super Admin" vs. "Admin" in this brief |

**What does not exist today, confirmed by search**: no AI/LLM code, no `ai_settings` table, no
assistant concept, nothing named `openai`/`anthropic`/`claude`/`gpt`/`llm` anywhere in the
repository. This is a from-scratch subsystem, not an extension of a hidden feature.

**What Sanad's real structure does *not* support today**: there is no "department/team" entity
distinct from `office_branch_id`. Per the brief's own instruction ("department/team where real
Sanad structure supports it"), department/team scope is **out of scope** for this design until such
a structure exists — flagged explicitly in §2 rather than invented.

**Real role set** (unchanged by this design): `admin`, `supervisor`, `lawyer`, `accountant`
(staff) + `client` (portal). No other staff role exists. "Super Admin" below refers to the
existing Sanad **platform owner** concept (`isSanadOwner` / `platformOwnerAccess`), which already
sits above tenant `admin` in the real codebase — not a new role invented for this feature.

---

## 1. Data-source registry

A new registry, `lib/ai-sources.js`, structurally identical to `lib/entitlements.js`'s `MODULES`
array — same shape, same `key`/`label` pairs, so the Settings UI can reuse the exact same
checkbox-list component. Each entry additionally declares which real database tables/queries back
it and which existing permission(s) gate it at the user level, so the registry is also the single
place that documents the mapping from "AI source" to "real data."

| Source key | Label (ar) | Backing (real tables/queries) | Gated by existing permission(s) | Sensitivity |
|---|---|---|---|---|
| `requests` | الطلبات | `requests`, `request_services`, `request_assignees` | `requests.view_all` / assignee-scoped | normal |
| `request_workflow` | حالة وسير عمل الطلب | `requests.status`, `request_time_pauses`, `todos` | same as `requests` | normal |
| `cases` | القضايا | `legal_cases`, `case_assignees`, `hearings`, `case_events` | `cases.view_all` / assignee-scoped | normal |
| `clients` | العملاء | `clients` | `clients.directory` | normal, PII |
| `companies` | الشركات | `companies` | `clients.directory` | normal |
| `branches` | الفروع | `company_branches`, `office_branches` | `clients.directory` | normal |
| `employees` | الموظفون | `users` (non-secret columns only, see §8) | `employees.view` (proposed; see §7) | **sensitive (PII)** |
| `appointments` | المواعيد | `bookings`, `booking_slots` | `bookings.manage` / own-assigned | normal |
| `consultations` | الاستشارات | `services.is_consultation=1`, `bookings` | `consultations` module entitlement | normal |
| `tasks` | الأعمال | `todos`, `case_tasks`, `agenda_events` | `agenda.view` / own-assigned | normal |
| `documents_meta` | بيانات المستندات (وصفية فقط) | `documents`, `document_files` — **filenames/counts/status only, never file bytes** | `documents.view` (implicit via request/case access) | normal |
| `treasury` | الخزنة | `treasuries`, `treasury_transactions` | `treasury.view` / `money.view` | **sensitive (financial)** |
| `revenue` | الإيرادات | revenue aggregate queries (`routes/admin/revenue.js`) | `revenue.view` | **sensitive (financial)** |
| `expenses` | المصروفات | `expenses`, `expense_categories` | `expenses.view_all` | **sensitive (financial)** |
| `custody` | العهد | `staff_custodies`, `custody_returns`, `custody_events` | `custody.view_all` / own | **sensitive (financial)** |
| `payroll` | المرتبات | `payroll_runs`, `payroll_items`, `salary_profiles` | `payroll.view_all` / `payroll.view_own` | **sensitive (financial + PII)** |
| `payments` | الدفعات والفواتير | `fee_items`, payment rows inside `requests`, `booking_invoices` | `money.view` | **sensitive (financial)** |
| `reports` | هوية التقارير | `report_profiles` | `reports.view` | normal |
| `renewals` | الانتهاء والتجديد | `requests.expires_on/renewal_on` derived view | `renewals.view` (via `requests`) | normal |
| `support` | الدعم الفني | `support_tickets`, `support_messages` | `support.view` | normal |
| `cms` | محتوى الموقع | `content_pages`, `services`, `homepage_*` settings | `content.manage` (read subset) | normal, public anyway |
| `faq` | الأسئلة الشائعة | `guides`/FAQ content tables | public content | normal |
| `services` | الخدمات | `services` | public content | normal |
| `audit_activity` | سجل النشاط والتدقيق | `audit_log`, `login_history` | `activity.view` / `security` module | **sensitive (security)** |

Every source is **OFF by default** in a new tenant. Financial sources (`treasury`, `revenue`,
`expenses`, `custody`, `payroll`, `payments`) and `employees`/`audit_activity` are additionally
flagged `requires_explicit_authorization: true` in the registry — the Settings UI must show a
distinct warning/confirmation step before an Admin can turn these on, and only Super Admin can
grant an Admin the right to touch this category at all (§2, §6).

---

## 2. Permission intersection model

Exactly the formula in the brief, made concrete against Sanad's real primitives:

```
Effective AI Access =
    UserPermission(u)                     -- req.userCan(...) / ROLE_DEFAULTS, unchanged
  ∩ AIEnabledSources(tenant)               -- new: which registry keys are ON for this tenant
  ∩ TenantOfficeScope(u)                   -- existing: TENANT_ID + office_branch_id, unchanged
  ∩ ObjectScope(u, request)                -- existing per-object ownership/assignment checks
  ∩ AssistantProfileScope(profile)         -- new: this assistant's own source/branch allow-list
```

Nothing on the right-hand side can *add* access the left-hand side denies. Concretely, for a
lawyer whose role has no `money.*` permission (the real `ROLE_DEFAULTS.lawyer`, confirmed
throughout RC1's role matrix), the intersection is empty for every financial source **regardless**
of what the Finance Assistant profile or tenant AI settings allow — the user-permission term is
always evaluated first and is never widened by AI configuration. This mirrors exactly how
`requireModule()` (tenant entitlement) and `can()` (user permission) already compose today: both
must pass, neither can substitute for the other.

**Object scope reuses existing scoping, not a new concept**: "user's assigned requests only" is
the same `canSeeRequest()`/assignee-join logic `loadRequest` already applies; "client-owned
records only" is the same `req.session.client.id` scoping the portal already applies. The AI
service (§6) calls the *same* scoping functions the human-facing routes call — it does not
reimplement them.

**Scope controls supported now** (because the real schema supports them):
- entire authorized tenant/office (`TENANT_ID`)
- selected company (`companies.id`)
- selected branch(es) (`office_branches.id` / `company_branches.id` — see §5's reuse of the future
  Searchable Branch Multi-Select)
- user's assigned requests only (`request_assignees`)
- user's assigned cases only (`case_assignees`)
- client-owned records only (`clients.id` via portal session)
- date range (every relevant table already has a date/timestamp column)

**Not supported today, explicitly deferred**: department/team scope. No department/team table
exists; adding one is out of scope for this document and would need its own design once (if) the
underlying structure is built.

---

## 3. Assistant profiles

A new **configuration entity**, not a new backend role. `ai_assistant_profiles` (see §11) rows are
data, evaluated at runtime the same way `ai_sources` toggles are — never compiled into
`ROLE_DEFAULTS` or `CATALOGUE`. A profile can be disabled, cloned, or deleted without touching the
real permission system.

| Field | Purpose |
|---|---|
| `name`, `description` | e.g. "Finance Assistant" |
| `enabled` | on/off |
| `allowed_roles` | subset of the 5 real identities (`admin`,`supervisor`,`lawyer`,`accountant`,`client`) — never a fabricated role |
| `allowed_sources` | subset of §1 registry keys — still intersected with the tenant's own `ai_sources` toggle and the user's permissions |
| `allowed_scope` | branch/company list, or "assigned only", or "client-owned only" |
| `provider_config_id` | FK to §7's provider config (model/provider) |
| `system_instructions` | free text, tenant-authored |
| `language` | `ar` / `en` / auto (matches the app's real `lang`/`dir` mechanism) |
| `allowed_actions` | `read_only` (default) or a specific allow-list of proposed-action types (§6) |
| `can_generate_reports` | bool |
| `usage_limit` | requests/day or tokens/month, enforced server-side |

Example seeded profiles (data, not code): **Public Service Assistant** (sources: `services`,
`faq`, `cms`; roles: none — public, unauthenticated FAQ only, out of the permission-aware scope
entirely and kept separate from this system's authenticated path), **Client Assistant** (sources:
`requests`, `request_workflow`, `appointments`, `support`; roles: `client`; scope: client-owned
only), **Legal/Employee Assistant** (sources: `requests`, `cases`, `tasks`, `clients`; roles:
`lawyer`,`supervisor`,`admin`; scope: assigned-only for lawyer, full for supervisor/admin — the
*scope* differs per user even under one profile, because the permission-intersection in §2 still
applies per request), **Finance Assistant** (sources: `treasury`,`revenue`,`expenses`,`payroll`,
`payments`; roles: `accountant`,`admin`), **Management Assistant** (broadest `allowed_sources`,
roles: `admin`,`supervisor`; still bounded by each user's own permissions per §2).

---

## 4. Reporting architecture

Every reporting question in the brief ("how many open requests," "summarize by branch," "compare
revenue and expenses") reduces to the same three-stage pipeline:

1. **Intent → structured query plan.** The provider (§7) receives the user's natural-language
   question plus a *manifest* of which sources/fields are currently in `Effective AI Access`
   (never the raw schema, never other sources) and returns a structured plan (source, aggregation,
   filters, group-by) — not raw SQL. This keeps the LLM from ever needing direct database access.
2. **Plan → permission-filtered query.** The AI Data Access Service (§6) translates the plan into
   parameterized queries against the same scoping already used by human routes (e.g. the exact
   `WHERE` scoping `statusCounts()` in `routes/admin/requests.js` already applies for a
   role-visible request count), executing with the same DB connection and the same row-level
   restrictions a human page would get.
3. **Result → presentation.** Structured results are formatted as text, a table, a KPI tile row
   (reusing the app's own `.stat`/`.stat-grid` component language — see the Phase 2/3 design
   system already in `admin.css`), or a chart (reusing the existing mini-chart utilities noted in
   the V2/V3 design work) — never by asking the LLM to "make up" a chart from unstructured text.

Downloadable exports reuse the existing `lib/reporting.js` `csv()`/`print()` helpers already used
by every admin export button today, so an AI-generated report's PDF/Excel output goes through the
same code path (and the same access checks) as a human-triggered export.

---

## 5. Settings UX

`Settings → AI & Smart Assistant → Data Sources`, as a new tab on the existing `settings.ejs`
pattern (`?tab=ai`, alongside the real `site`/`mail`/`google`/`branches`/`staff`/`files`/`backup`
tabs). Visible only to Admin (with Super-Admin-granted permission, see below) and Super Admin.

- **Data Sources panel**: one row per §1 registry entry, a toggle exactly like `entitlements.js`'s
  existing module-toggle UI, grouped into "General" and "Financial & sensitive" (the latter behind
  a confirmation step, per §1).
- **Scope panel**: branch/company multi-select. Explicitly designed to **reuse the future
  Searchable Branch Multi-Select component** referenced in this brief, once it exists — this
  document does not design that component, only declares the dependency, since it is itself listed
  as a future item.
- **Assistant Profiles panel**: list/create/edit/clone/disable profiles (§3), each opening a form
  matching the profile field table above.
- **Super Admin delegation**: a new permission `ai.settings.manage` (following the existing
  `<domain>.<verb>` catalogue convention seen throughout `lib/permissions.js`, e.g.
  `agenda.manage`, `cases.view_all`). By default no tenant Admin has it — Super Admin (the real
  platform-owner concept, `platformOwnerAccess`) must explicitly grant it per tenant, mirroring how
  tenant module entitlements are already Super-Admin-controlled today via `platform_entitlements`.

---

## 6. Read-only architecture (default behavior)

All AI data access is READ-ONLY by default and is served by a new, single-purpose service layer —
**not** direct AI-to-database access:

```
User → Admin route (new, thin) → AI Data Access Service → same scoped query
                                                             functions the
                                                             human UI already
                                                             uses (loadRequest,
                                                             canSeeRequest,
                                                             statusCounts, …)
                                        ↓
                                  Provider Abstraction (§7)
                                        ↓
                              LLM (structured plan only,
                              never given raw SQL access)
```

The AI Data Access Service is the **only** code path allowed to assemble an AI response. It:
1. Resolves `Effective AI Access` (§2) for the authenticated request.
2. Builds the source manifest handed to the provider (field names + row counts the plan may use —
   never raw rows at this stage).
3. Executes the returned plan through existing, permission-scoped query functions.
4. Redacts sensitive fields (§8) from the result set before it is ever included in a prompt or a
   response.
5. Logs the whole exchange (§9).

No new database credentials, no service-account bypass, no "the AI runs as an internal super-user"
shortcut — the service always executes as the requesting user's own effective permission set.

---

## 7. Future approved-action architecture (not implemented now)

Any future AI-proposed *write* strictly follows:

```
AI proposes (structured, typed action + parameters, never free-text)
   → rendered to the user as a normal confirmation dialog
   → user explicitly confirms (a real click, real CSRF token, like every other Sanad form)
   → the EXISTING authorized route/service executes it
     (e.g. POST /requests/:id/update — the real route, with its real can() gate)
   → existing audit.log() records it, tagged with the originating AI session id
```

The AI never calls a database write directly and never gets a special "AI bypass" route. A
proposed action is only ever a pre-filled version of a form a human could already submit through
the existing UI, subject to the exact same `can()` check that route already has. If the
authenticated user lacks the permission for that action, the AI must not even offer to propose it.

---

## 8. Security architecture

- **No direct/unrestricted DB access for the AI.** Only the AI Data Access Service (§6) touches
  the database on the AI's behalf, and only through the same query functions/scoping the rest of
  the app uses.
- **Every AI data request is evaluated against**: authenticated user (`req.session.user` /
  `req.session.client`), role, effective permissions (`req.userCan`), tenant (`TENANT_ID`), branch
  scope (`office_branch_id`), object ownership/assignment (existing per-entity checks), and AI
  source configuration (§1/§2) — in that order, matching the intersection formula in §2.
- **Sensitive-field exclusion, modeled on the existing `MONEY_ACTIONS`/`isMoneyEntry` pattern**: a
  new `AI_EXCLUDED_FIELDS` map per source (e.g. `users.password_hash`, `users.national_id`,
  `clients.email` unless the profile explicitly needs contact info) is applied before any row
  reaches a prompt. This is the same *shape* of allow/deny list already proven for hiding money
  entries from lawyers in the audit trail — reused, not reinvented.
- **Absolute, non-negotiable exclusions**: password hashes, session secrets (`SESSION_SECRET`,
  `PLATFORM_SESSION_SECRET`), CSRF tokens, session cookies, API keys/provider credentials, and any
  raw authentication token **must never** enter AI context under any configuration. This is
  enforced at the service layer (§6), not left to per-source configuration, so no admin
  misconfiguration can leak them.
- **Provider isolation**: the LLM provider never receives direct database credentials or a raw SQL
  interface — only the structured manifest and plan described in §4/§6.

---

## 9. Provider abstraction

A thin `lib/ai-provider.js` interface (`plan(question, manifest)`, `summarize(resultSet, intent)`)
with pluggable backends selected per assistant profile (`provider_config_id`). This keeps a
specific vendor choice out of the architecture itself — Sanad's own `lib/mailer.js` already
demonstrates this exact pattern (provider-agnostic interface, HTTP-API backends selected via a
setting, with a safe local fallback when unconfigured) and should be mirrored here: a safe
"disabled/no-provider" fallback state when no API key is configured, rather than a hard failure.

---

## 10. Auditability

New action prefix `ai.*` in the same `audit_log` table `lib/audit.js` already writes to — no new
audit storage mechanism. Logged per exchange: who asked (`user_id`), which assistant/profile was
used, timestamp, data domains queried (the resolved `Effective AI Access` sources actually touched,
not just the ones requested), filters/scope applied, whether a report was generated (and its id, if
saved — §11), whether an action was proposed, whether it was approved or rejected (and by whom),
provider/model identifier, and usage/cost metadata where the provider exposes it (token counts,
estimated cost).

**Explicitly avoid** storing full raw prompts/responses verbatim for sensitive domains — log the
resolved query plan and a short summary hash/excerpt instead of, e.g., a complete financial table
dump, mirroring the existing audit trail's own philosophy (`details` is "free-form and readable,"
not a full data export).

---

## 11. Expected database changes (proposed, not applied)

New migrations, numbered to continue the real sequence (current latest is `056_login_throttle.js`,
so these would start at `057`):

- `057_ai_sources.js` — `ai_sources` table: `tenant_id` (or scoped by `office_branch_id` in a
  single-tenant install), `source_key`, `enabled`, `updated_by`, `updated_at`. Mirrors
  `platform_entitlements`' storage shape (a settings blob) or a normalized table — normalized is
  preferable here since per-source audit (`updated_by`) matters more than for the coarser tenant
  entitlement toggle.
- `058_ai_assistant_profiles.js` — `ai_assistant_profiles` table per the field list in §3, plus a
  join table `ai_assistant_profile_roles` and `ai_assistant_profile_branches` (many-to-many,
  avoiding a JSON blob for the parts that need to be queried/filtered).
- `059_ai_provider_configs.js` — `ai_provider_configs`: `name`, `provider`, `model`, encrypted
  credential reference (never a plaintext key column — reuse whatever secret-handling convention
  the codebase already applies to `mail_api_key` in settings), `enabled`.
- `060_ai_saved_reports.js` — `ai_saved_reports`: `name`, `created_by`, `created_at`,
  `data_scope_json` (resolved scope at creation time, not "current user's scope" — see the
  permission note below), `filters_json`, `source_domains_json`, `summary_text`,
  `chart_config_json`, `assistant_profile_id`.
- `061_ai_audit_log.js` (or extend `audit_log` with a nullable `ai_session_id` + `ai_metadata_json`
  column instead of a parallel table — extension is preferable, since it keeps one audit trail
  rather than two that must be cross-referenced).

**Saved-report permission note** (directly answering "reports must not become a way to bypass
permissions after creation"): a saved report stores its **result** and its **originally-resolved
scope**, but every *re-open/re-view* of a saved report must **re-check** the viewing user's current
`Effective AI Access` against the report's stored scope and redact/deny accordingly — never
serve the stored result unconditionally to whoever has the URL. If the viewer's permissions have
since narrowed (or they're not the creator and lack equivalent access), they see a "no longer
authorized to view this report" state, not the cached data.

---

## 12. Expected services/modules

| Module | Responsibility |
|---|---|
| `lib/ai-sources.js` | Source registry (§1), read/write of `ai_sources` |
| `lib/ai-access.js` | Resolves `Effective AI Access` (§2) for a request/client session |
| `lib/ai-data-service.js` | The only code path that assembles AI responses (§6); wraps existing scoped query functions, never raw SQL from the model |
| `lib/ai-provider.js` | Provider abstraction (§9) |
| `lib/ai-profiles.js` | CRUD + resolution for assistant profiles (§3) |
| `lib/ai-reports.js` | Saved-report persistence + the re-check-on-view logic (§11) |
| `lib/ai-redact.js` | `AI_EXCLUDED_FIELDS` enforcement (§8), modeled on `isMoneyEntry` |
| `routes/admin/ai-settings.js` | `Settings → AI & Smart Assistant` (§5), gated by the new `ai.settings.manage` permission |
| `routes/admin/ai-assistant.js` (or `routes/portal/ai-assistant.js`) | The actual chat/query endpoint(s), always going through `ai-access.js` + `ai-data-service.js` |

---

## 13. API/route implications

- New admin routes only, following the existing `router.use(requireAdmin)` /
  `requireModule('...')` / `can('...')` layering already used by every other `routes/admin/*.js`
  file — no new auth mechanism.
- A new tenant-level entitlement key would need to be added to `lib/entitlements.js`'s `MODULES`
  (e.g. `ai_assistant`) so the whole feature can be turned off per tenant exactly like every other
  module, before any per-source toggle inside it even matters.
- New permission keys following the real `<domain>.<verb>` catalogue convention:
  `ai.settings.manage`, `ai.assistant.use`, `ai.reports.save`, `ai.reports.export`,
  `ai.actions.propose` (read/propose only — approval always goes through the real target route's
  own permission, never a separate "AI can act" permission).
- Client-portal routes for the Client Assistant profile reuse the existing `req.session.client`
  scoping already applied throughout `routes/portal.js` — no new client-auth mechanism.

---

## 14. Tests required (once implemented — not written now)

- **Permission-intersection unit tests**: for every (role × source × scope) combination relevant
  to the 5 real identities, assert the AI never returns data the same user's existing UI route
  would deny. The strongest test: reuse the *exact* fixtures RC1's role/auth matrix already
  established (e.g. a lawyer with no `money.*` permission must get an empty/denied result for any
  financial source, mirroring the already-verified UI behavior).
- **Redaction tests**: assert `password_hash`, session secrets, and provider credentials can never
  appear in a constructed prompt or logged audit entry, under any source/profile configuration —
  a property test over the full source registry, not a handful of examples.
- **Saved-report re-authorization tests**: a report saved under a broad-access user, later viewed
  by (a) the same user after their permissions are narrowed, and (b) a different, narrower-access
  user — both must be redacted/denied, never served the original cached result unconditionally.
- **Read-only enforcement tests**: assert no code path in `ai-data-service.js` can reach an
  `INSERT`/`UPDATE`/`DELETE` — e.g. a static check that its DB handle is a read-only connection or
  wrapped query builder that rejects mutations outright, not just "we didn't call write methods in
  this test."
- **Approved-action-flow tests**: an AI-proposed action must fail if the confirming user's
  permission for the *target* route is denied, even if the AI/profile "allowed_actions" says yes —
  the target route's own `can()` is the final word, tested independently of the AI layer.
- **Audit completeness tests**: every AI exchange produces exactly one `audit_log` row (or one
  extended row) with the required fields from §10 populated.
- **Regression against the existing suite**: none of `test.js`/`integration.js`/`edge.js`/
  `security.js` (the real, current 1,415-check suite) should need to change for this feature to
  exist, since it is additive and gated off by default — a real implementation phase should
  re-confirm the full suite still passes unchanged, the same discipline RC1/RC1.1 already applied.

---

## 15. Implementation phases (proposed)

1. **Foundation, no AI calls yet**: `ai_sources` registry + Settings UI toggle (all OFF by
   default), tenant entitlement key, new permissions, `ai-access.js` intersection resolver with
   full test coverage. Ships nothing user-facing beyond an empty, disabled settings tab.
2. **Read-only reporting, one assistant profile, one domain**: wire `ai-data-service.js` +
   `ai-provider.js` for a single low-risk source (`requests`) and a single profile (Management
   Assistant), admin-only, no saved reports yet. Prove the plan→query→redact→respond pipeline
   end-to-end before widening scope.
3. **Full source registry + multiple assistant profiles**: enable the remaining sources
   (financial ones still behind the explicit-authorization gate), the full profile system (§3),
   and the Client Assistant on the portal.
4. **Saved reports + exports**: `ai_saved_reports`, re-authorization-on-view, PDF/Excel export via
   the existing `lib/reporting.js` path.
5. **Approved-action proposals** (optional, later): the propose→confirm→existing-route flow (§7),
   starting with one low-risk, easily-reversible action type as a pilot before widening.

Each phase should end with the same discipline this project already applies at every milestone:
full regression suite green, live verification with real (disposable) data, a written readiness
note, and explicit approval before the next phase — the same pattern RC1/RC1.1 already established
in this repository's own history.

---

## 16. Risks

- **Scope creep into a general-purpose chat surface.** The brief is explicit that this is a
  permission-aware *data* assistant, not an open-ended agent. The architecture above intentionally
  gives the model only a structured plan interface (§4/§6), never a raw query or shell — this is
  the primary defense against the model being coaxed into requesting out-of-scope data via
  cleverly-phrased questions. Prompt-injection-style attempts (a saved report's own summary text,
  or a support ticket's body, being later fed back into a prompt as if it were an instruction) must
  be treated as data, never as instructions — the same discipline this session applies to any
  external content it reads.
- **Financial/PII leakage through report sharing.** Mitigated by the re-authorization-on-view rule
  in §11 — a saved report is not a permanent bypass, by design.
- **Provider cost/availability.** The usage-limit field in §3 and the "safe disabled state" in §9
  bound both.
- **Tenant Admin over-granting sources.** Mitigated by requiring Super-Admin-delegated permission
  before an Admin can touch the financial/sensitive category at all (§1/§5), not just a warning
  dialog.
- **Migration cost of a wrong early data model.** Phase 1 (§15) deliberately ships no AI-facing
  behavior — only the registry and permission plumbing — so the highest-risk architectural
  decisions (source list shape, scope model) get validated before any user-visible surface exists
  to migrate away from.

---

*No implementation occurred as part of producing this document. `git status` on `main` remains
clean; no migration, route, or permission file was created or modified.*
