# Sanad 16.2.0-consultations-pilot — internal candidate

Base: Sanad-v16.1.2-Portable-Windows-final.zip. Original archive not modified. This candidate has not been sent to the user, per their request.

## Data preservation and test fixtures

The base archive's main data/sanad.db contained no tables. The working main database was restored from its included backups/pre-v16/sanad.db using SQLite backup with WAL recovery; it contained 38 staff accounts and 80 requests. Three existing tenant databases also contained 38 accounts each. Existing user IDs, usernames, display/legal names and password hashes were compared before/after fixture generation and remain unchanged. No reset of staff credentials was performed.

Each of the four databases now has 82 additional requests, one for every active service, marked is_demo and PILOT-SVC-*; there are additive demo customers, companies, branches, case/agenda, treasury, payroll, performance, support and reporting examples. Existing complete-demo generator enriches demo records only. It must be run only in a separate Pilot data copy. Demo payroll entries are examples, not evidence of new payroll business logic.

Two eligible tenants have five new bookings each: unassigned, assigned, completed and cancelled examples, plus nine free slots. Each booking links a native request, an agenda event, local notification/history, fee invoice and a small actual PNG attachment. Completed examples have a simulated cash payment. Suspended tenant stays suspended and has no booking fixtures. Original employees are reused without renaming them. Re-running the generator added zero duplicate service requests.

Client test account on each database: pilot.bookings@example.test / Pilot@Test2026. Staff credentials remain those of the base version. Automated isolated tests use adam / 1234 and khaled,mona / demo1234 from the existing disposable test harness.

## Added behavior

- Dedicated header/home consultations and Book Appointment links; editable home section content/order/visibility.
- Public eligible-provider listing: approved application, active/trial, valid start/end, public visibility, consultations+agenda entitlement, and enabled booking reception.
- Tenant customer booking with real services, consultation modes, offered start/end slots, request/document links, own bookings and invoice.
- Office appointment queue and scoped employee detail, manager assignment/reassignment, reschedule, cancel, edit and closure.
- Atomic booking writes, slot reservation uniqueness, customer/employee overlap checks, inactive/assignment-locked employee rejection and optimistic version checks.
- Employee agenda synchronization, native request assignment, reassignment revocation, local notices to old/new employees and customer, immutable before/after assignment history and audit.
- Company/branch link validates ownership and synchronizes native request and agenda company.
- Fee invoice snapshots with native request payments. Original fee/payment functions remain available; if later fee adjustments differ, invoice displays a notice that it is the amount at issue time.
- Backend permissions bookings.manage, agenda permissions and module gates. Tenant databases remain separately scoped.

## Migrations / files

051_consultation_bookings.js: consultation modes, slots, bookings, reservation index, history, client notifications and notifications booking FK.
052_booking_billing_content.js: booking invoices and editable home section/content.
platform/db.js: existing idempotent central schema updater adds booking_origin and booking_accepting.

New: lib/bookings.js, lib/booking-invoices.js, routes/bookings.js, routes/admin/bookings.js, views/public/booking_*.ejs, views/admin/booking*.ejs, booking-test.js, pilot-fixtures.js.
Integrated: server.js, routes/admin/index.js, routes/admin/agenda.js, lib/permissions.js, lib/entitlements.js, platform/db.js, views/partials/header.ejs, views/partials/admin_nav.ejs, public home/consultations and admin notifications views. package.json/package-lock.json version updated. Complete exact archive comparison is in pilot-evidence/changed-files.json.

## Validation

HTTP/database tests against two simultaneously running real app instances and separate tenant databases: 48 passed, zero failed. Includes booking, customer views, assignment, employee scope/calendar/notifications, locked/busy/missing employee rejection, duplicate reservation, stale version, edit, reassign, reschedule, audit, agenda mutation guard, company/branch validation, native fees/payment, invoice issuance/idempotency, completion/cancellation, cross-tenant read/write/session/upload/invoice checks, disabled reception, expired and suspended tenant rejection.

Existing suites run in a disposable project copy to protect user data: main 969/0, integration 74/0, edge 178/0, security 138/0. P0 SaaS controls 17/0. Total 1,424 successful assertions, zero failed in final captured runs. Core regression was run before the final targeted booking fixes; those fixes were covered by the final booking suite. All new EJS templates compile.

Four database integrity checks: ok; foreign_key_check empty. Staff identity equality verified four times per seed run. Evidence logs included.

## Not yet verified / Pilot limits

- Browser visual/responsive validation blocked: Chromium absent and browser download timed out. Browser script retained; no screenshots or visual pass claimed.
- Email/SMS/WhatsApp provider delivery, online payment gateway, external signature services not live-tested. Internal database notifications and recorded native cash payment are verified. A WhatsApp consultation type is not an integration or automatic meeting call.
- Tests establish covered scenarios, not a full penetration test of every existing route or a production-readiness certification.
- Offered slots currently reserve one customer per slot; times explicitly UTC. No automated resource capacity or timezone conversion UI.
- Printed invoices are fee snapshots, not certified jurisdictional e-invoices. Later native adjustments remain possible with a visible discrepancy notice; no new tax compliance claim.
- Customer login is per tenant. Central site lets customer choose a provider, then sign in to that provider's existing customer portal.
- New fixtures cover available database modules; this version has no standalone contracts table. No absent module is claimed to have been built.

## Running later, once the candidate is requested

Keep the original ZIP/data backup. Extract into a new directory. Install dependencies on the target OS (`npm ci`, using the project's supported Node engine); native SQLite dependencies must be installed on that machine. Set DATA_DIR and PLATFORM_DATA_DIR to the new copy's intended persistent folders, and use the base version's Windows startup instructions/launchers. Migrations apply automatically at server startup. Do not run demo reset against user data.

Main public routes: /consultations, /appointments. Tenant customer: /appointments, /appointments/mine. Office admin: /office-panel/appointments; original custom ADMIN_PATH still applies. Calendar: /office-panel/agenda. Native request: /office-panel/requests/:id. Central owner controls remain original platform controls; provider origin configured from owner's appointments screen, office reception from tenant appointments screen.

Demo tenant ports in base data: Nile 4201, Horizon 4202, Gateway 4203 (suspended). Demo booking origins localhost only; configure actual HTTPS origins before staging. Use tenant launcher so each office has its own session secret/license. Direct manual preview without the tenant launcher uses development defaults and is not deployment configuration.

Test commands: npm run test:bookings; npm run test:p0. Existing npm run test:all should run only in a disposable project copy because legacy test.js touches the app-local data path. Optional fixture generation: SANAD_PILOT_FIXTURES=1 with explicitly separate DATA_DIR/PLATFORM_DATA_DIR and TENANT_ID as appropriate; it preserves accounts but adds/enriches test records.
