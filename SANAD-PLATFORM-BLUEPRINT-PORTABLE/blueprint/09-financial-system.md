# 09 — Financial System

Source: `routes/admin/treasury.js` (full), `routes/admin/revenue.js` (full),
`routes/admin/expenses.js` (full, includes custody routes), `lib/expenses.js`,
`lib/custody.js`, `lib/payroll-import.js`, `lib/payroll-roll-forward.js`,
migrations `043_treasury.js`, `046_support_scoring_treasury.js`,
`053_guest_booking_custody_workflow.js`, `037_staff_custodies.js`,
`047_payroll.js`, `054_payroll_excel_import.js`, `041_financial_identity.js`.

## Currency: single-currency, not multi-currency

`treasuries.currency` column exists (default `'EGP'`) but is **never read
by any application logic** — only written at seed time. The actual
currency shown everywhere is one global setting, `getSetting('currency',
'EGP')`. No exchange-rate table, no FX conversion function exists anywhere.
**Conclusion: this is a single-currency system with a cosmetic
per-treasury label — tag C, not tag A.** A white-label deployment for a
different market swaps the one setting value; genuine multi-currency
operation would be new engineering, not configuration.

## Treasury — the general cash ledger

`treasuries` (named cash accounts, seeded with one "Main Treasury") →
`treasury_transactions` (`direction` in/out, `amount`, `method`, links to
`custody_id`/`client_id`/`request_id`/`payroll_item_id`, `approval_status`,
soft-void with reason — never hard-deleted). Payment methods (hardcoded,
tag F for the Arabic labels, tag A for the concept): cash, bank,
instapay, card, other, plus a system-only `custody` method for
disbursements.

- **Deposits** support multiple simultaneous payment-method splits in one
  submission (parallel arrays), tied together by a shared `group_ref`.
- **Withdrawals** auto-approve if the actor holds `settings.manage`,
  otherwise land `pending` for separate approve/reject.
- **Transfers** between treasuries are an atomic in/out pair.
- Every void is soft (reason required, never a hard delete) — a ledger-
  integrity pattern used consistently across the whole finance module.

Treasury links to: requests (fee collection, though see Revenue below for
the more common path), custody (advance-out / return-in), payroll (payout
creates an out-transaction), but **not directly to expenses** — expenses
are a separate ledger; only custody-funded money flowing to/from staff
touches treasury_transactions.

## Revenue — request-centric, not a general ledger

`routes/admin/revenue.js` is built around `payments` (a table distinct
from `treasury_transactions`) and `requests`, not treasury directly.
`net = collected − office expenses` for the period. Every payment,
discount, and write-off is scoped to a `requests` row — **there is no
request-independent/ad-hoc revenue entry point** (ad-hoc income only
exists via treasury's `/deposit`, a lower-level ledger). No case-level
revenue concept — cases don't carry fees; the parent request does.

Four export kinds (`EXPORTS`): payments detail, expenses detail (office
vs. client-borne, reimbursement status), per-request summary (a real
per-file P&L row: billed/discount/written-off/paid/remaining/office
cost/net), and "owed" (running total the office owes staff for
unreimbursed expenses).

## Expenses & Custody (staff cash advances)

`expense_categories` is **DB-driven and extensible**, not a hardcoded
enum — categories can be added/hidden (never hard-deleted if in use) via
an admin UI. **Tag D.**

Two distinct approval paths for an expense:
1. **Employee-paid, to-be-reimbursed** — recorded directly, reimbursed
   later via a simple flag (`reimbursed_at`).
2. **Custody-funded** — inserted `pending` review (`custody_status`),
   requires explicit approve/reject (`custody.review_expense`) before it
   counts against the custody balance; rejected expenses never count as
   spent. The two paths are mutually exclusive by design (a custody-funded
   expense can never also be "reimbursed" — the office already gave the
   cash up front).

**Custody lifecycle** (`lib/custody.js` + routes in `expenses.js` — no
separate custody route file): `pending_approval` → `approved` → (treasury
balance re-checked, one atomic 'out' transaction, DB constraint enforces
this can only happen once per custody) → `pending_receipt` → employee
self-confirms (`receive`) → `active` → expenses drawn down FIFO-oldest-
first against it → `return` (unspent balance back to treasury, `in`
transaction) → void only if nothing spent/returned yet. Every transition
writes a `custody_events` row (a lighter parallel audit trail alongside
the global `audit_log`).

**Gap noted**: `custody_return_requests` and a `status='closed'` formal-
settlement flow exist in the schema (migration 053) but **no route
references them** — scaffolded, not wired to any UI. Flag as
incomplete/future work, not a hidden working feature.

## Payroll

`salary_profiles` (one per employee — standing template: basic salary +
housing/transport/fixed allowances + insurance/tax defaults + bank
details) → `payroll_runs` (one per 'YYYY-MM' period, draft → approved →
partially_paid/paid) → `payroll_items` (one per employee per run, full
earnings/deductions breakdown).

**Earnings fields**: basic, housing/transport/fixed allowance,
performance bonus, exceptional incentive, overtime (a flat entered
amount, no hourly-rate calculation), other. **Deduction fields**: absence,
lateness, penalty, advance, insurance, tax, other. **Commissions are not
a distinct concept anywhere.** "Advances" exist only as a manual deduction
line, not a formal advance-request/disbursement workflow (unlike custody,
which has a full lifecycle).

**Performance-review integration**: creating a run auto-seeds each
item's bonus/deduction from any *approved* `performance_reviews` for that
period — a real, working feed from the HR performance module into
payroll, not a manual step.

**Separation of duties**: a run's own creator cannot approve it unless
they also hold `settings.manage`.

**Excel import** (`lib/payroll-import.js`, ExcelJS): generates a styled,
RTL, protected template (locked employee-identity columns, live-formula
totals, editable cells highlighted) → parse+validate (numeric bounds,
duplicate-code detection, per-row diff against current DB values) → save
as a **preview** batch (hashed, tokenized) → separate explicit apply step,
only when zero validation errors remain and the run is still draft, all
in one transaction.

**Roll-forward** (`lib/payroll-roll-forward.js`): copies only the
*stable* fields (basic salary + allowances + standing deductions) into a
new draft period for currently-active employees, deliberately dropping
every *variable* field (bonuses, overtime, absence/lateness/penalty,
notes) — "roll forward the fixed items, not the variable ones."

## Tax / VAT / Invoicing — identity fields only, no functioning tax engine

**Honest, verified-by-exhaustive-grep finding**: `report_profiles` carries
tax-shaped identity fields (`vat_registered`, `vat_rate`,
`prices_include_tax`, `tax_no`, `invoice_prefix`) — but **nothing in the
codebase ever multiplies an amount by `vat_rate`.** These are cosmetic/
compliance-labeling fields for printed documents, not a computation
engine. No withholding-tax logic, no e-invoicing integration/hooks (none,
despite this being an Egypt-market product with an obvious candidate — the
ETA e-invoice system), no tax-rate table, no multi-jurisdiction config.

**The only genuine "invoice" entity in the whole codebase** is
`lib/booking-invoices.js` — one invoice per **booking**, not per request
(`amount = requests.total_amount − discount`, no line items, no tax
applied). The core legal-request billing flow has **no invoice document
at all** — it's billed via `payments`/`total_amount`/`discount` fields
directly on the `requests` row, no separate numbered invoice.

**For the blueprint: treat tax/VAT/invoicing as a build-from-scratch
requirement for any market that needs it**, not a configuration flag on
an existing engine. This is a meaningful, honestly-stated gap versus what
a generic "ERP blueprint" template might assume exists.

## Report Profiles — a letterhead/identity system, not a report builder

`report_profiles` is branding metadata (company name, logo, signature/
stamp images, bank details, colors) used to skin printed documents — one
profile can be set default **per office branch** (migration 055), so a
multi-branch tenant can have distinct letterheads. **No edit route
exists** — only create + set-default; correcting a typo means creating a
new profile, not editing the old one (a real limitation to note).

`lib/reporting.js` is the actual cross-cutting export utility used by 12+
route files: `csv()` (UTF-8 BOM, Excel-safe — this **is** the "Excel
export," it's literally CSV, not a binary `.xlsx` for these reports),
`print()` (renders a browser-printable branded HTML table — the "PDF"
export relies on the browser's own print-to-PDF, same philosophy as the
request print view), `profileDoc()` (single-subject printable document,
e.g. one employee's or client's profile page).

The **only** genuine server-generated binary PDF anywhere is
`lib/access-card-pdf.js` (employee onboarding card) — a hand-written
~25-line raw PDF byte-writer, no library. Filters/report definitions are
hardcoded per route, not a generic "report builder" with a saved-template
concept.

## Cross-reference

Cases/legal operations (which do **not** carry their own billing — fees
stay on the parent request) are documented in
`08-cases-legal-operations.md`.
