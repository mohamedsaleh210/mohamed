# Sanad V4 — UI/UX Pro Max Pre-Implementation Audit & Handoff

**Status: AUDIT ONLY. No V4 code was written. No CSS/EJS/JS files were modified. No PR was
opened. No merge occurred.** This document is written so a brand-new Claude session — with no
memory of any prior conversation — can pick up V4 implementation directly from here.

**Baseline:** branch `main` @ `a1f3345087b8b22f4c31f38152f14386cc0f11df` (repo
`mohamedsaleh210/mohamed`), working tree clean except one harmless untracked build artifact
(`.claude/skills/ui-ux-pro-max/scripts/__pycache__/`, created by running the skill's own script
during this audit; safe to delete or gitignore, contains no project code).

**Admin panel base path:** `ADMIN_PATH` (env-configurable, default `/office-panel`).

**Real role model (do not deviate from this — no other roles exist anywhere in the schema):**
staff roles `admin`, `supervisor`, `lawyer`, `accountant` (`users.role`), plus a separate
`client` portal session. There is no "Deputy Manager," "Secretary," or "Office Manager" role.

---

## 1. UI/UX Pro Max — verification

**Installed path:** `.claude/skills/ui-ux-pro-max/` — project-tracked (committed to git, not
gitignored), present since commit `6478a6d` ("Install UI/UX Pro Max skill (v2.13.0)"), which is
the **4th commit in the entire repository's history** (right after the initial commit). It has
been available for the whole lifetime of this project.

**Contents:**
- `SKILL.md` — 740 lines, 10 prioritized rule categories: Accessibility & Touch/Interaction
  (CRITICAL), Performance / Style / Layout & Responsive / Navigation (HIGH), Typography & Color
  / Animation / Forms & Feedback (MEDIUM), Charts & Data (LOW). Includes full quick-reference
  checklists per category.
- `data/*.csv` — colors, typography, motion, icons, charts, styles, products, ux-guidelines,
  plus 22 stack-specific CSVs.
- `scripts/` — `search.py`, `core.py`, `design_system.py`, `reasoning_contract.py`,
  `validate_data.py`. Pure Python 3, stdlib-only. **Verified runnable this session** on Python
  3.11.15.

**CLI usage (confirmed working):**
```
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system \
  -p "<Project>" [--domain <domain>] [--stack <stack>] [--persist]
```
`--persist` writes a `design-system/<slug>/MASTER.md` reference file.

**Is it usable now?** Yes, unconditionally — no install step needed, no missing dependency.

**Was it actually used in Phase 1/2/3 (V1–V5, the real-app integration)?** No evidence it was.
Two independent checks confirm this:
1. The real design tokens in `public/css/admin.css` (`--ink:#12303a`, `--brass:#c9a24b`,
   `--brass-deep:#856527`, font `Tajawal`) are a custom, independently-authored identity. They do
   not match the tool's own generated defaults (its typical output leans `#2563EB` /
   `Plus Jakarta Sans` / glassmorphism-style surfaces).
2. An exhaustive repo search finds no `design-system/*/MASTER.md` output file and no reference to
   `ui-ux-pro-max` in any commit message or doc across the project's full git history.

**Conclusion:** technically available and fully usable for V4, but not actually consulted to
date. V4 implementation should genuinely invoke its CLI per page/domain before making structural
changes, rather than treating "the skill exists" as equivalent to "the skill was used."

---

## 2. Skills — verification / install

No external skill marketplace is reachable from this account: `SearchSkills` was queried with
keywords across accessibility, browser/usability testing, design review, brand, Figma, motion,
and data-visualization — every query returned zero results. There is nothing new to install;
"Section 2" reduces to cataloguing what already exists and its relevance.

**Project-tracked skills** (`.claude/skills/`, all 7 bundled into the single commit `6478a6d`,
i.e. installed together from day one):

| Skill | Relevant to Sanad V4? | Notes |
|---|---|---|
| `ui-ux-pro-max` | **Yes — primary** | Use its CLI before each page's structural redesign (Section 1). |
| `design-system` | Yes | Use to keep the `--ink`/`--brass`/Tajawal token system consistent as V4 extends it. |
| `design` | Yes | General visual-design guidance for structural redesign passes. |
| `ui-styling` | Yes | CSS/component-level styling patterns. |
| `brand` | Yes, secondary | Useful to sanity-check new components stay on-identity with the existing brass/ink palette. |
| `banner-design` | No | Marketing banner asset generation — not applicable to an admin SaaS UI. |
| `slides` | No | Presentation decks — not applicable. |

**Account-level synced skills** (`~/.claude/skills/synced/<account-id>/`): `docs`, `docx`,
`import-memory`, `morning`, `pdf`, `pptx`, `skill-creator`, `xlsx` — general productivity/file
skills, none UI/UX-related, none relevant to this task, none needed.

**Explicitly out of scope per your instruction:** no Azure/MongoDB/Classroom/email/cloud skills
exist anywhere in this account's available set — there was nothing matching that description to
decline installing.

---

## 3. Audit of the REAL current Sanad UI

**Method:** ran `main` unmodified locally (`DATA_DIR=/tmp/sanad-demo-review node server.js`,
confirmed HTTP 200), authenticated as a real admin (`adam` / `Mas@123456789`, the real first-boot
password set by `db/seed.js`'s owner-bootstrap — distinct from `demo.js`'s printed `adam/1234`
hint), captured full-page Playwright screenshots (1440×1000) of `dashboard`, `requests`,
`treasury`, `clients`, and the public homepage, then followed up with precise
`page.evaluate()` DOM measurements rather than relying on screenshot-thumbnail impressions.

**Finding ruled out — NOT a defect:** `.main-inner{max-width:1180px;margin:0 auto;padding:0
28px}` (admin.css, inside a large-screen `@media` block) is a deliberate, explicitly commented
readable-column cap ("One readable column, centred in whatever is left beside the sidebar"), not
wasted space. Do not "fix" this in V4 without a deliberate decision to change it — it's working
as designed.

**Finding — the dominant, verified root cause:** near-total absence of data visualization.
`grep -rlE "donut|sparkline|bar-fill|progress-bar|mini-bar|\.chart|svg.*polyline|svg.*path.*stroke-dasharray" views/admin/*.ejs`
matches **exactly one file in the entire admin app**: `treasury.ejs`, which has one real
CSS-conic-gradient donut chart (payment-method distribution). `revenue.ejs` — the page most
naturally suited to charts (day-by-day collection, expenses-by-type, top-services-by-collection)
— has a panel titled "التحصيل يوم بيوم" with a chart icon (`i-chart`) but renders **zero actual
chart elements**. `dashboard.ejs` has zero charts.

**Secondary finding:** every KPI-bearing page reuses one identical dense small-card grid pattern
(`.stat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}`)
with no visual hierarchy variation between pages — the same architecture already flagged in
earlier work as the cause of a bidi/wrapping bug on treasury's KPIs.

**Direct answer to "why does the real Sanad application still look substantially like the old
version?"**
It is **not** primarily legacy EJS/DOM structure, **not** primarily CSS-layering conflicts, and
**not** primarily missing motion (motion is present and functioning — see Section 4). The
dominant, evidence-backed cause is: **(a)** the near-complete absence of
charts/illustration/data-visualization that would visually differentiate a modern SaaS product
from a traditional admin panel, combined with **(b)** every KPI page reusing one small, dense,
undifferentiated stat-card grid with no per-page hierarchy variation. Legacy EJS/DOM markup is
explicitly *not* sacred under the V4 rule and can be restructured — but restructuring markup
alone will not fix this; the missing content type (real charts) and the repeated card pattern are
the actual blockers to a visibly "new" feel.

---

## 4. Motion audit

| Pattern | Where | Classification |
|---|---|---|
| Stat-card entrance fade+slide (`stat-in`, staggered by `nth-child`) | admin.css:418–424, every `.stat-grid` | **EFFECTIVE** — live DOM-measured this session: opacity 0 at t=0ms → 0.42 at t=80ms → 1 at t=480ms |
| Page-header entrance fade (`page-head-in`) | admin.css:265–267, page heads | Implemented, same mechanism/duration as the verified `stat-in`; **not independently re-measured this session** — presumed effective by construction, flag for confirmation in V4 |
| KPI count-up (`[data-count-to]`) | admin.js | **EFFECTIVE** — live-verified animating from a mid-value to the exact target over ~1.2s |
| Hover/focus micro-transitions (nav links, buttons, inputs, accordion chevrons; 120–200ms) | admin.css, sitewide | **EFFECTIVE** for their scope — standard, appropriately subtle micro-feedback |
| `prefers-reduced-motion` support | admin.css:117–121, collapses all animation/transition durations to 0.01ms | **EFFECTIVE** — correctly implemented |
| Loading-state feedback (skeleton loaders / spinners for async actions e.g. imports, form submits) | — | **MISSING** — no skeleton/spinner class found anywhere in admin.css |
| Toast/snackbar notifications | — | **MISSING** — flash messages use static `.alert` banners, not animated toasts |
| Modal/dialog open-close transition (native `<dialog>`/`.sub-dialog`, e.g. sub-request forms) | admin.css:1787,1887 | **MISSING** — no `::backdrop` or open/close animation styled; relies on native instant show/hide |
| Chart/data animation (e.g. animated donut fill, animated bar growth) | — | **MISSING** — consistent with Section 3; the one existing donut (treasury.ejs) is a static conic-gradient, not an animated draw-in |
| Page-to-page transition | — | **UNNECESSARY** — Sanad is architecturally a traditional multi-page server-rendered (EJS) app; a SPA-style transition is out of V4's scope |

---

## 5. Searchable branches

Two distinct, real, schema-confirmed "branch" concepts — do not conflate them:

**(a) `company_branches`** — a CLIENT COMPANY's own branches. `requests.branch_id INTEGER
REFERENCES company_branches(id)` is a **single scalar FK** (migration `038_companies_and_
branches.js`). The real form `views/admin/request_new.ejs` uses a single
`<select name="branch_id">`. **New Request is genuinely single-branch.** → V4 component: a
**searchable single-select combobox**, preserving `name="branch_id"` and the numeric-ID value
contract exactly.

**(b) `office_branches`** — the LAW FIRM's own internal offices. `office_branch_id` is added as a
single scalar FK to `users, clients, companies, company_branches, requests, legal_cases,
agenda_events, data_import_batches, report_profiles, report_exports` (migration
`055_tenant_office_branches.js`), with existing rows backfilled to the main office branch. Each
row still only ever stores **one** office branch — but `office_branch_id` is also used widely as
a **filter dimension** across list/report views (e.g. `imports.ejs`'s branch picker,
`report_profiles`' per-branch identity resolution). Filtering "show records from any of branches
X, Y, Z" is a `WHERE IN (...)` clause, not a foreign key, so a **multi-select searchable filter**
is legitimate here without violating any schema contract.

**V4 recommendation:** one reusable searchable-combobox component, two modes:
- **single-select** — wherever a record's own field stores one branch id (`request_new.ejs`'s
  `branch_id`, any entity's `office_branch_id` field).
- **multi-select** — only in list/report **filter** contexts (never in an entity's own
  single-valued field).

Preserve exact `name`/`id` attributes and numeric-ID values everywhere so no backend route or
param needs to change.

---

## 6. Super Admin — analysis (design only, NOT implemented)

**Current reality (verified):**
- `isSanadOwner` (`middleware/auth.js:78`) is a **platform-owner** concept — SSO-session-based
  (`req.session.platformOwnerAccess`), gated by `!process.env.TENANT_ID && role==='admin' &&
  username==='adam'`. This is Sanad's own operator identity, not a tenant-level Super Admin.
- Inside a tenant, all `admin`-role users are currently **equal** — no tenant-level Super Admin
  hierarchy exists today.
- A partial safeguard already exists: `POST /users/:id/toggle` (`routes/admin/users.js:147–161`)
  blocks deactivating the **last active admin** (`COUNT(*) FROM users WHERE role='admin' AND
  active=1`), and separately blocks self-deactivation (`id === req.session.user.id`). But this
  guard covers **only deactivation**.
- **Verified gap:** `POST /users/:id/update` (`routes/admin/users.js:563–578`) lets **any** user
  holding `users.manage` change **any** user's `role` to `admin|supervisor|lawyer|accountant` —
  including the last remaining admin — with **no last-admin guard and no self-demotion guard** at
  that route (only `/toggle` has either check). A single request to this route can currently
  strip admin rights from the only admin account, locking the tenant out of
  Settings/Employees/Permissions, recoverable only via the platform-owner SSO backdoor.
- No user hard-delete route exists (only `toggle` active/inactive) — "cannot delete Super Admin"
  is already satisfied by omission; "cannot demote/disable" is not.

**V4 design (analysis only):**
- Add `users.is_super_admin` (boolean), migration seeds it `true` on the first-created admin row
  (or the bootstrap owner-equivalent account), one-time and idempotent, mirroring the existing
  `owner_account_initialized_v1` pattern in `db/seed.js`.
- Invariant: at least one row with `is_super_admin=1 AND role='admin' AND active=1` must always
  exist. Extend the existing last-admin `COUNT(*)` guard pattern from `/toggle` to also cover
  `/update`'s role-change path (currently unguarded), and add the equivalent guard for any future
  super-admin-flag-clearing action.
- Ordinary `admin` (non-super) can manage other non-super staff but **cannot** alter a
  super-admin's role, active flag, or permissions: `if (target.is_super_admin &&
  !req.session.user.is_super_admin) return res.sendStatus(403)`.
- Only a super-admin can grant/revoke `is_super_admin` on another admin, subject to the same
  "at least one must remain" invariant.
- No session-shape change needed — `is_super_admin` is read fresh per-request from `users` exactly
  like `role` already is via the `fresh` lookup in `middleware/auth.js`.
- Every super-admin-flag change and every blocked attempt against a super-admin should be logged
  via the existing `lib/audit.js` `log()`, consistent with current convention.
- Testing: extend last-admin test coverage (verify current coverage during implementation) to the
  `/update` demotion path and the new super-admin-specific 403 responses.

---

## 7. Print/Export Profile — analysis

**Existing reusable precedent** (`lib/reporting.js`, 13 lines): `csv()` streams a UTF-8-BOM CSV;
`print()` renders a shared `admin/report_print.ejs`, resolving a per-office-branch "report
profile"/letterhead via `profileForBranch(officeBranchId)`. Used today by `GET /renewals/print`
and `GET /agenda/print` (both `can('<module>.export')`-gated).

**Permission-parity precedent already correctly modeled**, in the one entity-level print view
that exists: `requests.js:572` `GET /:id/print` is gated `can('requests.export')` **and**
internally recomputes `showMoney = canSeePayments(req.user)` to conditionally include/exclude
financial fields in the printed output — the same on-screen permission check is re-applied inside
the print renderer, not assumed from the caller. **V4's new profile-print feature must copy this
exact pattern.**

**One existing, narrow, deliberate exception where a password-like value appears on a printed
page:** `access_card_print.ejs` (`users.js:413–426`) — used only for a freshly-issued **one-time**
temporary password during employee onboarding. Gated by `can('users.manage')`, requires the
temporary password to still be unconsumed (`validCurrentCard`: `must_change_password` still true
AND `bcrypt.compareSync` match), sets `Cache-Control: no-store`. This is already safe (single-use,
admin-only, not a stored/permanent credential). **Do not extend this pattern to any other
entity** — a general Employee/Client/Company/Branch profile print must never include
`password_hash`, temporary passwords, or any credential field.

**Gap:** no Employee/Client/Company/Branch "profile" print view currently exists — only
narrow/transactional single-record prints (request, case, payslip, access-card).

**V4 design (analysis only):** a new shared `admin/profile_print.ejs` (parallel to
`report_print.ejs`) taking `{entityType, entity, sections[], reportProfile}`. Per-entity routes
(`/employees/:id/print`, `/clients/:id/print`, `/clients/companies/:id/print` — including its
branches sub-list, `/office-branches/:id/print`), each gated by that entity's existing
`can()`/`requireModule` check, each re-deriving permission-gated sections server-side the same
way `showMoney` does (e.g. a salary section on an Employee profile must re-check
payroll-related permissions inside the print route itself, not just hide it in CSS). A4 print CSS
already exists as a base (`@media print{...}`, admin.css:1750, hiding
`.sidebar/.topbar/.toolbar/.btn`). For PDF: follow `request_print.ejs`'s own documented reasoning
— browser "Save as PDF" is preferred over a server-side PDF library because it handles
Arabic/RTL shaping correctly; keep the new profile print render-to-print like `request_print`/
`report_print`, not a new server-PDF dependency (the one existing server-PDF route,
`/access-card/pdf`, exists for a different reason — it must be emailed/SMS'd as an attachment).
Short/full profile and selectable sections: accept a `sections[]` param, filtered server-side
against what the viewer is actually permitted to see, defaulting to a short profile when
unspecified.

---

## 8. Backup / Restore / Files — audit

**Backup scope (verified):** `createBackup(scope)` (`lib/backup.js`) zips the **entire
`DATA_DIR`**, using SQLite's `database.backup()` API for `.db` files and a plain copy for
everything else — meaning uploads, customer documents, support files, and financial attachments
are automatically included with no separate inclusion logic.

**Manual backup:** yes — Settings → Backup tab → `GET /backup/:scope`, streamed directly as a
download (`res.download`, then `result.cleanup()` deletes the temp zip). **No server-side backup
is ever retained** — no history list, no retention policy, no old-backup cleanup exists anywhere
(confirmed via exhaustive grep).

**Scheduled backup (daily/weekly/monthly):** **does not exist.** Confirmed via exhaustive grep
for cron/scheduling patterns — no scheduled-backup mechanism anywhere in the codebase.

**Per-office/branch-scoped backup:** **not supported.** `createBackup(scope)` only accepts
`'office'` (the tenant's whole `DATA_DIR`) or `'full'` (adds `PLATFORM_DATA_DIR`) — not a
per-`office_branch_id` scope. The admin route hard-403s `scope==='full'`, so the in-app UI can
only ever produce one thing: a full office-tenant backup.

**Download/delete of stored backups:** download exists (on-demand, streamed); there is no
"delete a backup" UI because no backups are stored server-side at all.

**Restore:** `POST /restore` requires uploading a backup zip, typing the literal confirmation
word `'استعادة'`, and a ≥5-character reason — both audit-logged. `scheduleRestore()` validates via
`PRAGMA integrity_check`/`foreign_key_check` and path-traversal-protected extraction, then writes
a pending-restore marker. **Restore is not applied immediately** — `applyPendingRestore()` runs at
the next server boot.

**Safety backup before restore:** automatic and unconditional — `replaceDirectory()` in
`lib/restore-bootstrap.js` renames the current directory into
`backups/pre-restore-<timestamp>/` before copying in restored data, for both `office-data` and
(if scope is `full`) `platform-data`.

**Audit log:** `backup.download` and `backup.restore_scheduled` actions are logged via
`audit.log`.

### File lifecycle (verified this session)

- **Upload:** multer-based; scope varies by route — `imports.js` uses `memoryStorage` with an
  `.xlsx/.xlsm` regex `fileFilter`, 5 MB / 1-file limit; `requests.js`'s `staffUpload` uses
  `diskStorage` direct to `UPLOAD_DIR`, MIME-allowlist `fileFilter`
  (`image/jpeg|png|webp|heic|heif`, `application/pdf`), 15 MB / 10-files limit, server-generated
  random filenames (`crypto.randomBytes`) — never the client's own filename, preventing
  path/name injection.
- **Validation:** MIME-type allowlist at the multer `fileFilter` (rejects before write) plus size
  limits; the router error handler translates multer error codes (`LIMIT_FILE_SIZE`,
  `LIMIT_UNEXPECTED_FILE`) into user-facing Arabic messages.
- **Storage:** flat `UPLOAD_DIR`; the DB (`document_files.stored_name`,
  `request_time_pauses.proof_path`, etc.) is the only place mapping a stored filename back to its
  meaning.
- **Permission / view-download:** file-serving routes (e.g. `requests.js:694`, time-pause proof)
  resolve `path.join(UPLOAD_DIR, path.basename(row.f))` and explicitly re-check
  `full.startsWith(UPLOAD_DIR)` (path-traversal guard) before serving — and the route sits behind
  the owning module's `can()`/`loadRequest` gate, so file access is permission-scoped through the
  owning record, never a public/guessable static path.
- **Backup / Restore:** covered above (whole `DATA_DIR`, including `UPLOAD_DIR`, wholesale).
- **Trash / delete / purge — two distinct, real mechanisms, do not conflate them:**
  1. `lib/trash.js` — a 45-day (`UNDO_WINDOW_DAYS=45`) soft-delete/undo system, but **only** for
     four CMS-ish entities: `category`, `service`, `todo`, `social` (confirmed from
     `routes/admin/trash.js`'s `RESTORERS`/`LABELS` maps). **Not for uploaded documents/files.**
  2. Uploaded documents/files have **no trash step at all.** A request-level permanent-erase flow
     (`requests.js`, ~line 1455–1488) requires the request's own reference to be typed exactly
     (`confirm_ref`) and then calls `fs.unlinkSync()` directly on every associated
     document/receipt file — immediately and irreversibly, with only a try/catch-and-log safety
     net (no soft-delete, no grace period). The only recovery path for an accidentally-erased
     file is restoring from a pre-erase backup, since the erase itself is not undoable in-app.

**V4 implication:** if file-level undo/trash parity with the CMS entities is wanted, that is
**genuinely new feature work** (extending `lib/trash.js`'s `RESTORERS` map to a `document`/
`document_files` entity — nontrivial, since it means *moving* rather than deleting the physical
file into a temp holding area for 45 days). Flag as a candidate future feature; it does not exist
today and must not be assumed present. Likewise, scheduled/retained backups and branch-scoped
backup are real, verified gaps, not V4 visual-redesign work — see Section 10.

---

## 9. AI architecture — reference (not redone)

Already completed and accepted as a standalone reference:
`design-review/architecture/AI-DATA-ACCESS-ARCHITECTURE.md`, commit
`dbd1dc50a5d6fa8a09233e33d8f69741f74d3e4f`, branch `docs/ai-data-access-architecture`. **Not
merged into main — must remain untouched per explicit prior instruction.**

**Relationship to V4:** orthogonal. V4 is a visual/structural redesign of existing EJS/CSS; the
AI architecture doc governs how a *future* AI feature would read and mask tenant/financial/
permission-scoped data (reusing `lib/audit.js`'s `MONEY_ACTIONS`/`isMoneyEntry()` masking
precedent). No V4 visual work depends on or blocks that track, and vice versa — treat it as a
parallel, independent workstream in the roadmap below, not something to fold into page-by-page
V4 passes.

---

## 10. V4 structural redesign — page classification

Based on the real 105-view inventory (`design-review/phase-3/COMPLETE-APPLICATION-INVENTORY.md`)
plus this audit's findings. **V4 rule in force:** backend contracts (routes, form actions/names,
permissions, data, workflows) stay intact; legacy EJS/DOM markup is *not* sacred and may be
restructured.

**STRUCTURAL REDESIGN** (biggest visual gap; most benefit from real charts/layout rework):
`dashboard.ejs`, `revenue.ejs`, `treasury.ejs` (extend its one working chart pattern instead of
discarding it), `report_profiles.ejs` area.

**MODERATE RECOMPOSITION** (dense list/detail pages reusing the `.stat-grid` pattern; benefit
from hierarchy variation + the new searchable-branch component from Section 5):
`requests.ejs`, `request_detail.ejs`, `cases.ejs`, `case_detail.ejs`, `clients.ejs`/`client.ejs`,
`companies.ejs`/`company.ejs`, `users.ejs` + employee profile, `payroll.ejs`, `expenses.ejs`.

**VISUAL POLISH** (functional, lower-traffic, smaller effort): `agenda.ejs`,
`errands.ejs`/`destination.ejs`/`trip.ejs`, `support.ejs`/`support_detail.ejs`, `settings.ejs`,
`content.ejs`/`homepage.ejs`/`social.ejs`, `security.ejs`/`security_log.ejs`/`activity.ejs`,
`notifications.ejs`, `permissions.ejs`, `imports.ejs`, `renewals.ejs`,
`custodies.ejs`/`my_custodies.ejs`/`handover.ejs`, `bookings.ejs`/`booking_detail.ejs`,
`consultations.ejs` (admin), `account.ejs`/`profile.ejs`, `trash.ejs`.

**PRESERVE** (print/export outputs must stay print-safe/minimal; auth/error/legal pages are
already minimal by design — do not spend V4 effort here): `request_print.ejs`, `case_report.ejs`,
`payroll_slip.ejs`, `report_print.ejs`, `access_card_print.ejs` (+ the new `profile_print.ejs`
once built, per Section 7), admin login/forgot/reset, error views (403/404/500/400/413/csrf/
subscription/denied).

**SEPARATE FUNCTIONAL PROJECT** (real backend/feature work identified in Sections 6–8 — not a
restyle task; scope, plan, and build these independently, then apply V4 visual language to their
UI once each feature itself is approved and built):
- Super Admin hierarchy (Section 6)
- Employee/Client/Company/Branch print-profile feature (Section 7 — new views/routes)
- Scheduled/retained backups + branch-scoped backup (Section 8)
- Document/file-level trash-undo parity (Section 8)

**Public site (`routes/public.js`) + client portal (`routes/portal.js`):** already received a
dedicated visual pass earlier in this engagement (prior Phase 4 work). Re-verify only for drift
since then — do not redo; classify per-page as VISUAL POLISH/PRESERVE once re-verified, not
STRUCTURAL.

---

## V4 component architecture (summary for next session)

New/extended shared components identified by this audit:
1. **Chart primitives** — the biggest lever per Section 3. Extend `treasury.ejs`'s existing
   CSS-conic-gradient donut pattern (no new JS charting library needed for simple cases) and add
   real charts to `revenue.ejs` and `dashboard.ejs` where icons currently imply them but none
   render.
2. **Searchable branch combobox** — single-select and multi-select modes per Section 5,
   preserving exact `name`/id/value contracts.
3. **`admin/profile_print.ejs`** — new shared print template per Section 7, parallel to the
   existing `admin/report_print.ejs`, with server-side section filtering by permission.
4. **Motion gaps to close** (Section 4): loading-state feedback (skeleton/spinner), toast/
   snackbar notifications, modal open/close transition on `<dialog>`/`.sub-dialog`. Reuse the
   existing `--motion-fast/normal/slow` + `--ease-*` tokens and the already-correct
   `prefers-reduced-motion` collapse.

## Implementation phases (proposed, for the next session to refine)

1. **Phase V4-A — Structural redesign group:** dashboard, revenue, treasury (chart work first,
   since it's the root-cause fix from Section 3).
2. **Phase V4-B — Moderate recomposition group:** requests/cases/clients/companies/employees/
   payroll/expenses, including rollout of the searchable-branch component.
3. **Phase V4-C — Visual polish group:** remaining operational pages.
4. **Phase V4-D — Motion gap closure:** toasts, skeleton/spinner states, modal transitions.
5. **Separate tracks (not V4 visual phases):** Super Admin hierarchy, profile print-export
   feature, backup scheduling/retention, file-trash parity — each scoped and built on its own,
   informed by Sections 6–8 above, with V4 visual language applied to their UI once built.

## Risks

- Reintroducing the `.stat-grid` `auto-fill`/small-`minmax` bidi-wrapping issue (previously fixed
  on treasury) if the moderate-recomposition pass touches that CSS without re-testing Arabic
  numerals/RTL wrapping.
- Adding a real charting approach (library vs. hand-rolled SVG/CSS) has a bundle-size/complexity
  tradeoff — decide this explicitly in Phase V4-A rather than defaulting silently.
- The Section 6 Super Admin gap (`/users/:id/update` has no last-admin/self-demotion guard) is a
  **real, currently-exploitable-by-mistake bug**, independent of V4's visual scope — worth fixing
  on its own regardless of V4 timing, since it can lock a tenant out of admin access today.
- Print-profile work (Section 7) must not accidentally reuse the `access_card_print.ejs` "print a
  temporary password" pattern for any new entity — that pattern is safe only because it's
  single-use and self-expiring; copying it elsewhere would be a real credential-exposure bug.

## Testing requirements

- Full automated suite: `npm test` (`node test.js`) — run after every phase.
- Manual role matrix re-verification (admin/supervisor/lawyer/accountant/client) for any page
  whose permission-gated sections change (especially the new profile-print feature).
- Responsive re-check (the 11-breakpoint sweep used in prior phases) for any restructured page.
- RTL/Arabic-numeral wrapping re-check specifically for any `.stat-grid`-derived layout touched.
- `prefers-reduced-motion` re-check for any new animation/transition added in Phase V4-D.
- Playwright screenshot evidence, consistent with this engagement's existing pattern
  (`design-review/phase-*/`), for each phase.

## Next-session starting instructions

1. Confirm you're on `main` at (or after) `a1f3345087b8b22f4c31f38152f14386cc0f11df`; if this
   doc's SHA differs from current `main`, re-run the relevant greps in this doc's sections before
   trusting stale line numbers.
2. Read this document in full before writing any code — it is the complete brief.
3. Start with Phase V4-A (Section "Implementation phases" above) — the chart-absence root cause
   from Section 3 is the highest-leverage fix.
4. Before restructuring any page, run the `ui-ux-pro-max` CLI for that page's domain (Section 1)
   — actually use it this time.
5. Reuse existing precedents rather than inventing new ones: `lib/reporting.js` for
   print/export, `lib/audit.js` for audit logging, `lib/trash.js` for any new soft-delete needs,
   the `--motion-*`/`--ease-*` tokens for any new animation.
6. Do not touch `docs/ai-data-access-architecture` branch/commit — it is a separate, already-
   accepted reference (Section 9).
7. Treat Section 6/7/8's "Separate Functional Project" items as their own backend-first
   workstreams — do not fold them into the visual-redesign page passes.

---

**READY FOR V4 VISUAL IMPLEMENTATION: YES**
