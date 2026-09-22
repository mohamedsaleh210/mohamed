# RC1 — Defect Register

Baseline: `main` @ `0e95c4897b36dd1b50dc87f667e234010ced8f4c`. Evidence-only pass — **nothing in
this document has been fixed**. Every item below was found via live testing with real (disposable)
data or direct source-code reading, never assumed.

Classification legend: **P0** security/data-loss/unusable · **P1** core workflow broken · **P2**
important feature/role/responsive problem · **P3** cosmetic/minor · **CONTENT** missing/placeholder
copy · **CONFIG** environment/setting, not code · **DEFERRED** already known, out of scope to fix
now.

---

## RC1-D1 — Import commit is all-or-nothing per batch

- **Severity**: P2 (important behavior gap vs. the RC1 test requirement; not data-loss, not a
  crash, has a clean workaround)
- **Module / page**: Data import wizard, `ADMIN_PATH/imports` (all 7 entities: requests, cases,
  agenda, clients, companies, branches, employees — same shared code path)
- **Role**: admin (and any role with `imports.*`)
- **Repro steps**:
  1. Build an Excel file matching the real `clients` import template with 3 rows: one fully valid,
     one missing the required `full_name` field, one duplicating the first row's email.
  2. Upload via `ADMIN_PATH/imports` → clients → preview.
  3. Review page correctly flags rows 2 and 3 with per-row Arabic error messages.
  4. Review page renders **no commit button at all** while any row has an error.
- **Expected** (per RC1 brief wording — "verifying valid rows aren't lost when other rows are
  invalid"): the one valid row should be importable even though the other two are rejected.
- **Actual**: `lib/data-import.js` `commitBatch()` — `const bad = checked.filter(x =>
  x.errors.length); if (bad.length) { ...; return {ok:false} }` — rejects the **entire batch**
  when any row has an error. Confirmed live: after the mixed-batch preview, the `clients` table
  row count was unchanged (34 before, 34 after) even though 1 of the 3 rows was fully valid. A
  second test with a clean, single valid row committed correctly and inserted the row.
- **Evidence**: `rc1-clients-mixed.xlsx` test file (scratch), DB row-count before/after, review-page
  HTML showing the flagged errors and the absent commit form.
- **Regression vs. pre-existing**: pre-existing behavior, not introduced by Phase 2/3 (import
  wizard was not touched in either phase).
- **Recommended fix** (not applied — needs explicit approval, touches business logic): either (a)
  commit valid rows and return the invalid ones for correction in the same review screen, or (b)
  keep all-or-nothing by design but make that explicit in the UI copy so it isn't mistaken for a
  bug during acceptance testing. This is a genuine design decision, not an obvious bug — flagging
  for the user's call rather than assuming which behavior is "correct."
- **Release-blocking**: No — the import feature works correctly for clean files, and error
  messages are clear enough that the user experiences a "fix errors and re-upload" loop, not data
  loss or silent corruption.

---

## RC1-D2 — File-type rejection on time-pause proof upload returns an unhandled 500

- **Severity**: P2 (real defect: ungraceful error handling on invalid input; not a security hole,
  not data loss)
- **Module / page**: Request detail → "إيقاف احتساب المدة" (pause duration) proof upload,
  `POST ADMIN_PATH/requests/:id/time-pauses`
- **Role**: any staff role that can reach the request detail page
- **Repro steps**:
  1. Open a request detail page, fill the time-pause reason + note.
  2. Attach a file whose MIME type is not in the allow-list (tested with a `.exe`, arbitrary bytes,
     `application/octet-stream`).
  3. Submit.
- **Expected**: a friendly redirect back to the request with a validation message (the app already
  defines the exact message: `'نوع ملف الإثبات غير مدعوم'` — "unsupported proof file type").
- **Actual**: `HTTP 500`, generic "حصل خطأ" (an error occurred) error page. Confirmed live:
  submitting a valid PNG on the same form returns a clean `302` to `?msg=pause_added`; submitting
  the disallowed file type returns `500` instead of a redirect.
- **Root cause** (source-confirmed, `routes/admin/requests.js`): the `pauseUpload` multer instance
  passes a real `Error` object from its `fileFilter` (`cb(ok ? null : new Error(...), ok)`), but
  the route (`router.post('/:id/time-pauses', loadRequest, pauseUpload.single('proof'), ...)`) has
  no error-handling middleware wrapping the multer call, so the error falls through to Express's
  generic error handler instead of being turned into the friendly redirect the app already has a
  message string for.
- **Security note**: the file is still correctly rejected — never written to disk, never
  referenced in the database — this is purely a UX/robustness gap, not a security issue.
- **Same-shape risk elsewhere**: `staffUpload` (the main document-upload multer instance, same
  file) uses the identical unwrapped-fileFilter-error pattern. Not independently re-tested per
  route this pass (time budget); flagging as the same probable root cause if reproduced elsewhere.
- **Evidence**: captured HTTP status codes (500 vs 302) for bad vs. good file on the same form.
- **Regression vs. pre-existing**: pre-existing (Phase 2/3 did not touch file-upload routes).
- **Release-blocking**: No — recoverable (the user can simply pick a correct file and retry; the
  wrong file is never accepted or stored), but worth fixing given the fix is small and localized
  (wrap the multer call with an error-handling middleware that redirects with `?msg=...`).

---

## RC1-D3 — Convert-to-case quick form can silently fail to submit when service/title is blank

- **Severity**: P3 (cosmetic/minor UX edge case)
- **Module / page**: Request detail → "تحويل إلى قضية" (convert to case)
- **Role**: any role with `cases.create`
- **Repro steps**: create a request via `ADMIN_PATH/requests/new` without selecting a service
  (service selection is not required — only name + phone are). Open the request, expand "تحويل
  إلى قضية," click "إنشاء الملف" without typing a title.
- **Expected/Actual**: the form's `title` input is `required` and pre-filled from
  `reqRow.title || reqRow.service_label`; when both are blank the field is empty, so the browser's
  native HTML5 validation silently blocks the click (no visible error in automated testing; a real
  browser shows the native "fill this field" tooltip, so this is not a hidden failure for a human
  user, just an easy-to-miss first click).
- **Evidence**: DB read confirmed request #83 had `title=NULL, service_id=NULL,
  service_label=NULL` after creation without a service; the convert-to-case click produced no
  network request until the title field was filled manually, after which it worked correctly
  (case #4 created).
- **Regression vs. pre-existing**: pre-existing; not introduced by Phase 2/3.
- **Recommended fix**: default the pre-fill to the request `ref` or client name when
  `service_label` is absent, so the button works on the first click regardless of whether a
  service was chosen at intake.
- **Release-blocking**: No.

---

## RC1-CONFIG-1 — Public online booking disabled by default in seed data

- **Classification**: CONFIG, not a defect.
- **Detail**: `booking_enabled` setting is `'0'` in the demo/seed database; `GET/POST /appointments`
  (guest booking) returns `403` until a manager enables it via `ADMIN_PATH/appointments?tab=settings`.
- **Live-verified**: toggled on via the real settings form → full guest booking flow (slot
  selection, name/phone/email, submit) completed successfully end-to-end, booking appeared
  correctly in the admin appointments list with the guest's name → toggled back off afterward,
  confirmed via direct DB read that the setting was restored to its original value.
- **Action needed**: none from engineering; this is an intentional feature flag the office must
  turn on when ready to accept public bookings. No release-blocking concern.

---

## Notable POSITIVE findings (not defects — recorded because they were explicitly targeted checks)

- **Treasury math**: opening balance → deposit → withdrawal → payroll-pay-from-treasury all
  produced *exact* arithmetic matches across 4 independent live transactions (262,200 → 263,200 →
  262,900 → 257,150). No rounding or double-counting bugs found.
- **Payroll math**: `gross = Σ(earnings)`, `deductions = Σ(deductions)`, `net = max(0, gross -
  deductions)` — verified exact (6000 / 250 / 5750) against a real edited payroll item, both in the
  client-side live preview and the server-rendered value after a full page reload.
- **Custody formula consistency**: all 4 call sites in `lib/custody.js` compute
  `remaining = received - spent - returned` identically — no divergent duplicate logic that could
  drift out of sync.
- **CSRF enforcement**: a same-origin `fetch()` POST without a CSRF token was rejected with `403`
  and, confirmed via direct DB read, **wrote nothing** — not just a UI-level rejection.
- **Security headers**: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a real CSP,
  `Referrer-Policy`, and no `X-Powered-By` fingerprint, all present on a plain page load.
- **Production secret safety**: the app hard-exits (`process.exit(1)`) before binding to a port if
  `NODE_ENV=production` and `SESSION_SECRET` is unset — the hardcoded fallback secret is
  unreachable in a real production boot.
- **Accountant deny-by-default**: `requests`/`cases`/`errands` correctly deny the accountant role
  even though there's no obvious top-level route gate — deeper in-handler checks work as intended
  (verified this is a real, working deny, not an accidental gap).

---

## Summary counts

| Severity | Count |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 2 (RC1-D1, RC1-D2) |
| P3 | 1 (RC1-D3) |
| CONTENT | 0 (none found this pass) |
| CONFIG | 1 (RC1-CONFIG-1, resolved by settings toggle, not code) |
| DEFERRED | 0 new (the two Phase 2/3 carried-over findings — requests filter z-index, treasury
  KPI bidi wrap — were already fixed and verified in Phase 3, and re-confirmed clean in this
  session's responsive/screenshot pass; not re-listed as open) |

**No P0 or P1 defects were found in this validation pass.** Both P2 items have clear, narrow,
low-risk fixes available but were **not applied** per RC1's evidence-only rule — they require
explicit approval before any code change.
