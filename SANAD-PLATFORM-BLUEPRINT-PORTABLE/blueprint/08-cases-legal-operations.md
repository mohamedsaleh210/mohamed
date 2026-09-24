# 08 — Cases / Legal Operations Module

Source: `routes/admin/cases.js` (full, 206 lines), `lib/cases.js` (full),
migration `035_legal_practice.js` (full), plus `040_agenda.js` and
`055_tenant_office_branches.js` touches. **Tag B (optional module)** — a
white-label variant serving a non-legal industry would disable this
entirely; one serving a different kind of professional-services firm
could keep the shape and relabel it.

## Core design principle

Stated directly in the migration's own comment: *"A request remains the
commercial/client-facing record; a legal case is the professional file
created from that request."* A case is **not** a replacement for a
request — it's an explicit, optional promotion
(`POST /cases/from-request/:requestId`, `cases.create`) once a request
becomes an actual court/legal matter. `legal_cases.request_id` is
**unique** — one case per request maximum. When created, the request's
existing assignees are copied over as the case's initial team.

This request-vs-case separation is a reusable pattern (**tag A**) worth
keeping for any professional-services white-label variant that has a
similar "intake ticket → formal matter file" distinction (e.g. an
accounting firm: engagement request → formal audit file; a consulting
firm: inquiry → project).

## Status lifecycle (tag C — Egypt-court-shaped, but the pattern is tag A)

`preparation` (تجهيز الملف) → `filed` (مقيدة) → `active` (متداولة) →
`judgment` (صدر حكم) → `enforcement` (تنفيذ) → `suspended` (موقوفة) →
`closed` (مغلقة). A realistic Egyptian-court progression (filing → active
litigation → judgment → enforcement), but with **no separate "appeal"
status or parent/child case linkage** — an appeal would presumably be
handled as a new case row or a status change, not a first-class
relationship (no such column exists). **No arbitration concept at all.**

## Structure

- `case_categories` — 8 seeded Arabic legal practice areas (Civil,
  Commercial, Labor, Personal Status, Criminal, Administrative,
  Enforcement, Real Estate), each with a color, extensible via admin UI.
  **Tag C/F** — rewrite entirely for a non-Egyptian-legal white-label use.
- `case_assignees` — team + a designated `lead` flag; visibility gated the
  same way as requests (`cases.view_all` or explicit assignment).
- `case_hearings` — genuine court-session tracking: date, court, circuit,
  purpose, `decision` (free text), `next_hearing` (propagates back to
  `legal_cases.next_hearing`), `client_visible` flag. No structured
  "judgment" entity beyond this free-text decision field plus the
  `judgment` status value — no judgment amount, appeal deadline, or
  enforceability fields.
- `case_tasks` — a per-case to-do/deadline list, separate from the
  request-level deadline system.
- `case_events` — a free-form timeline/activity log, with a
  `client_visible` flag letting specific entries surface on the client
  portal's case view.
- `case_parties` — opposing parties and other parties to the case
  (distinct from the client).

## What's honestly absent

- **No time-tracking / hourly billing on cases.** No hours-logged field,
  no hourly-rate field, no case-level fee/billing entity. Fees remain
  entirely at the parent `requests` row (see `09-financial-system.md`).
  Cases are a pure legal-operations/matter-management layer, not a
  billing unit themselves.
- **No arbitration module.**
- **No formal judgment/appeal sub-entities** — just free text plus a
  status value.
- `assignment_role` (on `case_assignees`) is unconstrained free text, not
  an enum.

## Reporting

`GET /:id/report` (`cases.report`) aggregates hearings + events + tasks +
parties + assignees into a printable case-file report via
`lib/reporting.js` (see `09-financial-system.md` for the shared reporting
utility).

## For a white-label variant

If the target company is a law firm, this module can be kept close to
as-is with `case_categories` relabeled/relocalized for the new
jurisdiction's court system and legal areas. If the target company is a
different kind of professional-services business, the *shape*
(request-promotes-to-matter-file, team assignment, session/hearing log,
task list, timeline, parties) generalizes reasonably well to e.g. an
accounting firm's audit engagements or a consulting firm's project files
— but the status enum, category seed data, and hearing-specific fields
(`court`, `circuit`, `judicial_year`) are all legal-specific and would
need a genuine rework, not a relabel.
