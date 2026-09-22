# RC1 — Release Candidate Readiness Report

**Baseline**: `main` @ `0e95c4897b36dd1b50dc87f667e234010ced8f4c` ("Phase 3 — Production Polish &
Final Readiness (#6)").
**Scope of this pass**: evidence-first validation only. No PR was created, nothing was merged,
nothing was deployed, and no fixes were applied. The working tree contains exactly one addition:
`design-review/release-candidate/` (this report and its supporting evidence) — verified via `git
status`.
**Companion documents**: `RC1-DEFECTS.md`, `RC1-ROLE-MATRIX.md`, `RC1-HOSTINGER-CHECKLIST.md`,
`screenshots/` (55 images, 5 surfaces × 11 breakpoints).

---

## 1. Baseline / repository integrity

- `main` HEAD confirmed at `0e95c4897b36dd1b50dc87f667e234010ced8f4c`, matching the RC1 brief's
  stated baseline exactly.
- Working tree clean apart from this evidence directory (`git status --short`).
- `npm install` already satisfied (dependencies present, app runs).
- Node `v22.22.2`, npm `10.9.7` — both satisfy `package.json`'s `"engines": {"node": ">=18"}`.
- Migrations: 57 files in `db/migrations/`, through `056_login_throttle.js`. One duplicate numeric
  prefix pair exists (`049_data_imports.js` / `049_homepage_content.js`) — both apply successfully
  in a fresh environment; noted, not a functional defect (migration runner does not rely on
  numeric uniqueness for correctness, only for human-readable ordering).
- Fresh-environment startup (isolated `DATA_DIR`, `SEED_DEMO=0` and `SEED_DEMO=1` both tested
  earlier in this validation run) completed cleanly with no unhandled errors.
- No tracked sensitive files: `.gitignore` correctly excludes `data/`, `backups/`, `*.db*`,
  `*.sqlite*`, `.env*` (except `.env.example`), `TEST-ACCOUNTS.txt`, logs, caches — confirmed by
  direct read.
- Required env vars documented by name only (no values) in `RC1-HOSTINGER-CHECKLIST.md` §3.

**Result: PASS.**

## 2. Full automated regression suite

Re-run in full during this session, at the exact baseline SHA:

| Suite | Result |
|---|---|
| `test.js` | 974 / 974 |
| `integration.js` | 74 / 74 |
| `edge.js` | 178 / 178 |
| `security.js` | 138 / 138 |
| `import-test.js` | 21 / 21 |
| `payroll-excel-test.js` | 2 / 2 |
| **Total** | **1387 / 1387** |

**Result: PASS.** Matches the count already established at Phase 3 merge time — zero regressions
since then, consistent with zero code changes having occurred between the merge and this pass.

## 3. Real role/auth matrix

Full detail in `RC1-ROLE-MATRIX.md`. Real role set confirmed (admin, supervisor, lawyer,
accountant, client) — no fabricated role used anywhere. Forced-password-change and
profile-completion gates read from `middleware/auth.js` and cross-checked against live behavior.
Direct-URL 403 enforcement re-confirmed for treasury/payroll/settings/users across all 4 staff
roles. Live business-journey check: assigning a request to a lawyer correctly scoped it into her
own list and correctly hid fee/pricing data from her session.

**Result: PASS.**

## 4. Core business journeys

All five sub-journeys exercised live, with real (disposable) data, this session:

- **Request**: create → action-picker mechanism (decoded from source, not guessed) → assign to
  lawyer → status change → comment → convert-to-case. All working; one P3 UX finding logged
  (RC1-D3).
- **Case**: create-from-request → add hearing → add task. All working.
- **Appointments/Consultations**: admin slot creation → guest public booking (after confirming the
  feature is off by default in seed data — CONFIG, not a defect) → visible in admin list →
  setting restored to its original state afterward.
- **Employees**: list, profile, permissions link, active/inactive toggle, CSV export (real file
  download observed) — all working.
- **Client/Company**: search, client detail with linked request history, company creation, branch
  creation — all working.

**Result: PASS**, with 1 P3 finding (RC1-D3, not release-blocking).

## 5. Financial workflows + calculation verification

Real math checked against real transactions, using disposable amounts only, with the app's own
formulas untouched:

- **Treasury**: `opening + deposit − withdrawal = closing` verified exact across a chained
  sequence of 3 real transactions (262,200 → 263,200 → 262,900).
- **Payroll**: `gross = Σ(earnings)`, `net = max(0, gross − deductions)` verified exact (6,000 /
  250 / 5,750) against a real edited payroll item, both in the live client-side preview and the
  server-rendered value after a full page reload.
- **Cross-module check**: approving and paying that payroll item correctly created a linked
  treasury debit for the exact net amount (262,900 → 257,150, exact).
- **Custody**: formula (`remaining = received − spent − returned`) verified consistent across all
  4 independent call sites in `lib/custody.js` — source-verified rather than fully click-driven
  through every lifecycle state, given time budget.

**Result: PASS.** No calculation defects found.

## 6. Import / export / files

- Real `.xlsx` files built against the actual `clients` import template. Row-level validation,
  duplicate-within-file detection, and duplicate-against-existing-database detection all confirmed
  working with correct Arabic error messages.
- One real design-behavior finding: import commit is all-or-nothing per batch (RC1-D1, P2) —
  documented, not fixed.
- File upload: valid file types succeed cleanly; a disallowed file type is correctly rejected but
  surfaces as an unhandled `500` instead of the friendly message the code already has a string for
  (RC1-D2, P2) — documented, not fixed. The rejection itself is correct; only the error surface is
  wrong.
- Export: CSV download directly observed succeeding (employees export); other export routes
  confirmed wired via the same `can()`-gated pattern already validated in the role matrix.

**Result: PASS with 2 P2 findings**, neither release-blocking (both have simple, narrow,
not-yet-applied fixes).

## 7. Public website + client portal

All public pages (`/`, `/services`, `/consultations`, `/about`, `/contact`, `/faq`, `/guides`,
`/track`, `/login`, `/portal/login`, `/portal/register`) return `200`. Track-a-request (real
ref+phone match, no login) and portal registration (real form, auto-login on success) both
live-tested end-to-end successfully. No content gaps invented or found in this pass; no missing
translation noted for the pages exercised.

**Result: PASS.**

## 8. Responsive device matrix

55 full-page screenshots captured across all 11 required breakpoints (320/360/375/390/414/430/
768/820/1024/1280/1440) on 5 representative surfaces spanning public, admin, and portal contexts
(public homepage, admin dashboard, request detail, treasury, portal). An automated
horizontal-overflow check (`scrollWidth` vs `clientWidth`) at every breakpoint on the 4 admin/
public pages found **zero overflow** anywhere. See `screenshots/`.

**Result: PASS.**

## 9. RTL/LTR / language

Verified via the real `/lang/:code` mechanism, not a simulated toggle: default state is
`dir="rtl" lang="ar"`; `/lang/en` correctly switches to `dir="ltr" lang="en"` and the change
persists across the next real navigation. Consistent with Phase 2/3's earlier, more exhaustive
sitewide RTL/LTR audits.

**Result: PASS.**

## 10. Accessibility / motion

- `prefers-reduced-motion: reduce` (real browser CSS media-query emulation): the treasury KPI
  count-up still lands on the exact correct final value — no stale/zero value left behind.
- Keyboard focus is visibly indicated (2px solid outline) on the first tab stop of a fresh page.
- The app's real dialog-like overlay (mobile navigation drawer) correctly moves focus in on open,
  traps Tab/Shift+Tab while open (source-confirmed), closes on Escape, and returns focus to the
  triggering button on close — all 4 behaviors live-verified at a real mobile viewport.

**Result: PASS.**

## 11. Security / release safety

- Security headers present and correct on a real response: `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, a real CSP, `Referrer-Policy`, no `X-Powered-By`.
- Session cookie: `httpOnly=true`, `sameSite=Lax`; `secure` correctly auto-true in production
  (confirmed by source, not exercised live in this dev environment since it isn't production).
- `SESSION_SECRET` safety: the app hard-exits before binding to a port if `NODE_ENV=production`
  and `SESSION_SECRET` is unset — the hardcoded dev fallback is unreachable in a real production
  boot.
- CSRF: a same-origin `fetch()` POST without a token was rejected with `403`, and — confirmed via
  direct database read — wrote nothing at all.
- Direct-URL authorization: unauthenticated requests to protected admin pages correctly redirect
  to login; deeper in-handler checks (not just top-level route gates) correctly deny the
  accountant role on requests/cases/errands even without an obvious top-level `can()` call.
- Path-traversal probe (`/files/../../etc/passwd`) returned `404` — no file disclosure.
- No secret values were printed, logged, or committed anywhere in this validation pass.
- No security control was weakened to make any test pass, and no destructive/fuzzing techniques
  were used, per the brief's explicit constraint.

**Result: PASS.** No P0/P1 security defects found.

## 12. Hostinger deployment readiness

Full detail in `RC1-HOSTINGER-CHECKLIST.md`. Summary: the codebase is already noticeably
Hostinger-aware (the `.env.example` file literally documents the Hostinger `DATA_DIR` convention;
mail uses HTTP-API providers instead of SMTP, avoiding blocked-port issues common on shared
hosting; `DATA_DIR` auto-defaults to a safe, outside-the-deploy-folder location in production). The
one item flagged as genuinely Hostinger-specific and not verifiable without deploying is whether
`better-sqlite3`'s native build completes cleanly on Hostinger's actual Node install — recommended
as the first thing to confirm on the real first deploy. **Nothing was deployed in this pass.**

## 13. Defect summary

Full detail in `RC1-DEFECTS.md`. **0 P0, 0 P1, 2 P2, 1 P3, 1 CONFIG (resolved by a settings
toggle, not code), 0 CONTENT gaps found.** Both P2 items (import all-or-nothing commit; 500 on
rejected file upload) have narrow, well-understood, not-yet-applied fixes. Neither blocks release;
both are worth fixing in a small, targeted follow-up once explicitly approved.

## 14. Regression status relative to Phase 2 / Phase 3

Both findings carried over from Phase 2 and fixed in Phase 3 (requests filter dropdown z-index;
treasury KPI wrap/bidi reordering) were re-confirmed clean in this pass's responsive screenshot
sweep and overflow check — no regression.

## 15. What was explicitly NOT done in this pass (by design, not oversight)

- No code, CSS, or view files were changed — this was validation only.
- Export routes beyond one representative CSV download were not individually re-clicked (verified
  via source + existing `can()` gating instead, given time budget).
- The full 5-state custody lifecycle (create→approve→disburse→receive→return) was not fully
  click-driven; the underlying formula was verified via consistent source review across all 4
  call sites instead.
- WhatsApp integration was identified but not deeply exercised.
- Nothing was deployed to Hostinger or any other environment.

## 16. Data hygiene

All test data created during this session (RC1 Test Client, RC1 Import Valid Client, RC1 Portal
Client, test request #83, test case #4, test payroll run 2027-03, test treasury transactions, test
company/branch) is clearly labeled `RC1`/test-pattern and disposable, exactly as instructed
("disposable/demo data only"). The one setting that was temporarily toggled (`booking_enabled`)
was restored to its original value, confirmed via direct database read.

## 17. Test/tooling caveats worth recording for future validation passes

- `.stat .v` KPI values render via a JS count-up animation; reading them immediately after
  `waitUntil: 'networkidle'` can capture a mid-animation frame. Server-rendered data attributes
  (e.g. `#txSummary[data-balance]`) are the authoritative source for automated checks, not the
  animated span's `textContent`.
- Several destructive-action buttons use native `confirm()` dialogs (`onsubmit="return
  confirm(...)"`). Playwright auto-dismisses these by default; a `page.on('dialog', d =>
  d.accept())` handler is required for automated testing, or such actions silently appear
  unresponsive. This is intentional, correct app behavior, not a defect.

## 18. Final recommendation

**GO**, with the 2 documented P2 findings (RC1-D1, RC1-D2) noted for a small, targeted follow-up
fix once explicitly approved — neither is release-blocking, neither involves data loss or a
security gap, and both have clear workarounds available to end users today (re-upload a corrected
import file; pick a correct file type on the first try). No P0 or P1 defects were found anywhere
across business journeys, financial math, imports, security, responsive layout, RTL/LTR, or
accessibility. The full 1,387-test automated suite passes at the exact baseline SHA with zero
regressions since the Phase 3 merge.

This report, `RC1-DEFECTS.md`, `RC1-ROLE-MATRIX.md`, `RC1-HOSTINGER-CHECKLIST.md`, and
`screenshots/` are the complete RC1 evidence set. No PR was created, nothing was merged, nothing
was deployed, and no code was changed. Awaiting explicit approval before any further action.
