# UI/UX Pro Max — actual usage log, Checkpoint 1

Per the handoff (`docs/SANAD-V4-UIUX-AUDIT-AND-HANDOFF.md`, §1), the `ui-ux-pro-max` skill was
installed since the project's 4th commit but never actually invoked in prior phases. This
checkpoint invokes it for real, before designing, and records exactly what each query returned
and which concrete decision it changed. All commands below were run against
`.claude/skills/ui-ux-pro-max/scripts/search.py` on this branch; raw output is reproduced
verbatim (truncated only where noted).

Also consulted: the `design-system` skill's token-layering principle (primitive → semantic →
component) to decide how the new CSS classes below extend `admin.css`'s existing `--ink`/
`--brass` tokens rather than replacing them, and the `dataviz` skill's rule that a categorical
comparison with more than ~5 buckets reads better as a bar than a pie — cross-checked against
the chart-domain result below and applied to the dashboard status strip.

---

## 1. `"admin dashboard KPI hierarchy financial workspace"` (`--domain ux`)

Returned: heading-hierarchy (use sequential h1–h6, Medium severity) and font-size-scale
(consistent modular scale, e.g. 12/14/16/18/24/32) guidance.

**Decision:** the old dashboard used one visual weight for every `.stat` card. The redesigned
dashboard now uses real heading levels (`<h2>` per workspace section, replacing bare `<h3>` used
identically everywhere) and a genuine two-tier type scale — hero KPI figures at 32px/700 weight,
secondary KPI figures at 20px/600, supporting labels at 13px — instead of every number sharing
the same 22px.

## 2. `"data table dense list searchable filterable"` (`--domain ux`)

Returned: table-handling on mobile (horizontal scroll or card layout, not an overflowing table)
and bulk-actions guidance.

**Decision:** the Employees list now transforms into identity cards below 820px instead of
forcing the existing `data-label` responsive table sideways, using the same breakpoint already
established for `.tbl` elsewhere in `admin.css` (`768px`), and adds a live client-side
search/filter bar over the existing, unmodified `users` array (no new route).

## 3. `"donut chart bar chart financial distribution"` (`--domain chart`)

Returned: donut/pie is only appropriate for ≤5 categories with one dominant segment and must
always carry direct % labels, never rely on color alone (accessibility risk: high, unlabeled).

**Decision:** kept and *extended* the one real donut chart already in the app (treasury's
payment-method split — `methods` has exactly 5 real keys, fits the ≤5-category rule) with direct
per-slice % labels already present in its legend. For the **dashboard's request-status strip**
(6 real statuses from `STATUS`), a donut was explicitly rejected per this same guidance (`>5
categories → use stacked/horizontal bar` — see item 5) in favor of a horizontal bar list, which
is what got built.

## 4. `"trend line over time financial balance"` (`--domain chart`)

Returned: line/area chart for a time axis, "fewer than 4 points → use a stat card instead,"
fill at 20% opacity.

**Decision:** Treasury's transaction table already returns date-ordered rows for the active
filter. The redesigned page adds a small inline running-balance trend line computed directly from
those same already-fetched `rows` (no new query/route) — but only rendered when the filtered
result has 4+ dated rows, exactly matching the "fewer than 4 points" exclusion in this result.

## 5. `"admin dashboard KPI hierarchy…"` cross-check / stacked-bar threshold

(Same query as #1; the >5-category threshold is stated in the chart-domain schema referenced by
item 3's "Data Volume Threshold" field.) Combined with item 3's donut result, this is what
decided the dashboard's status-by-count panel: rendered as a horizontal proportional bar list
(each status a labeled bar, width = share of total), not a 6-slice donut.

## 6. `"professional navy teal legal institutional trustworthy palette"` (`--domain color`)

Returned three palettes; the top match, tagged **"Legal Services"**, is Primary `#1E3A8A`
(navy), Accent `#B45309` (gold), noted **"Authority navy + trust gold."**

**Decision:** this independently validates Sanad's existing, already-shipped identity
(`--ink:#12303a`, `--brass:#c9a24b`) as the *same* navy-authority + gold-trust pairing the tool
itself recommends for this exact product category — so Checkpoint 1 keeps `--ink`/`--brass`
as the primitive tokens (per the `design-system` skill's layering principle) rather than
replacing them, and instead adds a small set of new **semantic** tokens on top
(`--ink-strong`, `--surface-sunken`, `--chip-teal`) for the new hierarchy/grouping this checkpoint
needed, so the palette gains richness without breaking brand continuity.

## 7. `"Arabic RTL numeral heading hierarchy dashboard"` (`--domain typography`)

Returned Arabic-specific pairings (e.g. Noto Naskh + Noto Sans Arabic) and a "Dashboard Data"
pairing whose principle is: distinguish numeric/data typography from label typography.

**Decision:** did **not** switch away from Tajawal — the existing font is itself a deliberate,
already-established identity choice (confirmed in the prior audit), and swapping it is outside
this checkpoint's visual-only, backend-preserving mandate. What *was* applied is the underlying
principle: KPI figures now render in a heavier weight and larger, tabular-aligned size than
labels, instead of the old uniform 22px-everywhere numeral treatment.

## 8. `"tab navigation detail panel workspace"` (`--domain ux`)

Returned: keyboard-navigation (High severity — tab order must match visual order, no traps) and
sticky-nav padding guidance.

**Decision:** new tabbed/sectioned areas (Employee Profile's workspace tabs, Payroll's
run-detail sections) are built as native `<details>`/radio-driven CSS tabs — the same
zero-JS-required, keyboard-operable pattern already used throughout the codebase
(`<details class="panel">`, `<details class="picker-box">`) — rather than a custom JS tab widget,
so keyboard operability is guaranteed by the browser rather than by new script.

## 9. `"user avatar identity list row status badge"` (`--domain ux`)

Returned: contextual live-badge updates must use `role="status" aria-atomic="true"` with a
meaningful sentence, not a bare number in a raw `aria-live` span (High severity).

**Decision:** the Employees list's live search-result count and the sidebar unseen-count carry
(where newly touched) now use `role="status" aria-atomic="true"` with a full phrase (e.g. "٣
نتائج") rather than a bare digit in an `aria-live` span.

## 10. `"loading skeleton state feedback success error toast"` (`--domain ux`)

Returned: success feedback must be visible (toast/checkmark, not silence), toasts auto-dismiss
3–5s, loading indicators must match expected wait and avoid flashing for near-instant work
(High severity), error recovery needs a next step.

**Decision:** added one shared, reduced-motion-respecting toast utility (`admin.js`) that reads
the existing `?msg=`/`?err=` flash-query pattern every page already redirects with — auto-dismiss
at 4s — instead of adding a skeleton loader to full page loads (which are near-instant
server-rendered navigations, matching the "avoid flashing for near-instant work" rule). A
skeleton *is* used for the one genuinely async, non-instant operation touched this checkpoint:
the treasury/dashboard chart re-render when its own filter form resubmits.

---

All ten queries and their real, unedited output are preserved in
`design-review/v4/checkpoint-1/uiux-pro-max-raw-output.txt` for verification.

---

## Correction pass — re-run against the 4 flagged areas

After the user's visual review, `ui-ux-pro-max` was re-run specifically against the four areas
the correction request named: the employee-profile responsive KPI grid, the employee roster,
the payroll master/detail table, and the treasury mobile form. Raw, unedited output for all four
queries is preserved verbatim in `design-review/v4/checkpoint-1/uiux-pro-max-correction-pass-output.txt`.
Below is which recommendations were adopted into this pass's fixes and which were deliberately
rejected or deferred, with reasoning.

### Adopted

- **Chip Collection Reflow** (query 2, High) — "wrap the collection... don't force all chips into
  one clipped row or hide overflow." This directly validates the fix already applied to the KPI
  grid and the employee card tag row: `.kpi-quad`/`.emp-card-tags` use `flex-wrap`/responsive grid
  with `min-width:0`, never a fixed-height `overflow:hidden` clip.
- **Table Handling** (queries 1 and 3, Medium) — "horizontal scroll or card layout, not an
  overflowing table." Matches the pattern already used site-wide and extended this pass: the
  Employees list converts to cards at 820px, and dense tables that stay tables (payroll, treasury)
  scroll horizontally inside a wrapper rather than breaking the page width.
- **Submit Feedback** (query 4, High) — "show loading then success/error state... no feedback
  after submit is bad." This is what motivated fixing the real gap found during motion
  verification: treasury's `msg`/`err` query params were being passed by the route but never
  rendered. The new `.alert.ok`/`.alert.danger` block closes exactly this gap.
- **Truncation** (query 4, Medium) — "truncate with ellipsis... don't overflow or break layout."
  Applied to `.kpi-value` (`text-overflow:ellipsis`) so an unexpectedly long formatted number
  degrades gracefully instead of re-triggering the character-wrap bug this pass fixed.

### Rejected / deferred (with reasoning)

- **Mobile First** (query 1, Medium) — "design for mobile then enhance for larger." Correct as a
  general methodology, but this is a *correction pass* retrofitting existing desktop-first
  markup, not a rebuild; converting the whole admin panel to mobile-first CSS authoring is a much
  larger change than "fix the visual regressions" and is out of scope here.
- **Autocomplete** (query 2, Medium) — "show predictions as user types." The employee roster
  already filters live as the user types (no debounce needed, dataset is small and local); adding
  a separate suggestions dropdown on top of an already-instant live filter is a new UI affordance,
  not a correction, so it was left out of this pass.
- **Inline Validation / Error Placement / Focusable Error Summary / Form Labels** (queries 3 and
  4, mixed Medium/High) — all legitimate, general form-accessibility guidance, but implementing
  full per-field inline validation and error summaries, or reworking placeholder-only inputs,
  touches form markup beyond a visual-structure correction pass, and some flagged inputs are
  pre-existing fields the user explicitly asked to preserve verbatim (names, actions, contracts
  unchanged). Flagged here as a candidate for a dedicated forms-accessibility pass, not silently
  dropped.
- **Line Length** (query 4, Medium) — "65-75 characters per line for readability." This targets
  prose/paragraph content; the pages in scope are dense KPI/table admin workspaces, not long-form
  reading content, so it doesn't apply.
- **Viewport Meta / Viewport Units** (query 1) — already correctly set site-wide before this
  checkpoint; re-confirmed unchanged, not a new decision.
