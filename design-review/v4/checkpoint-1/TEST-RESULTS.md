# Checkpoint 1 — Test Results

## Environment

- `main` baseline SHA `a1f3345087b8b22f4c31f38152f14386cc0f11df`, branch
  `uiux/v4-structural-checkpoint-1`.
- Manual/QA server: `DATA_DIR=/tmp/sanad-v4c1 PORT=4501 node server.js`, seeded via
  `node demo.js` (38 staff, 70+ requests, real treasury/payroll/custody data).
- Admin auth: `adam` / `Mas@123456789` (the real first-boot owner-bootstrap password, confirmed
  in the prior audit — not `demo.js`'s own printed `adam/1234` hint, which does not match the
  actual password hash in this seed).
- Automated suite: `node test.js` against its own ephemeral fresh `DATA_DIR` (unrelated to the
  demo server above) via `npm test`.

## 1. Automated test suite (`node test.js`)

**First run (before fixes): 109 pass / 8 fail**, all 8 traced to one real regression:

- `/users: أدمن 200 / محامي 403 — adam=500 mona=403` — the employees-list query I extended with
  `LEFT JOIN office_branches` hit `ambiguous column name: active` (and, once that was fixed,
  `created_at`) because both `users` and `office_branches` have those column names. The manually-
  tested dev server didn't show this because it was still running the pre-edit route code in
  memory — the automated suite's fresh process caught it immediately. **Fixed** in
  `routes/admin/users.js` by qualifying `users.active`/`users.created_at`. The 6 downstream
  employee-creation-flow failures and the final `TypeError` were all consequences of that one 500,
  not separate bugs — confirmed by their disappearance once the query was fixed.

**Second run (after the SQL fix): 972 pass / 2 fail:**

- `مفيش عنصر في اللوحة بدون تنسيق — reset-inline` — a repo hygiene check asserting every CSS
  class used in a view has a matching rule; I'd added `class="reset-inline"` to the reset-password
  form without ever styling it. **Fixed** by removing the unused class.
- `وأجهزته` — asserts the employee-profile page's raw HTML still contains the literal string
  "الأجهزة والدخول" (the original devices-section heading). My redesign had renamed that tab
  label to "الحساب والدخول". **Fixed** by restoring the exact original label text.

**Third run (after both fixes): 974 pass / 0 fail.** `npm test` exit code `0`.

## 2. Live Playwright QA pass (24 checks, 24 passed)

Run against the manual/QA server (`localhost:4501`), after restarting it to pick up both fixes.

| Area | Checks | Result |
|---|---|---|
| No horizontal overflow | `scrollWidth - clientWidth` at 390/820/1440px, all 5 pages (15 checks) | All 0px — no overflow anywhere |
| Permissions | Lawyer (`khaled`/`demo1234`) dashboard shows no treasury-balance primary KPI; `/treasury` returns 403 for that role | Both pass — permission gates intact under the new markup |
| Functionality — Employees list | Live search filter narrows 38 rows to 3 on "khaled"; reset-password inline toggle opens without error | Pass |
| Functionality — Employee Profile | Tabs operable by **keyboard** (focus `#tab-custody` + Space → checked, panel visible) | Pass |
| Functionality — Treasury | Tab switch reveals the withdraw form; a **real end-to-end withdraw submission** (₤1, real beneficiary/purpose) redirected to `?msg=withdrawn` | Pass — confirms form field names/action are genuinely intact, not just visually present |
| Functionality — Payroll | Overview-table "التفاصيل" link opens (not just scrolls to) the matching `<details>` card | Pass |

## 3. Motion verification (live, not just CSS-presence)

Measured via `getComputedStyle` at `load`, `+150ms`, `+850ms` on the dashboard:

| Element | At load | At +150ms | At +850ms |
|---|---|---|---|
| `.kpi-hero-row` (`ws-stagger-in`) | opacity `0` | — | — |
| `.bar-compare-fill` (`bar-fill-in`) | `matrix(0,0,0,1,0,0)` (scaleX 0) | `matrix(0.77,…)` | `matrix(1,0,0,1,0,0)` (full) |
| `[data-count-to]` (existing count-up) | `0` | `135,041` | `262,200` (exact target) |

Confirms the entrance/reveal/count-up animations genuinely run, not merely declared in CSS.

**Reduced motion**: with `reducedMotion: 'reduce'` context, `.kpi-primary`'s
`animation-duration` computed to `1e-05s` (~instant) and opacity was already `1` at 50ms — the
existing global `prefers-reduced-motion` collapse rule correctly covers every new animation added
this checkpoint (nothing bypasses it).

## 4. RTL/LTR verification

Real session-based switch (`GET /lang/en`, `routes/public.js`), not a simulated attribute flip.
`document.documentElement` correctly reports `dir="ltr"` after the switch, and all five rebuilt
pages were screenshotted at 1440px in that state
(`screenshots/after/*-1440-en.png`). **Finding**: layout mirrors correctly (sidebar, KPI cards,
bar charts, tabs — no broken alignment or overflow), but the admin panel's own UI copy stays
Arabic — this is pre-existing app behavior (only the public site ships English strings; the admin
panel was never translated) confirmed against the unmodified baseline, not a regression introduced
by this checkpoint.

## 5. Financial calculations

No calculation code was opened this checkpoint (`lib/*.js`, the money-math in
`routes/admin/treasury.js`/`routes/admin/payroll.js` untouched — see
`STRUCTURAL-CHANGE-MAP.md`). Every displayed figure is the same server-computed value as before;
new view-only math (bar-chart percentages) is display-only and never written back. The live
end-to-end treasury withdraw in the QA pass exercised the real balance-sufficiency check
(`balance(tid,m) < a`) and real insert path, confirming the calculation layer is reachable and
unchanged through the new markup.

## 6. Screenshots

`design-review/v4/checkpoint-1/screenshots/before/` — 18 files (5 pages × 3 breakpoints, +1 extra
for payroll-run), captured against unmodified `main` before any edit.
`design-review/v4/checkpoint-1/screenshots/after/` — 18 matching files plus 5 `*-1440-en.png`
LTR-verification shots, captured against the final, fixed code after the full fix cycle above.
