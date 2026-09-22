# Phase 3A — Complete Application Inventory (real routes, real views)

Baseline: `main` @ `534344e21833322ff551455878ff256bb2b62802`. Built by reading `routes/admin/index.js`'s
real mounts, `routes/public.js`, `routes/portal.js`, and the `MODULES`/`ROLE_DEFAULTS` tables in
`lib/entitlements.js`/`lib/permissions.js` — not assumed from the Phase 2 brief's category list.

Admin panel base path: `ADMIN_PATH` (env-configurable, default `/office-panel`).

## Public website (`routes/public.js`, `views/public/**`, no auth)

| Surface | Route(s) | View(s) |
|---|---|---|
| Homepage | `/` | `public/home.ejs` |
| Services list / category / detail | `/services`, `/services/:id` | `services.ejs`, `category.ejs` |
| Generic CMS page | `/p/:slug` | `page.ejs` |
| Service request form | `/request` | `request.ejs` |
| Consultations | `/consultations` | `consultations.ejs` |
| Public booking (guest) | `/appointments`, `/appointments/booking/:token`, `/appointments/mine[/:id]` | `booking_new.ejs`, `booking_detail.ejs`, `booking_list.ejs`, `booking_invoice.ejs`, `booking_error.ejs` (gated by `booking_enabled` setting) |
| Track a request | `/track`, `/track/:id` | `track.ejs`, `track_result.ejs` |
| Upload documents (token link) | `/upload/:token` | `upload.ejs`, `upload_gate.ejs` |
| About / Contact / FAQ / Guides | `/about`, `/contact`, `/faq`, `/guides` | matching `.ejs` |
| Unified login chooser | `/login` | `unified_login.ejs` |
| Success/confirmation | (various POST redirects) | `success.ejs` |

## Client portal (`routes/portal.js`, `views/portal/**`, client session)

| Surface | Route(s) | View(s) |
|---|---|---|
| Login/register/forgot/reset/verify | `/portal/login`, `/register`, `/forgot`, `/reset`, `/verified` | matching `.ejs` |
| My requests | `/portal` | `requests.ejs` |
| Request detail | `/portal/requests/:id` | `request_detail.ejs` |
| My support tickets | `/portal/support`, `/support/:id` | `support.ejs`, `support_detail.ejs` |
| My bookings | `/appointments/mine[/:id]` (shared with public, client-session-aware) | `public/booking_list.ejs`, `booking_detail.ejs` |

## Admin/platform dashboard shell (`routes/admin/index.js`, staff session)

| Surface | Route | View |
|---|---|---|
| Dashboard | `ADMIN_PATH/` | `admin/dashboard.ejs` |
| Login/forgot/reset | `ADMIN_PATH/login`, `/forgot`, `/reset` | matching `.ejs` |
| Notifications | `ADMIN_PATH/notifications` | `notifications.ejs` |
| Account / password / ID card | `ADMIN_PATH/account`, `/account/password` | `account.ejs`, `profile.ejs` |
| Access denied (in-app) | rendered inline on any blocked module | `denied.ejs` |

## Requests (`requireModule('requests')`, `requireStaff`)

| Surface | Route | View |
|---|---|---|
| List (+ search/status filter/pagination) | `ADMIN_PATH/requests` | `requests.ejs` |
| New (staff-entered) | `ADMIN_PATH/requests/new` | `request_new.ejs` |
| Detail | `ADMIN_PATH/requests/:id` | `request_detail.ejs` |
| Print | `ADMIN_PATH/requests/:id/print` | `request_print.ejs` (D — print) |

## Cases (`requireModule('cases')`)

| Surface | Route | View |
|---|---|---|
| List | `ADMIN_PATH/cases` | `cases.ejs` |
| Detail | `ADMIN_PATH/cases/:id` | `case_detail.ejs` |
| Report (print) | `ADMIN_PATH/cases/:id/report` | `case_report.ejs` (D — print) |

## Clients / Companies / Branches (`requireModule('clients')`)

| Surface | Route | View |
|---|---|---|
| Clients list / detail | `ADMIN_PATH/clients`, `/clients/:id` | `clients.ejs`, `client.ejs` |
| Companies list / detail (branches nested) | `ADMIN_PATH/clients/companies`, `/clients/companies/:id` | `companies.ejs`, `company.ejs` |

## Employees / Permissions (`requireModule('employees')`)

| Surface | Route | View |
|---|---|---|
| Employees list | `ADMIN_PATH/users` | `users.ejs` |
| Employee profile / handover / ID / access-card | `ADMIN_PATH/users/:id`, `/:id/handover`, `/:id/id/:side`, `/:id/access-card/qr` | `user_file.ejs`, `access_card_print.ejs` (D) |
| Permissions (per user) | `ADMIN_PATH/users/:id/permissions` | `permissions.ejs` |

## Appointments / Consultations (`requireModule('bookings')` / `('consultations')`)

| Surface | Route | View |
|---|---|---|
| Bookings list / settings tab | `ADMIN_PATH/appointments`, `?tab=settings` | `bookings.ejs` |
| Booking detail / new | `ADMIN_PATH/appointments/:id`, `/new` | `booking_detail.ejs`, `booking_new.ejs` |
| Consultations admin (CMS list) | `ADMIN_PATH/consultations-admin` | `consultations.ejs` |

## Agenda (`requireModule('agenda')`)

| Surface | Route | View |
|---|---|---|
| Agenda (cross-source calendar) | `ADMIN_PATH/agenda` | `agenda.ejs` |

## Support (`requireModule('support')`)

| Surface | Route | View |
|---|---|---|
| Tickets list / detail | `ADMIN_PATH/support`, `/support/:id` | `support.ejs`, `support_detail.ejs` |

## Renewals (`requireModule('renewals')`)

| Surface | Route | View |
|---|---|---|
| Expiry/renewal list | `ADMIN_PATH/renewals` | `renewals.ejs` |

## Errands (`requireModule('errands')`)

| Surface | Route | View |
|---|---|---|
| Errands board / destination detail / trip | `ADMIN_PATH/errands`, `/destination/:id`, `/trip/:id` | `errands.ejs`, `destination.ejs`, `trip.ejs` |

## Imports (`requireModule('imports')`)

| Surface | Route | View |
|---|---|---|
| Data import wizard | `ADMIN_PATH/imports`, `/template/:key`, `/preview`, `/commit/:token` | `imports.ejs` |

## Treasury / Revenue / Expenses / Custodies (`requireModule('treasury'/'revenue'/'expenses')`)

| Surface | Route | View |
|---|---|---|
| Treasury (KPIs, in/out/transfer, ledger) | `ADMIN_PATH/treasury` | `treasury.ejs` |
| Revenue (7 analytics panels) | `ADMIN_PATH/revenue` | `revenue.ejs` |
| Expenses / expense categories | `ADMIN_PATH/expenses`, `/expenses/categories` | `expenses.ejs`, `expense_categories.ejs` |
| Custodies / my custodies / handover | `ADMIN_PATH/expenses/custodies`, `/my-custodies`, `/handover` | `custodies.ejs`, `my_custodies.ejs`, `handover.ejs` |

## Payroll (`requireModule('payroll')`)

| Surface | Route | View |
|---|---|---|
| Payroll list | `ADMIN_PATH/payroll` | `payroll.ejs` |
| Run detail | `ADMIN_PATH/payroll/runs/:id` | `payroll_run.ejs` |
| Excel import/review | `ADMIN_PATH/payroll/import` | `payroll_import.ejs` |
| Payslip (print) | `ADMIN_PATH/payroll/items/:id/slip` | `payroll_slip.ejs` (D — print) |

## Reports (`requireModule('reports')`)

| Surface | Route | View |
|---|---|---|
| Report identity/profiles | `ADMIN_PATH/report-profiles` | `report_profiles.ejs` |
| Report print output | (generated) | `report_print.ejs` (D — print) |

## Settings / CMS / Security (`requireModule('settings'/'content'/'security')`)

| Surface | Route | View |
|---|---|---|
| Settings (7 tabs) | `ADMIN_PATH/settings` | `settings.ejs` |
| CMS content / services | `ADMIN_PATH/content` | `content.ejs`, `service_edit.ejs` |
| Homepage CMS | `ADMIN_PATH/homepage` | `homepage.ejs` |
| Social accounts | `ADMIN_PATH/social` | `social.ejs` |
| Contact details (public-facing) | `ADMIN_PATH/contacts` | `contacts.ejs` |
| Security / login history | `ADMIN_PATH/security` | `security.ejs`, `security_log.ejs` |
| Activity log | `ADMIN_PATH/activity` | `activity.ejs` |
| Trash (soft-deleted records) | `ADMIN_PATH/trash` | `trash.ejs` |

## Lawyer / Employee, Accountant, Supervisor-facing surfaces

These are **not separate route trees** — they are the same modules above, scoped by
`ROLE_DEFAULTS`/`can()` checks. Real role set (from `lib/permissions.js`, `lib/notify.js`,
`users.role` schema): **admin, supervisor, lawyer, accountant** (+ `client` in the separate
portal). No "Deputy Manager" or "Secretary" role exists — not fabricated for this phase, per
your explicit instruction.

- **Lawyer/employee**-relevant: dashboard (role-aware), requests (own only, `requests.view_all`
  not granted), cases (own), agenda, errands (view), support (create/reply), account/profile,
  own bookings.
- **Accountant**-relevant: treasury, revenue, expenses/custodies, payroll (view_all/manage/pay),
  performance.
- **Supervisor**-relevant: near-admin breadth per `ROLE_DEFAULTS.supervisor` (everything above
  except `clients.erase`/`requests.erase`, which are per-person grants, never role-inherited).

## Error / denied / empty / loading states

| Surface | Trigger | View |
|---|---|---|
| 403 in-app (module/permission denied) | any `can()`/`requireModule` failure | `admin/denied.ejs` |
| 403 file access | unauthorized file/document fetch | `errors/403.ejs` |
| 404 | unmatched route | `errors/404.ejs` |
| 500 | unhandled error | `errors/500.ejs` |
| 400 / 413 | malformed body / payload too large (pre-session middleware) | `errors/400.ejs`, `errors/413.ejs` |
| CSRF-expired | stale form token | `errors/csrf.ejs` |
| Subscription gate | suspended/expired/limited tenant | `errors/subscription.ejs` |
| Empty states | no data in a list/table | `.empty` pattern, per-page (consultations, destination, requests, clients, revenue, expenses, notifications, trash, activity, agenda, etc.) |

## Total

**105** real `.ejs` views, **28** admin route modules + 6 top-level route files (`bookings.js`,
`files.js`, `portal.js`, `public.js`, `support-files.js`, `support.js`, `track.js`,
`unified_login.js`, `upload.js`). Matches the Phase 2 final-audit inventory exactly — main has
not changed since that audit; this is the same real application, re-confirmed from the routes
rather than assumed from prior work.
