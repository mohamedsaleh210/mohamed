# Phase 2 Final Audit — Complete Real-Page Matrix

Every real, user-facing `.ejs` view in the application (105 files under `views/`), classified:

- **A** — V3 integrated and visually consistent
- **B** — V3 integrated but needed minor correction (fixed in this audit)
- **C** — was substantially legacy (none found — see note)
- **D** — intentionally excluded (print/PDF/system-only)
- **E** — requires functional/backend work, not visually guessed (none found)

No page in the real application was found to be **C** (substantially legacy) or **E** at this
stage — the four prior Phase 2 checkpoints (operations, finance-admin, role-workspaces,
public-site) already brought every major module to V3. This final audit's job was to find what
those checkpoints missed: stragglers, edge pages, and pages that were never explicitly
inventoried. It found real gaps — documented below as **B**, all now fixed — plus one content
(not visual) gap deferred to a content decision (see `DEFERRED-ISSUES.md`).

## Admin shell & dashboard

| Page | File | Status | Note |
|---|---|---|---|
| Shell (topbar/sidebar/drawer) | `partials/admin_head.ejs`, `admin_nav.ejs`, `admin_foot.ejs` | A | Checkpoint 2A/2B |
| Dashboard | `admin/dashboard.ejs` | A | Checkpoint 2C |

## Operations

| Page | File | Status | Note |
|---|---|---|---|
| Requests list / detail | `requests.ejs`, `request_detail.ejs` | A | Checkpoint 2D |
| New request (staff-entered) | `request_new.ejs` | A | Verified this audit — real V3 classes, no glyphs |
| Cases list / detail | `cases.ejs`, `case_detail.ejs` | A | Checkpoint 2E |
| Case report (print) | `case_report.ejs` | D | Print-oriented |
| Clients / Companies | `clients.ejs`, `client.ejs`, `companies.ejs`, `company.ejs` | **B→A** | Checkpoint 2F; this audit found a stray ✓ Unicode glyph in the "fully settled" table cell on `clients.ejs` — fixed to SVG `i-check` |
| Employees list / profile | `users.ejs`, `user_file.ejs` | A | Checkpoint 2G |
| Permissions | `permissions.ejs` | A | Checkpoint 2H |
| Errands / destination / trip | `errands.ejs`, `destination.ejs`, `trip.ejs` | **B→A** | `errands.ejs`/`trip.ejs` were in checkpoint 3F; `destination.ejs` was never explicitly checkpointed — found using real `.panel`/`.tbl`/`.chip`/`.flag` V3 classes already, but its empty-state icon was a literal `✓` glyph instead of the established `.empty .big` SVG pattern — fixed |
| Renewals | `renewals.ejs` | A | Verified this audit — real V3 classes, no glyphs |
| Agenda | `agenda.ejs` | **B→A** | Checkpoint 3E; this audit found the "new agenda" dialog's close button used a literal `×` character instead of the SVG `i-x` pattern already used on the equivalent mobile-nav close button — fixed |
| Consultations (admin CMS) | `admin/consultations.ejs` | **B→A** | Never explicitly checkpointed. Real `.panel`/sortable-list V3 classes throughout (drag handle and reorder arrows already real SVG) — but its own empty-state used a literal 💬 emoji — fixed to SVG `i-message` |
| Data import wizard | `imports.ejs` | **B→A** | Never explicitly checkpointed. Real, fully-styled `.import-*` component CSS already existed, but (1) three stepper/success/row-check indicators used literal `✓` glyphs, and (2) the per-entity card icons rendered a hardcoded Unicode glyph (`▤▣□♙▦⌖`) from `lib/data-import.js`'s `DEFINITIONS[key].icon` — both fixed. Also found and fixed a genuine responsive bug: the hidden file-picker `<input>` inside `.file-drop` had no `position:relative` on its container, so it kept its native intrinsic width/position and pushed the page's scrollable width out by ~760px at every breakpoint (invisible but real horizontal overscroll) — fixed with `position:relative` + `inset:0` |

## Finance

| Page | File | Status | Note |
|---|---|---|---|
| Treasury | `treasury.ejs` | A | Checkpoint 2I |
| Revenue | `revenue.ejs` | **B→A** | Checkpoint 2J. This audit found a stray ✓ glyph in a table cell (same "fully settled" pattern as clients.ejs/expenses.ejs) — fixed. Its already-documented, deliberate decision to leave `lib/payments.js`'s `METHODS.icon` emoji untouched (used inside native `<option>` elements elsewhere, where SVG cannot render) still stands and is correct |
| Expenses / categories / custody | `expenses.ejs`, `expense_categories.ejs`, `custodies.ejs`, `my_custodies.ejs`, `handover.ejs` | **B→A** | Checkpoint 2K. Same stray ✓ glyph pattern found and fixed on `expenses.ejs`. `expense_categories.icon` (real per-row DB field, admin-editable) correctly left untouched |
| Payroll | `payroll.ejs`, `payroll_run.ejs`, `payroll_import.ejs`, `payroll_slip.ejs` | A | Checkpoint 2L |
| Reports | `report_profiles.ejs` | A | Checkpoint 2M |
| Report / request print views | `report_print.ejs`, `request_print.ejs`, `access_card_print.ejs` | D | Print/PDF-oriented, explicitly out of scope |

## Settings / CMS / Security

| Page | File | Status | Note |
|---|---|---|---|
| Settings | `settings.ejs` | A | Checkpoint 2N. Instructional "←" arrows inside Google Cloud Console setup prose are literal navigation-path text in a help paragraph, not a UI control — left as-is (documented, not a defect) |
| CMS (content/services/homepage/social) | `content.ejs`, `service_edit.ejs`, `homepage.ejs`, `social.ejs` | A | Checkpoint 2O |
| Contact details (admin) | `contacts.ejs` | **B→A** | Never explicitly checkpointed. Real V3 classes throughout, but rendered `routes/admin/contacts.js`'s hardcoded `KINDS.icon` emoji map (📞📱💬✉️📍📠) directly — fixed with a page-local icon-name map, same pattern used for the public `contact.ejs` in the previous checkpoint. The route-level constant itself is untouched (server-side, not used anywhere else) |
| Security / Activity / Trash | `security.ejs`, `security_log.ejs`, `activity.ejs`, `trash.ejs` | A | Checkpoint 2P |
| Access-denied (in-app) | `admin/denied.ejs` | **B→A** | Flagged as a known issue after checkpoint 3; fixed this audit — 🔒 emoji → SVG `i-lock` |
| Bookings settings tab | `admin/bookings.ejs` | A | Checkpoint 3J |

## Auth / error pages

| Page | File | Status | Note |
|---|---|---|---|
| Admin login / forgot / reset | `login.ejs`, `forgot.ejs`, `reset.ejs` | A | Verified this audit — real `.login-page`/`.login-card` V3 classes, only an intentional "← back" arrow |
| Portal login / register / forgot / reset | `login.ejs`, `register.ejs`, `forgot.ejs`, `reset.ejs` | A | Verified this audit — real `.form-card` V3 classes |
| Portal email verification | `verified.ejs` | **B→A** | Never checkpointed. Used raw emoji (`✅`/`⚠️`) as its primary result icon — fixed to SVG `i-check-circle` / `i-alert-triangle` |
| 404 / 500 / subscription-gate | `errors/404.ejs`, `500.ejs`, `subscription.ejs` | A | Real V3 classes already |
| 403 (file access denied) | `errors/403.ejs` | **B→A** | Used a raw 🔒 emoji — fixed to SVG `i-lock` |
| 400 / 413 (raw body-parser errors) | `errors/400.ejs`, `413.ejs` | D | Deliberately self-contained, inline-styled pages rendered with `layout:false` before session/CSRF middleware runs (malformed-request / payload-too-large handlers in `server.js`). Colors already match the real design tokens (`--ink`, `--brass`) exactly; one color (`--muted`) has a ~2% hex drift, judged not worth touching given the disproportionate risk of editing an early-failure rendering path for zero user-visible benefit |
| CSRF-expired | `errors/csrf.ejs` | A | Real `.login-page` classes already |

## Workspaces (portal / lawyer / accountant)

| Page | File | Status | Note |
|---|---|---|---|
| Customer portal | `portal/requests.ejs`, `request_detail.ejs`, `support.ejs`, `support_detail.ejs` | A | Checkpoint 3A–3C |
| Lawyer/employee dashboard, agenda, errands, trip | (see Operations above) | A/B | see Agenda row above |
| Support (admin-side) | `admin/support.ejs`, `support_detail.ejs` | A | Checkpoint 3G |
| Notifications | `admin/notifications.ejs` | A | Checkpoint 3H |
| Account / profile | `admin/account.ejs`, `profile.ejs` | **B→A** | Checkpoint 3I. This audit found the ID-card "captured" tag on `profile.ejs` used inline `✓` text (both static-rendered and JS `textContent`-set) — fixed both to append an SVG `i-check`, mirroring the same "captured" convention already used on the public `upload.ejs` |
| Bookings (own appointments) | `admin/booking_detail.ejs`, `booking_new.ejs` | A | Checkpoint 3J |
| Accountant performance | `performance.ejs` | A | Checkpoint 3K |

## Public site

Covered exhaustively in the previous checkpoint (`design-review/phase-2/public-site/README.md`).
This audit re-verified the full set and found two additional items:

| Page | File | Status | Note |
|---|---|---|---|
| Homepage, services, category, request, consultations, about, contact, FAQ, guides page, track, upload, unified login, booking pages | (24 files) | A | Re-verified clean this audit |
| User guides | `public/guides.ejs` | **B (content, not visual)** | The decorative browser-chrome mockup (`.live-shot`) lacked `aria-hidden` — fixed. Separately, this audit found the page's guide content (headings, steps, mock numbers) has **no English translation at all** — switching the site to English changes the header/nav/footer correctly but the guide body stays 100% Arabic. This is a genuine, real content gap, but it requires authoring real approved English copy for 5 guide sections, which is a content decision, not a visual fix — **deferred**, see `DEFERRED-ISSUES.md` |
| Track result | `public/track_result.ejs` | **B→A** | A literal `✓` glyph in `.track-done` — fixed to SVG `i-check` |

## Summary count

- **105** total real `.ejs` views inventoried
- **10** views corrected in this final audit (see per-file notes above)
- **7** print/system/early-failure views correctly excluded (D)
- **1** content gap deferred (guides.ejs English translation)
- **0** views requiring backend/functional work (E) found
- All others already **A** from the four prior Phase 2 checkpoints
