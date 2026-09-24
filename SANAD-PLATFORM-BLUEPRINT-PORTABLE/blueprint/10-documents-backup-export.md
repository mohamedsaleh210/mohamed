# 10 — Document/File System & Backup/Recovery/Export

Source: `routes/upload.js` (344 lines, full), `routes/files.js` (full),
`routes/support-files.js` (full), `lib/access-card-pdf.js` (full),
`lib/backup.js`, `lib/backup-schedule.js`, `lib/branch-archive.js`,
`lib/restore-bootstrap.js`, `routes/admin/settings.js` (backup routes).

## Document/File System

### Upload → validation → storage

Two separate upload surfaces with a shared storage pattern (**tag A**):

- **Guest/client** (`routes/upload.js`, `/upload/:id?t=<token>`) — access
  via a ≥20-char token matching `requests.upload_token` **or** an
  authenticated client session owning the request (reference number alone
  is never sufficient). MIME whitelist: JPEG/PNG/WEBP/HEIC/HEIF/PDF, 15MB/
  file, ≤12 files per POST, ≤40 total per request (enforced by counting
  existing rows, since multer only limits per-call).
- **Staff** (`routes/admin/requests.js` upload section) — separate multer
  config, up to 10 files, adds an `internal` flag (staff-only visibility)
  settable at upload time.

**Random filenames, never the original name, on disk**:
`u${timestamp}-${8 random hex bytes}${ext}` (guest), `s${...}` (staff),
`pause-${...}` (time-pause proof). The original filename is preserved
only in the DB (`original_name` column), never in the filesystem path.

**HEIC→JPEG conversion + downscaling happens server-side**
(`lib/images.js normaliseAll`), deterministic regardless of what a
client's own pre-upload compression did.

**"Requirement gate"**: if the request has pending `requirements` and the
visitor has no client session, they see a forced-registration wall
(`upload_gate.ejs`) instead of the raw upload form — unowned uploads
under a shared link are hard to chase administratively.

**Client self-delete**: only within 48 hours of upload, and only for
`source='client'` documents — staff-uploaded documents can never be
deleted this way.

### Authorization — the single gateway

`GET /files/:fileId` is the **only** path serving uploaded file bytes.
Staff access requires `canSeeRequest`; client access requires owning the
request via `client_id`. Path-traversal defended via
`full.startsWith(UPLOAD_DIR)`. Sets `X-Content-Type-Options: nosniff`,
private cache-control, supports `?download=1` to force attachment.

**Real gap found (not by design)**: this route does **not** check
`documents.internal` — a client who owns the request can currently fetch a
file belonging to a document marked staff-only, because the join never
filters on that column. Portal and guest-tracking queries have the same
gap. Contrast `routes/support-files.js` (support-ticket attachments),
which **correctly** checks its own `internal` flag — the pattern exists
correctly elsewhere in the codebase, it's just not applied consistently
here. **Fix this in any white-label rebuild rather than carrying it
forward.**

### PDF / Print / Excel — the "let the browser print" philosophy

There is **no general server-side PDF-generation library** in the
dependency tree (no pdfkit/puppeteer — only `exceljs` and `sharp`).
Tabular reports and request/case print views are all rendered as
browser-printable HTML (`lib/reporting.js` `print()`/`profileDoc()`),
explicitly because — per the code's own comment — server-side PDF
libraries "famously do not" handle Arabic RTL text shaping correctly.
"Excel" export is, in practice, UTF-8-BOM CSV (`lib/reporting.js csv()`),
except for payroll's genuine `.xlsx` import/export (`lib/payroll-
import.js`, ExcelJS-based, with live formulas and data validation).

The **one** genuine server-generated binary PDF in the whole codebase is
`lib/access-card-pdf.js` (employee access card) — builds an SVG, fetches
a QR code from an external service, rasterizes via `sharp`, then
hand-writes a minimal single-page PDF byte structure. Not a reusable PDF
engine, a one-off.

## Backup / Restore / Export

### Two data roots

- `OFFICE_ROOT` (`DATA_DIR`) — one deployment's own SQLite DB + uploads.
- `PLATFORM_ROOT` (`PLATFORM_DATA_DIR`) — the separate central platform's
  cross-tenant billing/licensing data (only relevant if this deployment
  *is* the central platform, not a normal tenant instance).

### Manual backup — `lib/backup.js`

`createBackup(scope)`: `'office'` (default — snapshots one tenant's DB +
uploads) or `'full'` (office **and** platform root — platform-owner-only,
requires `req.session.platformOwnerAccess`). Uses better-sqlite3's
**online backup API** (`database.backup(to)`) for `.db` files — safe
against a live, open database, not a raw file copy. Manifest:
`{format:'sanad-backup-v1', scope, created_at, version, includes}`.
Uploaded files **are** included (the whole `UPLOAD_DIR` tree is copied,
not just the `.db` file).

### Scheduled backup — `lib/backup-schedule.js`

Settings: `backup_schedule_enabled`, `_frequency` (daily/weekly),
`_weekday`, `_time`, `_retention` (1–60, clamped). `computeNextRun()` is a
**pure function of clock + config**, deliberately not "last run +
interval" — a missed run (server down at 2am) is never caught up, it just
resumes the normal cadence next cycle. Mechanism is an in-process
`setTimeout` (not cron), capped at the 32-bit signed-int ms limit,
`.unref()`'d, rescheduled on boot and on every settings save. Retention
keeps only the newest N `.zip` files by mtime. **Scheduled backups are
always office-scope** — full/platform scope is never auto-scheduled, only
the manual owner-triggered download. "Run Now" runs an ad-hoc office
backup into the same rotation immediately, audited as `backup.manual_run`
(vs. `backup.scheduled_run` for the timer). Backup **history** = the
current status fields + a live directory listing, not a separate DB table.

### Integrity verification / corrupted-backup rejection

`validateDatabases()`: for every `.db` file in an extracted staging dir,
runs `PRAGMA integrity_check` (must be exactly `'ok'`) and `PRAGMA
foreign_key_check` (must return zero rows) in read-only mode. Any failure
aborts the entire restore — nothing is applied, the staged extraction is
deleted. **No separate checksum field is stored in the manifest** —
integrity is verified structurally via SQLite's own PRAGMAs, not a file
hash. `extractSafely()` separately guards against zip-slip (rejects
absolute paths or `..` segments, double-checks the resolved destination
stays inside the target directory).

### Restore — two-phase, applied only on next server start

1. `POST /admin/settings/restore` — upload a `.zip` (1GB limit), must type
   the literal Arabic confirmation phrase "استعادة" (restore) + a ≥5-char
   reason.
2. `scheduleRestore()` — extracts to a staging dir, requires
   `manifest.json` with `format==='sanad-backup-v1'` and a valid scope;
   **the web UI can never trigger a full/platform-scope restore** (`
   allowFull` is hardcoded false at this route — only a more privileged
   path, not present here, could do that). Runs the integrity checks
   above. If all pass, writes a pending-restore marker file
   (`.restore-ready.json`) — only one pending restore can exist at a time.
3. **The restore only takes effect on the next server process start.**
   `server.js` calls `restore-bootstrap.applyPendingRestore()` as
   literally the first thing the process does, before Express or
   migrations run. **This means an admin must trigger or wait for a
   restart** for a scheduled restore to actually apply — an important
   operational detail for any white-label deployment doc.
4. `applyPendingRestore()` — before overwriting the live data directory,
   it **renames** (never deletes) the existing directory into
   `backups/pre-restore-<timestamp>/`, then copies the staged data in.
   **Every restore automatically preserves the prior live data as a
   timestamped rollback snapshot.**

Audit: scheduling a restore logs `backup.restore_scheduled` (scope +
truncated reason). **No audit event is emitted when the restore actually
applies at boot** — that only logs to the console, not `audit_log`. Flag
as a minor gap.

### Branch archive — explicitly NOT a backup

`lib/branch-archive.js` has an extensive doc-comment the code structurally
enforces: a **backup** is a whole-database file-level snapshot,
restorable. A **branch archive** (`createBranchArchive`) is a **read-only,
JSON-based, per-branch data export** — manifest
`format:'sanad-branch-archive-v1'`, `kind:'export'`, explicitly never
restorable.

**Why it can't be restorable**: office branches share one physical
database across all branches (requests/staff/clients/payments are one
table set with cross-branch foreign keys) — there is no safe way to
restore a branch-only slice back into that shared schema without
corrupting data other branches point at. So the export only ever goes one
direction: DB → zip of JSON, never zip → DB.

Contents: JSON dumps of tables that carry a real `office_branch_id`
(`requests`, `legal_cases`, `agenda_events`, filtered directly), plus
`users` for that branch's staff **with `password_hash` explicitly
stripped** ("a business-data export, not a credential dump"), plus
clients/companies/payments scoped via a join through that branch's
requests (so the same client can legitimately appear in more than one
branch's archive). Includes the actual uploaded files for that branch's
documents. The manifest itself warns, in Arabic, that this is "for
reference/documentation — not a copy that can be restored on its own."

**This backup-vs-export distinction (tag A) is exactly the discipline the
extraction instruction asked to preserve — do not ever let a white-label
rebuild's UI describe an export archive as a restorable database backup.**

### Summary table

| Operation | Scope | Restorable? | Files included? | Trigger |
|---|---|---|---|---|
| Manual backup | office or full | yes (office only via UI) | yes | `GET /admin/settings/backup/:scope` |
| Scheduled backup | office only | yes | yes | timer or "Run Now" |
| Restore | office only via UI | applies at next boot | n/a | `POST /admin/settings/restore` |
| Branch archive | one branch | **no — read-only export** | yes (that branch's docs) | `GET /admin/settings/backup/branch/:id` |
