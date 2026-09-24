# 07 — Client Engine & Appointments/Consultations

Source: `routes/portal.js` (493 lines, full), `lib/bookings.js` (full),
`routes/bookings.js`, `routes/admin/bookings.js`, `lib/booking-invoices.js`,
`lib/google.js`, migrations `005_clients_assignment_comments.js`,
`051_consultation_bookings.js`, `052_booking_billing_content.js`.

## Client engine

### Individual vs. corporate — the distinction lives on the request, not the client

`clients(id, email UNIQUE, password_hash, google_id UNIQUE, full_name,
phone, relation DEFAULT 'self', beneficiary_name, email_verified,
verify_token, lang, office_branch_id)` — **no company/representative
field exists on this table at all.** Individual vs. corporate is decided
entirely by whether a given `requests` row carries a `company_id`/
`branch_id` (see `04-company-branch-tenant-model.md`). There is no
company-login / company-representative portal account — the client portal
is strictly individual-account-based.

### The "representative" concept

`relation` (enum: `self`, `guardian`, `agent`, `relative`, `other`) +
`beneficiary_name` — the mechanism by which one logged-in person acts on
behalf of someone else (a guardian filing for a minor, an agent under
power of attorney). This is Sanad's actual "representative" feature for
individual clients — distinct from `company_contacts` (the corporate
equivalent, see `04-company-branch-tenant-model.md`). **Tag A/D.**

### Registration & verification

`POST /portal/register` requires email/full_name/phone; password strength
enforced via the shared `lib/password.js` policy. **Verification is
token-based, not OTP** (confirmed: zero OTP references anywhere in the
codebase) — `verify_token` = 24 random bytes, single-use, cleared on
success via `GET /portal/verify?token=`. If no mail provider is
configured (`mailer.isLive()` false), registration **auto-clears the
verify_token** rather than asking for a confirmation that could never
arrive — a genuinely good honesty-over-friction design choice worth
keeping. Google OAuth login (`lib/google.js`, CSRF-protected via a session
`state` nonce) auto-verifies email. **Tag G** for the Google dependency,
**tag A** for the honest-fallback mechanism.

**Auto-linking**: every login *and* every registration re-runs
`linkGuestRequests` — any prior guest request matching the account's email
is attached (`client_id` set) automatically. A guest who ordered without
an account and later signs up recovers their full history for free.

### Guest → client creation (from a guest booking)

`lib/bookings.js` `bookingClient()`: matches an existing client by
email-or-phone first (email match preferred); if none found, creates a
`clients` row with `email_verified=0` and a **random, never-communicated
password hash** — the guest gets an account shell that anchors their
history for later recovery via password reset or Google sign-in, but
can't be logged into directly yet. **Tag A**, a clean pattern for any
guest-checkout-style flow.

### What the client portal deliberately shows and hides

`GET /portal/requests/:id` — narrow by design. Shows `requirements`
(client-facing checklist), `documents`/`document_files`, and, if the
request became a legal case, **only** the `client_visible=1` slices of
`case_hearings`/`case_tasks`/`case_events`. Code comment: "Internal
comments, todos and the audit trail are never queried here at all." No
deep payment ledger — only `paid_amount`/`total_amount`/remaining are
surfaced, not individual payment rows. **Tag A** — this "client sees a
deliberately-curated slice, never the internal working view" pattern is
core platform DNA worth carrying into any white-label rebuild verbatim.

### Notification preferences

None exist — no opt-in/opt-out table or column on `clients`. Email sends
unconditionally when the mailer is live; in-app "updates"
(`booking_client_notifications`) are always written. **Gap, not a
feature** — flag for a white-label variant that needs preference controls.

## Appointments / Consultations (module B — optional)

Gated entirely by one setting, `booking_enabled` (default off) — the
whole public booking router 403s when disabled. **Tag B.**

### Schema shape

`consultation_modes` (5 seeded modes: written, notarized, phone, WhatsApp,
in-office — **tag F**, Sanad's specific list) → `booking_slots`
(admin-defined fixed time windows, not a recurring-availability rule
engine) → `bookings` (ref, client_id, slot_id, mode_id, `kind` ∈
{appointment, consultation}, service_id, **request_id UNIQUE**,
**agenda_event_id UNIQUE**, assigned_user_id, status ∈ {unassigned,
confirmed, completed, cancelled}, `version` for optimistic concurrency).
A partial unique index on `(slot_id) WHERE status IN
('unassigned','confirmed')` is the double-booking guard.

### The 1:1:1 pivot — every booking spawns a request AND an agenda event

`create()` inserts **three atomically linked rows**: a `requests` row (so
a booking is billable/trackable through the exact same fee/payment
machinery as any other request), an `agenda_events` row (so it appears on
the shared staff calendar — there is **no separate booking-only calendar
UI**; bookings surface inside the general agenda), and the `bookings` row
tying both together via unique FKs. **Tag A**, and a clean pattern: rather
than building a parallel scheduling+billing system, appointments are
modeled as "a request with a slot," reusing everything downstream.

### Consultation vs. appointment

Same `services` table, distinguished by `services.is_consultation` — a
`kind='consultation'` booking additionally requires a `mode_id` and the
picked service must itself be flagged `is_consultation=1`.

### Assignment = both a booking assignment AND a request assignment

Assigning an employee to a booking checks availability (active, not
`assign_locked`, no clashing `agenda_events`), then updates
`bookings.assigned_user_id` **and** mirrors onto `agenda_events` **and**
adds them to `request_assignees` (replacing any prior assignee) — one
action, three tables kept consistent.

### Client self-service is deliberately narrow

Logged-in clients can only `reschedule` or `cancel` their own bookings
(`asClient` action allow-list) — never self-assign, self-complete, or
edit notes. Guests get the same reschedule/cancel power via a
non-guessable `public_token` link (only ever generated for guest
bookings), no account required.

### Concurrency & audit

Every mutating action requires the caller's known `version` to match
current (409 on mismatch — "the appointment was updated, reload the
page") and a non-empty reason (≤500 chars) except for creation/assignment.
`booking_history` stores full before/after JSON per change — a
genuinely thorough audit trail for this specific module, beyond the
generic `audit_log`.

### Billing

`lib/booking-invoices.js` — one invoice per booking (idempotent),
`amount = requests.total_amount - requests.discount`, number
`'INV-'+ref`. This is the **only** place in the whole codebase that
produces something called an "invoice" as a first-class object (see
`09-financial-system.md` for why the main request-billing flow has no
equivalent invoice entity).

### No automated reminders

`agenda_events.reminder_minutes` exists as a column (default 1440) but is
**never read anywhere** after insert — a dead/reserved field. The only
scheduled background job touching requests/bookings is `lib/deadlines.js`
(request deadlines and unclaimed-request alerts — see
`12-notifications-settings.md`), which has nothing to do with appointment
reminders. **Honest gap, not a hidden feature** — a white-label build
wanting appointment reminders needs to build this.
