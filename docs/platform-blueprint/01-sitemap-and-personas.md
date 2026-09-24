# 01 — Complete Site Map & User Personas/Journeys

Synthesized from every route file read across this extraction. Full
per-module detail lives in the numbered documents this map cross-
references — this document is the navigational index plus the
persona-by-persona journey view.

## Site map by audience

### PUBLIC WEBSITE (unauthenticated, `routes/public.js` + satellite routers)

| Screen | Route | Purpose | Detail |
|---|---|---|---|
| Homepage | `GET /` | Hybrid static/CMS landing page | `02-public-website-blueprint.md` |
| Audience-sector page | `GET /p/:slug` | Catalogue "page" landing | `02`, `03` |
| Services browse/search | `GET /services`, `GET /services/:id` | Category listing/detail | `02`, `03` |
| Consultations | `GET /consultations` | `is_consultation=1` services | `02`, `07` |
| Request a service | `GET/POST /request` | Guest/client multi-service submission | `03` |
| Request success | `GET /request/success/:ref` | Confirmation + upload link | `03` |
| Contact | `GET /contact` | Office contact info | `02` |
| About, FAQ, Guides | `GET /about`, `/faq`, `/guides` | Hardcoded content, no CMS | `02` |
| Language switch | `GET /lang/:lang` | Session-scoped ar/en toggle | `02` |
| Track a request | `GET/POST /track`, `GET /track/:id` | Guest ref+phone tracking | `03` |
| Upload documents | `GET/POST /upload/:id` | Token/session-gated upload | `03`, `10` |
| Unified login | `GET/POST /login` | Staff + client single form | `05` |
| Appointment/consultation booking | `GET/POST /appointments/*` | Gated by `booking_enabled` | `07` |
| Support ticket (guest/client) | `GET/POST /support` | Separate from legal requests | `12` |

### CLIENT PORTAL (`routes/portal.js`, authenticated client session)

| Screen | Route | Purpose | Detail |
|---|---|---|---|
| Register/verify | `POST /portal/register`, `GET /portal/verify` | Token-based, not OTP | `07` |
| Google login | `GET /portal/google(/callback)` | OAuth | `07` |
| My requests | `GET /portal` (list) | Own requests only | `07` |
| Request detail | `GET /portal/requests/:id` | Curated client-safe slice only | `03`, `07` |
| My bookings | `GET /appointments/mine(/:id)(/invoice)` | Own appointments | `07` |
| My support tickets | `GET /support/my(/:id)` | Reply, rate, reopen within window | `12` |
| Password reset | shared flow | Token-based | `05` |

### OFFICE/COMPANY PANEL (`routes/admin/*`, mounted at configurable `ADMIN_PATH`)

All screens below are gated by `can(permission)` — the **same route tree
serves every staff role**; what a given person sees/can do is entirely a
function of their resolved permission set (`05-roles-permissions-
security.md`), not a separate route tree per role. Listed once, with the
relevant permission and cross-reference.

| Screen | Route (relative to ADMIN_PATH) | Permission | Detail |
|---|---|---|---|
| Dashboard | `GET /` | (any authenticated staff) | — |
| Requests list/detail/new/print | `/requests*` | `requests.*` | `03` |
| Cases list/detail/report | `/cases*` | `cases.*` | `08` |
| Clients directory/file | `/clients*` | `clients.*` | `07` |
| Companies list/detail | `/companies*` | `clients.directory/edit` | `04` |
| Employees list/profile/access-card | `/users*` | `users.*` | `06` |
| Permissions editor | `/users/:id/permissions` | `users.manage` | `05` |
| Treasury | `/treasury*` | `treasury.*` | `09` |
| Revenue | `/revenue*` | `revenue.*`, `money.*` | `09` |
| Expenses, custody | `/expenses*`, `/my-custodies*` | `expenses.*`, `custody.*` | `09` |
| Payroll | `/payroll*` | `payroll.*` | `09` |
| Performance reviews | `/performance*` | `performance.*` | `09` |
| Report profiles (letterhead identity) | `/report-profiles*` | `report_profiles.manage` | `09`, `14` |
| Agenda/calendar | `/agenda*` | `agenda.*` | `12` |
| Bookings management | `/appointments*` (admin side) | `bookings.manage` | `07` |
| Errands/trips | `/errands*` | `errands.*` | — |
| Renewals dashboard | `/renewals*` | `renewals.*` | `03` |
| Support tickets (staff side) | `/support*` (admin) | `support.*` | `12` |
| Content/CMS: pages/categories/services | `/content*` | `content.manage` | `02`, `03` |
| Homepage editor | `/homepage*` | `content.manage` | `02` |
| Social links | `/social*` | `social.manage` | `02` |
| Contacts | `/contacts*` | `contacts.manage` | `02` |
| Settings (site/mail/AI/backup/branches/protection) | `/settings*` | `settings.manage` (+ `content_protection.manage` for its tab) | `10`, `11`, `12` |
| Data imports | `/imports*` | `imports.manage` | `03` |
| Security (login history/devices) | `/security*` | `security.view` | `05`, `06` |
| Activity log | `/activity` | `activity.view` | `05` |
| Trash/recycle bin | `/trash` | `trash.restore` | `12` |
| AI chat | `/ai*` | `ai.canUse()` (role + office toggle) | `11` |
| Account / profile completion | `/account`, `/profile` | (self) | `06` |

### SUPER ADMIN — no separate screens, a tier not a route tree

Super Admin (`role='admin' AND is_super_admin=1`) uses the **same admin
panel routes** as a regular admin, with two differences: (1) every
permission check passes unconditionally, and (2) a small number of
routes explicitly require the Super Admin tier — deactivating/editing
another Super Admin, promoting/demoting the `is_super_admin` flag, and
the full-scope (`GET /admin/settings/backup/full`) backup download. Full
detail: `05-roles-permissions-security.md`.

### AUTHENTICATION

| Screen | Route | Notes |
|---|---|---|
| Staff login (full-featured) | `{ADMIN_PATH}/login` | `routes/admin/auth.js` — throttle, device tracking, new-device alert |
| Unified public login | `/login` | Staff-or-client, throttled, no device-tracking alert (gap, see `05`) |
| Forgot/reset password | `{ADMIN_PATH}/forgot`, `/reset` + portal equivalents | Shared token mechanism |
| Client portal register/verify/Google | `/portal/*` | See above |
| Forced password change | `/account?force=1` | Redirect target when `must_change_password` |
| Cross-tenant SSO consumption | `GET /platform-owner-access` | Platform-owner support access, one-use signed token |

### SYSTEM / UTILITY ROUTES

| Route | Purpose |
|---|---|
| `GET /files/:fileId` | The one gateway serving uploaded document bytes |
| `GET /support-files/:filename` | Support-ticket attachment gateway (correctly honors `internal` flag) |
| `GET /admin/settings/backup/:scope`, `/backup/branch/:id` | Backup/export downloads |
| `POST /admin/settings/restore` | Restore scheduling |
| `GET /admin/*` (literal, not ADMIN_PATH) | Plain 404 — hides the real admin path if changed from default |
| 400/403/404/413/500/csrf/subscription error views | Shared across public/admin/portal |

## User personas & journeys

For each persona: entry, authentication, dashboard, available modules,
primary actions, approvals, notifications, document access, financial
visibility, reports, exit.

### Anonymous visitor

- **Entry**: any public URL. **Auth**: none. **Dashboard**: none — public
  homepage.
- **Modules**: browse catalogue, read about/faq/guides, submit a request,
  book an appointment (if enabled), track a request by ref+phone, open a
  support ticket, upload documents via a token link.
- **Actions**: submit request/booking/support ticket, track, upload.
- **Approvals**: none available to them.
- **Notifications**: receives email confirmations if an address was given
  (best-effort, depends on mail provider being configured).
- **Document access**: only via a valid upload token or their own
  session-tracked request.
- **Financial visibility**: none.
- **Exit**: request submitted → tracking link / upsell to create an
  account.

### Prospective customer → registered individual client

- **Entry**: same as visitor, converts via `/portal/register` or Google
  OAuth, or is auto-created as a guest-account shell via a guest booking.
- **Auth**: email/password or Google; email verification if mail is
  configured (auto-skipped otherwise, `07-client-engine-appointments.md`).
- **Dashboard**: `/portal` — own requests list.
- **Modules**: requests (curated view), bookings, support tickets,
  document upload/view for own requests.
- **Actions**: upload documents, reply to support tickets, reschedule/
  cancel own bookings, rate closed support tickets, resend verification.
- **Approvals**: none granted to them — client actions are requests, not
  approvals.
- **Notifications**: email (verification, requirement-added, request-
  completed) + in-app `booking_client_notifications` feed for bookings.
- **Document access**: own request's documents (subject to the
  `documents.internal` gap noted in `03-services-and-request-engine.md`),
  never another client's.
- **Financial visibility**: `total_amount`/`paid_amount`/remaining
  summary only — never the itemized payment ledger.
- **Exit**: request completed → completion email; can always return via
  login.

### Company client (representative)

- Same underlying `clients` account mechanism as an individual — the
  corporate relationship is expressed via `requests.company_id`/
  `branch_id` (staff-set) and `company_contacts` (a named representative
  record, distinct from the client's own login). See
  `04-company-branch-tenant-model.md`. There is **no separate
  company-branded portal login** — a representative logs in exactly like
  an individual client.

### Office employee / lawyer

- **Entry**: `{ADMIN_PATH}/login`. **Auth**: username/password,
  device-tracked, geolocation-captured. Forced password change + profile
  completion on first login (`06-hr-employee-engine.md`).
- **Dashboard**: admin dashboard, scoped to their own assigned work
  (`requests.view_all` absent by default for `lawyer` role — "a lawyer
  sees their own files").
- **Modules**: their assigned requests, cases they're on, agenda, errands,
  support (view/create/reply), expenses they add, custody they draw
  against.
- **Actions**: update request status, add comments/documents, add
  colleagues to their own requests (`canAssign` without the ability, but
  never remove — `canUnassign` requires it), log case hearings/tasks,
  file expenses, receive/spend/return custody.
- **Approvals**: none of the financial-approval kind (no `money.fees`,
  `treasury.manage`, `custody.approve` by default).
- **Notifications**: in-app only for their assigned work; explicitly
  **excluded** from new-request broadcast (only supervisors/admins get
  that) and from payment notifications.
- **Document access**: only requests they're assigned to.
- **Financial visibility**: **none by default** — no `money.view`, so
  amounts are redacted even in the activity trail of requests they can
  otherwise see (`05-roles-permissions-security.md`'s money-redaction
  mechanism).
- **Reports**: none by default (no `.export` abilities).
- **Exit**: deactivation triggers a mandatory work-handover flow if they
  have open assigned requests (`06`).

### Accountant

- **Entry/Auth**: same as any staff.
- **Dashboard**: finance-oriented — no `requests.edit`/`cases.edit` by
  default.
- **Modules**: treasury, revenue, expenses (view_all/export), custody
  (approve/disburse/review_expense/close/export), performance, payroll
  (view_all/manage/pay/export).
- **Actions**: approve/reject treasury withdrawals requiring approval,
  disburse/approve custody, run/approve/pay payroll (subject to the
  separation-of-duties rule: a run's own creator can't approve it unless
  they also hold `settings.manage`).
- **Approvals**: the financial-approval role — custody, treasury
  withdrawals, payroll runs.
- **Notifications**: **includes** payment/payment-complete/payment-void
  notifications (explicitly opted in, unlike lawyers).
- **Document access**: payment receipts, custody attachments — not
  general request document management (no `documents.manage` by
  default).
- **Financial visibility**: full — this is the role built for it.
- **Reports**: revenue/treasury/expenses/payroll/custody exports.
- **Exit**: same deactivation/handover mechanism as any staff.

### Supervisor / management

- **Entry/Auth**: same as any staff.
- **Dashboard**: broad operational view — `requests.view_all`,
  `cases.view_all`, most money/expense/client/agenda/support abilities by
  default, plus `activity.view`/`security.view`/`trash.restore`.
- **Modules**: nearly everything except `users.manage`, `settings.manage`,
  and the `erase` group.
- **Actions**: assign/unassign requests, archive, moderate comments,
  approve custody-adjacent actions where granted, manage support tickets.
- **Approvals**: broad operational approvals, not the admin-tier
  account-management ones.
- **Notifications**: base audience for nearly every trigger (new
  request, status change, unclaimed-request alert, etc. — see `12`).
- **Document access**: broad, via `requests.view_all`.
- **Financial visibility**: `money.view` and related abilities by
  default — full financial visibility, same as accountant, plus
  operational breadth accountant lacks.
- **Reports**: most `.export` abilities by default.
- **Exit**: same mechanism as any staff.

### Restricted admin (regular `role='admin'`, not Super Admin)

- Everything except the `erase` group by role default, but **cannot**
  manage or view another admin/Super-Admin's account beyond what the
  delegation-ceiling rules allow, and cannot edit their own role or the
  `is_super_admin` flag. Can have specific abilities individually revoked
  by a Super Admin (the mechanism this platform's Checkpoint-2 work
  demonstrated live — see the session's earlier work on the `sara.admin`
  restricted-admin demo account).

### Super Admin / platform owner (within one deployment)

- Unconditional access — every `can()` check passes, no permission list
  to edit. Uniquely able to: manage other admin accounts' roles/tiers,
  promote/demote Super Admin status (subject to the last-one-standing
  guard), and download a full-scope (office + platform) backup. See
  `05-roles-permissions-security.md` for the complete anti-lockout
  mechanism.
- The **central-platform owner** (a different, external persona — the
  company running Sanad-as-a-product across many tenant deployments)
  interacts via the separate `/platform-owner-access` SSO route, not a
  role inside any single tenant's `users` table — see
  `04-company-branch-tenant-model.md`.

## End-to-end sequence flows

### Guest request → completion (the core commercial journey)

```
Visitor discovers service (browse or search)
  → submits /request (guest, no account required)
  → ref + upload_token generated, confirmation email + office alert sent
  → staff reviews, may add requirements (client notified, status → awaiting_docs)
  → guest uploads via token link (or registers to gain portal access)
  → staff assigns to a lawyer (canAssign)
  → staff adds fee_items, requests.total_amount recalculated
  → client/guest pays (payments row recorded, recalc'd into paid_amount)
  → status manually progressed: reviewing → in_progress → (awaiting_payment if needed)
  → staff marks completed (requires: zero open todos, ≥1 document, a completion_summary)
  → completion email sent; request archived later, erased only after that (two-step guard)
```

### Guest booking/appointment → billed consultation

```
Visitor picks a slot on /appointments
  → bookingClient() matches or creates a client record (guest, unverified)
  → create() atomically inserts: requests row + agenda_events row + bookings row
  → staff/system assigns an available employee (mirrors into request_assignees + agenda)
  → employee completes the consultation (status → completed, requires an assignee)
  → staff issues a booking invoice (lib/booking-invoices.js, idempotent)
  → client views invoice at /appointments/mine/:id/invoice
```

### Request promoted to a legal case

```
An intake request already exists and is being actively worked
  → staff explicitly promotes it: POST /cases/from-request/:requestId
  → legal_cases row created (1:1, unique on request_id); existing request
    assignees copied over as the initial case team
  → case moves through preparation → filed → active → judgment → enforcement
    (or suspended/closed), hearings/tasks/events logged along the way
  → fees remain on the parent request throughout — the case module never
    bills independently
```

### Employee onboarding

```
Admin creates account: username + password + role only (POST /users/new)
  → tenantPolicy.allowance('users',1) checked against license cap
  → office_branch_id resolved (submitted -> admin's own -> main branch)
  → must_change_password=1, profile_completed=0
  → admin issues an access card (fresh temp password, all sessions killed)
    and distributes it via print/email/SMS/QR
  → employee logs in, forced through /account?force=1 to set a real
    password and complete their profile (legal_name, national_id,
    birth_date, ID photos if required)
  → profile_completed flips true once every required field is filled
```

### Employee offboarding

```
Admin clicks deactivate (POST /users/:id/toggle)
  → self-deactivation blocked; cross-tier and last-admin/last-Super-Admin
    guards checked (05-roles-permissions-security.md)
  → if the employee has open assigned requests: redirected to a handover
    screen instead of proceeding
  → admin reassigns each open item to a named active colleague, or
    explicitly records "leave as is" (audit-logged either way)
  → active=0, deactivated_at stamped, every session for that user killed
```
