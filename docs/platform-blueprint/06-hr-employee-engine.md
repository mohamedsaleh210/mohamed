# 06 — Employee / HR Engine

Source: `routes/admin/users.js` (825 lines, full), `lib/profile.js` (full),
`lib/security.js`, `lib/custody.js`. **Tag A** (mechanism) throughout
unless noted.

## Employee profile

`users` table fields: `username, password_hash, role, display_name,
legal_name, job_title, email, phone, national_id, birth_date, photo,
id_front, id_back, active, must_change_password, profile_completed,
office_branch_id, is_super_admin, assign_locked/assign_lock_reason/
assign_lock_until, last_login_at/ip`.

**Deliberate creation-time minimalism**: an admin creating an account sets
*only* `username` + `password` + `role`. Everything else — legal name,
contact details, ID card — is filled in by the employee themselves on
first sign-in. Code comment: "An admin typing somebody else's national
number from memory is how records end up wrong." This is a genuine design
principle worth keeping in a white-label rebuild, not an accident.

`lib/profile.js` `missingFields(user)` defines what "complete" means:
`legal_name` (≥3 space-separated parts — "as on the ID card"),
`display_name`, valid `email`, `phone` (≥9 digits), `national_id`
(**exactly 14 digits — tag C, Egypt-specific**), `birth_date` (age 16–100),
and conditionally `id_front`/`id_back` scan images if
`staff_id_required` setting is on (admin-togglable, default on). This
whole validation shape is **tag C for the national_id format specifically**
— a non-Egyptian white-label deployment needs a different validator, not
just a config flag, since the 14-digit check is hardcoded.

## Employee login card / QR onboarding

A genuine, fully-built feature (`routes/admin/users.js` lines 454-648):

1. `POST /:id/access-card` — issues a fresh temp password
   (`Snd@######`-style), forces `must_change_password=1`, **kills all of
   that user's existing sessions** immediately (`DELETE FROM sessions
   WHERE data LIKE ...`), renders a printable card.
2. `GET /:id/access-card/qr` — fetches a QR image from the external public
   service `api.qrserver.com` encoding the tenant's own `/login` URL
   (7s timeout, fails soft — never breaks the rest of the card if
   unreachable). **Tag G** (external dependency).
3. Email/SMS/PDF distribution (`/access-card/email`, `/sms`, `/pdf`) —
   each re-validates the card is still the *current, unused* credential
   (`bcrypt.compareSync` against the live hash AND `must_change_password`
   still true) before sending, so a stale/already-used card can never be
   re-sent. PDF generation goes through the one hand-written binary-PDF
   builder in the codebase (`lib/access-card-pdf.js`) — no PDF library
   dependency.

## Deactivation with mandatory work handover

**Tag A, a genuinely important reusable pattern.** Deactivating a staff
member with open (unarchived, non-completed/cancelled) assigned requests
does **not** just deactivate them — it routes to a handover screen
(`GET /:id/handover`) first. Code comment explaining why this exists:
"Deactivating removed the person's access and left their requests assigned
to them — so the files looked handled while nobody could open them. The
office found out when a client rang." The admin must either reassign every
open item to a named active colleague (candidates ranked by current
workload, excluding anyone `assign_locked`) or explicitly choose "leave as
is" — both outcomes are audit-logged, so silence is never the default.
Deactivation also kills every active session for that user.

## Sessions/devices per employee

`lib/security.js`: `login_history` (per-login record, incl. geolocation
with an explicit status enum) and `known_devices` (coarse fingerprint —
device class/browser/OS, not precise tracking) power the employee-file
view's "recent logins" and "known devices" panels. A brand-new device for
a *staff* login triggers a critical-priority in-app alert to every other
active admin (see `05-roles-permissions-security.md`).

## Permissions (cross-reference)

Full detail in `05-roles-permissions-security.md`. Summary for this
document's purpose: `GET/POST /:id/permissions` shows a 3-state UI (role
default / added / removed) against the catalogue, with a delegation
ceiling for non-Super-Admin actors and an unconditional (nothing to edit)
state for Super Admin targets.

## Custody (HR-facing side)

Full detail in `09-financial-system.md`. From the HR angle:
`lib/custody.js` `employeeStatement(userId)` — a complete per-employee
statement (all custodies + their expenses + returns + rollup totals) is
what actually powers the employee-file page's financial section, and the
employee's own `/my-custodies` self-service view.

## Printable outputs

`GET /:id/print` — a clean two-section printable profile (basic info +
contact info only, no permissions/password data) via `lib/reporting.js`
`profileDoc()`. `GET /export.csv` / `GET /print` (list level) — staff
directory export, gated `users.export`.

## What's absent (honest gap notes)

- No leave-management / time-off tracking found anywhere in `users.js` or
  adjacent files.
- No formal "employee evaluation" beyond `performance_reviews` (covered in
  `09-financial-system.md` as a payroll-feeding mechanism, not a
  standalone HR review workflow with its own UI beyond bonus/deduction
  entry).
- No employment-contract document management (no dedicated
  "contract" entity — contract files, if any, would live as generic
  uploaded documents, not a first-class HR record).
