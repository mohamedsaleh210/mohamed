# 03 — Services Catalogue & Request Workflow Engine

Source: `routes/admin/requests.js` (1573 lines, full), `lib/comments.js`
(full), `lib/access.js` (full), `lib/payments.js`, `db/catalogue.js`, and
migrations `001_baseline.js` through `046_support_scoring_treasury.js`
(requests-table evolution), `031_multi_service.js`, `030_pages.js`.

## Catalogue structure: pages → categories → services

`pages` (audience-sector landing page: slug, name/tagline/intro bilingual,
colour, icon, `is_default`, `show_in_menu`) → `categories` (per page) →
`services` (per category: title/body bilingual, `is_consultation`,
`active`, `home_pinned`/`home_pinned_sort`). `request_services` is a join
table (migration 031) so **one request can carry several services** (e.g.
a company-formation job = deed + registry + tax card as one file, one fee
set) — `requests.is_custom` flags a free-text request with no picked
service.

`db/catalogue.js` is **seed data only**, consumed once by `db/seed.js` on
a fresh install — editing it has zero effect on an existing database. This
is the correct place to swap in a new company's starter catalogue. **Tag
D** for the swap point, **tag A** for the pages→categories→services
shape itself.

**Flagged for exclusion from any white-label starting point**: migration
`044_gerwani_services_and_renewals.js` seeds a dedicated
"gerwani-company-services" page + ~30 named services for one specific
Sanad client engagement, explicitly excluded from the public nav menu in
`middleware/locals.js`. This is client-instance data, not platform seed.

## Request lifecycle

### Creation paths (all insert into `requests`)

| Path | Source value | Notes |
|---|---|---|
| Public website, guest | `'website'` | `routes/public.js POST /request`; auto-linked to a session client if logged in; generates `ref` + `upload_token` |
| Admin/office, on behalf of a caller | `'office'` | `routes/admin/requests.js`; supports person or company party type; `opened_by` = staff name |
| Bulk import | `'office'` | `lib/data-import.js`, two-phase preview→commit |
| Booking | (consultation/appointment) | `lib/bookings.js create()` — see `07-client-engine-appointments.md` |

**No client-portal creation route** — clients create requests via the
public form (auto-linked by session) or office intake; the portal only
lists/views existing requests.

Every subscription-gated creation point checks
`tenantPolicy.allowance('requests', 1)` — 402 + subscription-error view if
the deployment's license quota is exceeded (see
`04-company-branch-tenant-model.md`).

### Status values (verbatim, `lib/i18n.js STATUS`, tag C — bilingual labels are a market choice, the state machine shape is tag A)

`new` (DB default) → `reviewing` → `in_progress` → `awaiting_docs` →
`awaiting_payment` → `completed` / `cancelled`.

**No formal transition table** — `POST /:id/update` allows any status to
any other status directly, gated only by request visibility (not a
specific permission — any staff who can see the request can change its
status). Special rules layered on top:

- Moving **to `completed`** requires: zero incomplete `todos`, at least
  one `document` row, and a non-empty `completion_summary` text —
  otherwise redirected back with an explicit "completion requirements not
  met" message. `completed_at` is set once (never overwritten).
- **Reopening** a completed request (moving status away from `completed`)
  increments `reopened_count` and stamps `last_reopened_at`.
- **Automatic transitions** (not user-initiated): adding a `requirement`
  auto-sets status to `awaiting_docs` (unless already completed/cancelled)
  and emails the client what's missing; toggling the last pending
  requirement to "received" auto-reverts status to `in_progress`.
- No dedicated "cancel" business rule — plain status change to
  `cancelled`, no confirmation or reason required (unlike archive/erase,
  which do).

### Pricing — fee line items, not a formal quotation object

`fee_items(request_id, label, amount, sort)` — `requests.total_amount` is
**always derived** (`recalcTotal()` sums fee_items and writes it back;
never directly form-editable). `discount`/`discount_reason` and
`written_off`/`write_off_reason` are separate, distinct concepts (a
discount reduces what's billed; a write-off marks an uncollectable balance
as such while staying visible as "owed but abandoned," reversible via a
`clear` flag) — both gated in `routes/admin/revenue.js`, not this file.

**No formal down-payment/installment-plan entity.** Payments are a
flexible ledger (`payments` table, one row per payment received) — staged
payments are simply multiple rows against one request. `lib/payments.js
balanceFor()`: `due = max(0, billed − discount − writtenOff)`, `remaining
= due − paid`.

**Honest gap for a white-label blueprint expecting a richer sales
pipeline**: there is no "quote → approval → accepted → invoice" state
machine here (contrast the Postgres reference schema in
`13-database-erd.md`, which sketches exactly this as an unimplemented
target). What exists today is flatter: fee line items + a status string +
a payment ledger.

### Assignment — many-to-many, asymmetric permissions

`request_assignees(request_id, user_id, assigned_by)`, no cap. `canAssign`
= `requests.assign` ability **OR** `role==='lawyer'` (a lawyer can always
add a colleague to their own file). `canUnassign` = `requests.assign`
**only** (deliberately asymmetric — "so lawyers cannot drop each other").
No dedicated "reassign" endpoint — it's unassign + assign, each separately
audited. `request_assignee_shares` lets assignees split revenue-credit
percentages (validated to sum to 100%).

### Comments — staff-only by construction

`lib/comments.js`: a max-2-level thread (deeper replies are re-parented
to the root, expressed as @mentions in body text instead of nesting
further). Soft-delete keeps the text, struck-through ("hiding what was
said would defeat the purpose"), restorable by the author or an
admin/supervisor. **There is no client-visible comment/reply channel** —
`comments` rows carry no client-visible flag, and both `routes/portal.js`
and `routes/track.js` explicitly exclude the `comments` table from their
queries. Client-facing communication flows instead through the
`requirements` checklist (below), system emails, and the separate
support-ticket system (`12-notifications-settings.md`).

### Requirements — the one client-visible internal list

`requirements(request_id, title, status ∈ {pending, received})` — this is
explicitly, per the migration's own comment, "the only internal list a
client is shown," surfaced on the upload page and portal/track views as
"outstanding requirements." Toggling status emails the client and drives
the automatic status transitions above.

### Visibility — the real access boundary (cross-reference `05-roles-permissions-security.md`)

`lib/access.js visibleRequestFilter(user)`: users with `requests.view_all`
see everything; otherwise SQL-restricted to requests they're personally
assigned to via `request_assignees`. `canSeeRequest`, `canSeePayments`
(`money.view`), `canEditFees` (`money.fees`), `canAddExpense` (requires
both the ability and visibility on that specific request) all live here as
the single reusable primitive.

### Critical/urgent flag, time pauses

`POST /:id/critical` — boolean with a mandatory ≥5-char reason, triggers a
critical-priority notification. `request_time_pauses` — staff can log an
SLA-clock pause with a reason from a fixed enum (awaiting_documents,
awaiting_payment, government, manager_approval, administrative) + optional
proof upload, requiring approval unless the submitter already holds
`requests.assign`.

### Closure — a deliberate three-tier lifecycle

`archive` (toggles `archived_at`, data stays fully intact — "money still
counts toward revenue") → **only then** can `erase` (`requests.erase`
ability, permanently deletes, requires typing the exact ref + a ≥5-char
reason) happen. This "archive first, erase only what's already archived"
two-step guard prevents accidental permanent deletion of live work. Erase
cascades file deletion + FK nulling across every related table in one
transaction, and notifies all admins with the amount that was outstanding.

### Documents (cross-reference `10-documents-backup-export.md`)

Every request's documents live in `documents`/`document_files`, served
only through the authorization-checked `GET /files/:fileId` route.

### Print/export

`GET /:id/print` — a browser-printable page (not a server-generated PDF;
the code comment explains this is deliberate, since server-side PDF
libraries "famously do not" handle Arabic RTL shaping correctly — the
browser's own Save-as-PDF is relied on instead). Full CSV/print list
export via `lib/reporting.js`, gated `requests.export`.

## Tracking (guest, no account)

`routes/track.js` — requires **both** a reference number and the phone on
file (not ref alone, deliberately — a comment notes refs alone were judged
too easy to overhear/forward). Identical error message for "not found" and
"phone mismatch" to prevent enumeration. Rate-limited in-memory per-IP (12
attempts/15 min — process-local, resets on restart, worth noting for a
multi-instance white-label deployment). Shows the same client-safe slice
as the portal (requirements + documents only, no comments/fees/audit
trail) — including the same `documents.internal`-flag gap noted below.

## Bulk data import/export

`lib/data-import.js` — two-phase preview→commit Excel import for
`requests`, `cases`, `agenda`, `clients`, `companies`, `branches`,
`employees` (2000-row cap). Generates a styled, RTL, data-validated `.xlsx`
template with live system values in dropdowns; **system-generated fields
(request refs, case file numbers) are always blanked on input and
regenerated at commit**, never trusted from the file. Full re-validation
happens again at commit time (not just preview), and a batch either
commits entirely inside one transaction or leaves nothing written — reject
rows are never partially applied. Imported employees get a
`suggestTemporary()` password, returned once in plaintext to the admin for
distribution, never stored or re-derivable afterward.

## A real gap worth flagging: the `documents.internal` flag is inconsistently enforced

`documents.internal` (staff-only document flag) is checked correctly in
`routes/support-files.js` (support-ticket attachments) but is **not**
checked in `routes/files.js` (the main request-document gateway) or in the
portal/track queries — a client who owns a request can currently fetch a
file belonging to a document marked internal. This is an actual gap in
the current implementation, not an intentional design choice, and should
be fixed in any white-label rebuild rather than carried forward silently.
