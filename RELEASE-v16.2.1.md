# Sanad v16.2.2 — Booking Link Fix & Custody Workflow

## What changed

- Public navigation now places Consultations and Book Appointment after About Us.
- Consultation entitlement, public visibility and appointment reception are now synchronized; existing approved tenants are repaired automatically on first start.
- The booking selector no longer excludes valid legacy tenants because of a stale application record.
- Guests can book without an account using name, mobile and email, then receive a high-entropy private tracking URL.
- Only active, approved, in-term and booking-enabled tenants remain eligible in the public provider list.
- Appointment administration now has statistics, search, status/type filters, an explicit unassigned queue, direct employee assignment, slots, settings and calendar navigation.
- Assignment still validates employee availability server-side and synchronizes the booking, request, calendar, notifications and audit history.
- Consultation content administration was removed from Business Management and labeled as consultation settings.
- Custody no longer produces a misleading error after saving; the missing notification dependency was fixed.
- Custody is now staged: create, approve, treasury disbursement, employee receipt confirmation, active balance, submitted expense review, return and audit events.
- Treasury is debited only during disbursement and credited when a return is accepted.
- Employees have a dedicated “My Custody & Expenses” page.
- Granular custody permissions were added to the existing permissions screen and are enforced by backend routes.
- Existing employee names and current data are retained. Migration 053 is additive and does not delete existing rows.

## New migration

`db/migrations/053_guest_booking_custody_workflow.js`

It adds private guest-booking tokens, custody workflow state/audit tables and expense-review fields. Existing custody and expense rows default to their prior active/approved meaning.

## Tests completed

- Core suite: 969 passed, 0 failed.
- Appointment E2E and two-tenant isolation: 48 passed, 0 failed.
- SaaS/P0 controls: 17 passed, 0 failed.
- Integration: 74 passed, 0 failed.
- Edge cases: completed successfully.
- Security: 138 passed, 0 failed.

External email/SMS/WhatsApp delivery was not live-tested because provider credentials are not configured; in-app notifications and the local outbox path were tested.

## Windows start

1. Extract to a short English-only path, for example `C:\\Sanad-v16.2.1`.
2. Use Node.js 20 LTS (recommended).
3. Run `npm install` on the Windows machine. Do not copy `node_modules` from another operating system.
4. Run `npm start`.
5. Open the URLs printed in the terminal. Existing login data remains in the included data directory.

Back up the `data` directory before first production use. On first start, the migration is applied transactionally.
