# RC1.1 — Targeted Release Fix Pass Report

**Base SHA**: `0e95c4897b36dd1b50dc87f667e234010ced8f4c` (origin/main, "Phase 3 — Production Polish &
Final Readiness (#6)") — confirmed via `git log -1` immediately before and after all edits; no
other commit landed on `main` in between.
**Branch**: `release/rc1.1-fixes`, created from `origin/main` directly (not from the RC1
documentation branch).
**Scope**: strictly the two live-confirmed RC1 P2 defects (P2-01 import all-or-nothing commit,
P2-02 500 on rejected file upload). No other code was touched.

---

## Files changed

| File | Why |
|---|---|
| `lib/data-import.js` | Root fix for P2-01: `commitBatch()` now imports valid rows and rejects invalid rows independently instead of rejecting the whole batch. |
| `routes/admin/imports.js` | Commit route updated to match the new `commitBatch()` contract (no more "batch changed, start over" branch, which can no longer occur). |
| `views/admin/imports.ejs` | Review screen always offers commit (button reflects the real valid/invalid counts, disabled only when 0 rows are valid); success screen now reports total/imported/rejected/duplicates and lists every rejected row with its reason. |
| `routes/admin/requests.js` | Root fix for P2-02: the `/requests/:id/time-pauses` proof upload now wraps `multer` the same way the sibling `/requests/:id/documents` route already does, turning a file-type/size rejection into a friendly redirect instead of an unhandled 500. |
| `views/admin/request_detail.ejs` | Renders the friendly message for the two new redirect codes (`pause_bad_type`, `pause_too_big`) using the app's existing `.alert.err` pattern (same one already used for `bad_custody_balance`). |
| `import-test.js` | New permanent regression coverage for P2-01 (18 new checks). |
| `edge.js` | New permanent regression coverage for P2-02 (10 new checks). |

No other file was modified. `git diff --stat` on the branch shows exactly these seven files plus
the new `design-review/release-candidate/` evidence directory.

---

## P2-01 — Import partial success

### Root cause

`lib/data-import.js`, `commitBatch()` (line ~299 at baseline):

```js
const bad=checked.filter(x=>x.errors.length);
if(bad.length){ ...; return {ok:false} }
```

If *any* row in the batch failed validation, the function returned before the insert transaction
ever ran — so a single bad row among 500 good ones threw away all 500. The review page's commit
button was also only rendered `<% if(!batch.error_rows){ %>`, so the UI didn't even offer a way to
attempt a commit once any row had an error.

### Implementation

`commitBatch()` now:
1. Re-validates every row fresh at commit time (unchanged — this already caught in-file
   duplicates and duplicates against the database; it now also naturally covers a row that
   became invalid between preview and commit, which used to be a separate "batch changed" error
   path that no longer exists).
2. Splits rows into `good` (no errors) and `bad` (has errors).
3. Runs the insert transaction over `good` only — `bad` rows are never written, not even
   partially.
4. The tenant-quota check (`tenantPolicy.allowance`) now counts only the rows that will actually
   be inserted, not the whole file.
5. Returns a result shape with `total`, `imported`, `rejected`, `duplicates` (a sub-count of
   `rejected` whose error text is a duplicate-in-file or duplicate-in-system message), and
   `rejectedRows` (`{ rowNumber, errors }` for every rejected row — nothing is ever summarized
   away).
6. The batch is still marked `completed` afterward (even when 0 rows were valid), so the same
   batch token can never be committed twice — this is what "valid rows are committed exactly
   once" means in practice: re-submitting the same reviewed batch throws `تم تنفيذ عملية الاستيراد
   من قبل` rather than re-inserting anything.

`routes/admin/imports.js`'s commit handler was updated to match: it no longer branches on
`outcome.ok === false` (that branch is now unreachable — `commitBatch` only ever throws for a
structural problem, such as the batch already being committed or a quota being exceeded, both of
which existed before this fix and are unchanged).

`views/admin/imports.ejs`: the commit button is now always present while the batch is in review,
labelled with the real valid/invalid split (e.g. "اعتماد وحفظ 1 سجل صحيح (ورفض 2)"), and disabled
only when there are zero valid rows to import. The success screen was rewritten to show the full
total/imported/rejected/duplicates breakdown and a table of every rejected row with its row
number and reason(s) — visible proof that no row was silently dropped.

### Before / after behavior

| Scenario | Before | After |
|---|---|---|
| Mixed valid + invalid file | Whole batch rejected; 0 rows imported | Valid rows imported; invalid rows listed with reasons; nothing silently dropped |
| Duplicate within file | Whole batch rejected | First occurrence imports, later occurrence(s) rejected with "مكرر داخل الملف" |
| Duplicate against database | Whole batch rejected | Colliding row rejected with "موجود مسبقًا في النظام"; other rows still import |
| Missing required field | Whole batch rejected | That row rejected with the specific field message; others still import |
| Malformed value (bad email) | Whole batch rejected | That row rejected with "صيغة غير صحيحة"; others still import |
| Zero valid rows | Whole batch rejected (same outcome) | Explicit "0 imported / N rejected" result, not silently rejected — same net effect (nothing written) but now with a clear reason per row instead of a generic "needs correction" message |
| Re-committing the same batch | N/A (batch could never reach `completed` with any bad row) | Second commit attempt throws "تم تنفيذ عملية الاستيراد من قبل" — no double-import |

### Tests added (`import-test.js`, all passing)

18 new checks covering exactly the required matrix (A–H) plus explicit assertions that: the one
fully-valid file imports everything; the mixed batch imports precisely the valid rows and no
others; the exact DB row count after commit equals `result.imported`; a rejected row can carry
more than one independent error at once; every rejected row's Excel row number is reported; and a
batch cannot be committed twice.

### Live Playwright verification

Ran against the real running app (not the isolated test-harness), through the actual browser UI:

1. Built a real `.xlsx` (valid row / missing-name row / in-file duplicate) via `exceljs`, uploaded
   it through `ADMIN_PATH/imports` as `adam` (admin).
2. Preview correctly showed the "some rows have errors" warning and a commit button labelled
   "اعتماد وحفظ 1 سجل صحيح (ورفض 2)".
3. Clicked commit. Result screen showed "من إجمالي 3 صف: أُضيف 1 سجل إلى النظام، ورُفض 2 (منها 1
   بسبب التكرار)" and a rejected-rows table listing Excel row 3 ("الاسم الكامل مطلوب") and row 4
   ("البريد الإلكتروني: مكرر داخل الملف").
4. Direct database read confirmed exactly one new client row, with the correct data, and
   confirmed the missing-name row was never written.
5. Re-uploading the same content a second time correctly showed 0 valid rows (the previously-valid
   email is now a database duplicate) with the commit button disabled — this incidentally exercised
   the zero-valid-rows UI state live as well.

Screenshots saved: `design-review/release-candidate/rc1.1-evidence/import-preview-partial.png`,
`import-result-partial.png`, `import-preview-zero-valid.png`.

---

## P2-02 — Invalid file upload returns 500

### Root cause

`routes/admin/requests.js`, the `pauseUpload` multer instance's `fileFilter` correctly rejects
disallowed file types with a real `Error` object carrying a friendly Arabic message
(`'نوع ملف الإثبات غير مدعوم'`), but the route mounted it as plain middleware:

```js
router.post('/:id/time-pauses', loadRequest, pauseUpload.single('proof'), csrf.verifyDeferred, (req,res)=>{ ... });
```

When multer's `fileFilter` (or its `limits.fileSize`) rejects a file, it calls `next(err)`. With no
error-handling middleware in this specific chain, that error fell straight through to Express's
generic handler, producing an unhandled `500`. Confirmed directly from a captured stack trace in
the server log before the fix:

```
Error: نوع ملف الإثبات غير مدعوم
    at fileFilter (/home/user/mohamed/routes/admin/requests.js:668:20)
    at wrappedFileFilter (.../multer/index.js:45:7)
    ...
```

The sibling route two dozen lines below, `/requests/:id/documents` (using the `staffUpload`
multer instance), already avoided this exact problem by manually invoking multer with an explicit
callback:

```js
staffUpload.array('files', 10)(req, res, (err) => {
  if (err) { const code = err.code === 'LIMIT_FILE_SIZE' ? 'too_big' : 'bad_type';
    return res.redirect(`${req.adminPath}/requests/${req.params.id}?msg=${code}`); }
  next();
});
```

### Implementation

`pauseUpload.single('proof')` is now invoked the same way — as a plain function call with its own
`(err) => {...}` callback — instead of being mounted directly as router middleware. A file-type
rejection or size-limit rejection now redirects to `?msg=pause_bad_type` / `?msg=pause_too_big`
(distinct codes from the sibling route's `bad_type`/`too_big`, since the two forms have different
allowed-type lists and different existing Arabic wording — this preserves each route's own
established message rather than collapsing them into one generic string).

`views/admin/request_detail.ejs` gained two lines rendering those two codes via the page's
existing `.alert.err` pattern (the exact class already used for `bad_custody_balance` — no CSS was
added or changed), so the message the fileFilter already defined is now actually shown to the
user instead of being swallowed by a generic error page.

**Nothing about the allow-list, size limits, or permission checks changed.** `staffUpload` (the
already-correct sibling route) was not touched.

### Before / after behavior

| Scenario | Before | After |
|---|---|---|
| Allowed file type | 302 redirect, `msg=pause_added` | Unchanged |
| Disallowed extension | **Unhandled 500** | 302 redirect, `msg=pause_bad_type`, friendly banner shown |
| Oversized file (>10 MB) | **Unhandled 500** | 302 redirect, `msg=pause_too_big`, friendly banner shown |
| Spoofed MIME (bytes don't match declared type) | Accepted (filter trusts declared MIME) | **Unchanged** — documented, not a new gap, not in scope to fix |
| Empty upload (no file — the field is optional) | Worked | Unchanged |
| Unauthorized role (no access to the request) | 403 before reaching upload code | Unchanged — verified the permission gate (`loadRequest` → `canSeeRequest`) still runs first |
| Authorized valid upload | Stored, linked to the row | Unchanged, re-verified end to end |

### Tests added (`edge.js`, all passing)

10 new checks in a new "رفع إثبات إيقاف المدة" section: allowed type, disallowed type (asserts
`status !== 500` *and* the correct redirect), spoofed-MIME documentation check, oversized file,
empty/optional upload, unauthorized-role denial (target request looked up dynamically so it does
not depend on exact seed-data shuffling), and an end-to-end check that a valid upload is actually
persisted and linked to a `request_time_pauses` row (not just that the redirect looks right).

### Live Playwright verification

Against the real running app: submitted a `.exe` file to `/office-panel/requests/84/time-pauses`
as `adam`. Response was `302` to `...?msg=pause_bad_type` (previously `500`). The resulting page
rendered the banner "نوع ملف الإثبات غير مدعوم. الصور (JPG, PNG, WEBP) و PDF فقط." — the app's own
existing message, now actually visible. Screenshot saved:
`design-review/release-candidate/rc1.1-evidence/upload-bad-type-friendly-message.png`.

---

## Full regression run (this branch, after both fixes)

| Suite | Before this pass (RC1 baseline) | After this pass |
|---|---|---|
| `npm test` (`test.js`) | 974 / 974 | 974 / 974 |
| `npm run integration` | 74 / 74 | 74 / 74 |
| `npm run edge` | 178 / 178 | **188 / 188** (+10 new) |
| `npm run security` | 138 / 138 | 138 / 138 |
| `npm run test:imports` | 21 / 21 | **39 / 39** (+18 new) |
| `npm run test:payroll` | 2 / 2 | 2 / 2 |
| **Total** | **1387 / 1387** | **1415 / 1415** |

All 28 new checks (10 + 18) are net-new permanent regression coverage for the two fixes; every
pre-existing check still passes unchanged. Zero failures anywhere.

## Confirmation no unrelated behavior changed

- `git diff --stat` on the branch touches exactly the 7 files listed above — no route, view,
  migration, or permission file outside the two defects' direct code paths was modified.
- The `staffUpload`/`/documents` upload route (P2-02's already-correct sibling) is byte-for-byte
  unchanged.
- All CSRF, permission (`can()`/`loadRequest`/`canSeeRequest`), and file-type allow-lists are
  unchanged — verified live (CSRF still rejects a token-less POST elsewhere in the app, unrelated
  routes unaffected) and via the full security suite (138/138 unchanged).
- No CSS file was touched; the two new message lines in `request_detail.ejs` reuse the existing
  `.alert.err` class, and the import result screen reuses the existing `.alert.ok` / `.alert.warn`
  / `.alert.danger` / `.table-wrap` / `.tbl` classes already used elsewhere on the same page.
- No import template, field list, or field meaning changed — `DEFINITIONS` in
  `lib/data-import.js` is untouched; only the commit-time behavior around already-validated rows
  changed.
- No database schema change.
- No production data was touched — all verification used disposable, clearly-labelled test data
  (`RC1.1 Live Valid`, `RC1.1 Screenshot Valid`, `rc1-badfile.exe`, etc.) against the same
  long-running local dev instance used throughout RC1.

## GO / NO-GO recommendation for Hostinger Staging

**GO.** Both P2 defects are fixed at their root cause with minimal, localized diffs; the fixes
reuse patterns already established elsewhere in the same files (the `staffUpload` error-handling
shape, the `.alert.err` message pattern); the full 1,415-check regression suite passes with zero
failures; and live browser verification confirms both workflows end-to-end against the real
running application, not just the automated suites. No security control, permission check, or
unrelated business logic was touched. Nothing was deployed as part of this pass — this branch is
ready for a maintainer to review and, on approval, proceed toward Hostinger Staging.

Branch `release/rc1.1-fixes` has been committed and pushed. **No PR was created, nothing was
merged, and nothing was deployed**, per instruction. Awaiting explicit approval.
