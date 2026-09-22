# Phase 2 Final Audit — Visual Consistency

## Method

Every real view was inventoried (see `COMPLETE-PAGE-MATRIX.md`). Two complementary sweeps were
run across the whole codebase, not just view templates:

1. A Unicode-range grep across all 105 `.ejs` files for emoji, dingbats, geometric-shape and
   arrow glyphs used as literal template text.
2. The same sweep repeated across every file in `routes/` and `lib/` — because several views
   render an **icon field from a JS variable** (`<%= def.icon %>`), which the first sweep cannot
   catch since the glyph lives in the source data, not the template text.

The second sweep is what actually found this audit's most interesting bug: `lib/data-import.js`'s
`DEFINITIONS[key].icon` (▤▣□♙▦⌖) rendered straight into `imports.ejs` — invisible to a
template-only grep, only visible once you follow the variable back to its source.

## Findings and fixes

All ten fixes are listed per-file in `COMPLETE-PAGE-MATRIX.md`. Summary by category:

- **Empty-state icons** (`.empty .big` pattern): `admin/consultations.ejs` (💬), `admin/destination.ejs` (✓) — both converted to the same `<span class="big"><svg><use href="…"/></svg></span>` pattern used by every other empty state in the app (`clients.ejs`, `revenue.ejs`, `notifications.ejs`, `trash.ejs`, etc.)
- **Table-cell boolean indicators**: `clients.ejs`, `expenses.ejs`, `revenue.ejs` all had the identical `<span style="color:var(--ok)">✓</span>` "fully settled / nothing owed" pattern — all three converted to a small inline SVG `i-check`, consistent sizing (16×16) and color
- **Dialog close button**: `agenda.ejs`'s "add agenda" dialog used a literal `×`; converted to the same SVG `i-x` pattern already used on the mobile-nav close button
- **Card icons rendered from a JS config object**: `imports.ejs` (`lib/data-import.js`), `admin/contacts.ejs` (`routes/admin/contacts.js`'s `KINDS.icon`) — both converted with a page-local icon-name map, leaving the source JS files untouched (same technique already established for the public `contact.ejs` in the previous checkpoint)
- **Result icons**: `errors/403.ejs`, `admin/denied.ejs` (🔒), `portal/verified.ejs` (✅/⚠️) — all converted to SVG (`i-lock`, `i-check-circle`, `i-alert-triangle`)
- **ID-capture status tag**: `admin/profile.ejs`'s "الوجه ✓ / الظهر ✓" tags (both the static render and the JS `textContent` update on capture) — converted to append an SVG `i-check`

## Deliberate non-fixes (documented, not missed)

- **`lib/payments.js`'s `METHODS.icon`** (💵🏦🌍📲…) is rendered inside native `<option>` elements in `request_detail.ejs` and `payroll` views, where an SVG cannot render at all. A previous checkpoint already made this exact call and left a code comment explaining it (`revenue.ejs:21`). Confirmed still correct; not re-litigated.
- **`expense_categories.icon` / `homepage_metrics.icon`**: real, per-row, admin-editable DB fields (free text, `maxlength="4"`/`"8"`). Never touched, per the standing rule from every prior checkpoint.
- **Inline `✓` used as idiomatic sentence-punctuation** inside real business text (`request_detail.ejs`: "مسدّد بالكامل ✓", "اتصرف له ✓", the copy-to-clipboard button's transient "اتنسخ ✓" feedback): left as plain text. These are short confirmation words embedded mid-sentence or as transient button-label feedback, not a persistent icon slot — restructuring them into mixed text+SVG nodes (including two that are set via JS `textContent`) would be a materially larger, higher-risk change for a cosmetic-only gain, and the brief explicitly asks for low-risk, narrowly-justified cleanup only.
- **Notification / audit-log text bodies** (`routes/admin/requests.js`, `revenue.js`, `errands.js`, `auth.js`, `client.js`, `settings.js`, `users.js`, `public.js`, `lib/deadlines.js`): all contain emoji (🔴✅💰📍🔐🗑📂📥⚠️🕓) baked directly into the generated message string (`text: \`🔴 ${r.ref} …\``), stored and displayed verbatim in `notifications.ejs`/`activity.ejs`. This is real, dynamic, business-generated content — not a decorative template icon — and editing it means changing notification-generation business logic, which the brief explicitly places out of scope ("do not remove, rename, invent, simplify, or replace… API behavior"). Documented as intentional/out-of-scope, not silently ignored.
- **`lib/devlinks.js`, `lib/images.js`, `lib/mailer.js`, `lib/restore-bootstrap.js`**: emoji appear only in server **console.log** output (terminal, never rendered to any view). Zero UI impact; not in scope for a visual audit.
- **`settings.ejs`'s "←" arrows inside Google Cloud Console setup instructions**: these describe an external product's own menu navigation path in help prose ("APIs & Services ← OAuth consent screen"), not a Sanad UI control. Left as-is.
- **`errors/400.ejs` / `413.ejs`**: see `COMPLETE-PAGE-MATRIX.md` — deliberately self-contained early-failure pages; colors already match the real tokens almost exactly.

## KPI / card / table / form / badge consistency

Spot-checked across every module touched this session plus a fresh look at the pages found in
this audit: KPI cards, mini-charts, distribution bars, `.panel`/`.panel-body`, `.tbl`, `.chip`,
`.alert`, `.empty`, `.btn` variants (`brass`/`ghost`/`danger`), and form `.field`/`.two-col`
layouts are all drawn from the same shared token set (`--ink`, `--brass`, `--paper`, `--line`,
`--ok`/`--warn`/`--danger` in admin.css) with no new one-off component styles introduced by any
of this audit's fixes — every fix reused an existing, already-proven class or CSS custom
property. No new charts or KPIs were added; none were needed.

## Result

No systemic inconsistency found — the V3 system established across the four prior checkpoints
holds up under a full-application sweep. All defects found were narrow, isolated stragglers
(10 files), all fixed, all low-risk, all reusing existing patterns.
