# 12 — Notifications & Full Settings Inventory

Source: `lib/notify.js` (197 lines, full), `lib/deadlines.js` (full),
`lib/mailer.js` (full), `lib/sms.js` (full), `lib/emails.js`, a repo-wide
grep of every `getSetting`/`setSetting`/`getBool` call (133 occurrences,
22 files).

## Notification architecture

**One always-on channel; two narrowly-scoped ones. Tag A for the
mechanism, tag G for the specific providers.**

- **In-app** (`notifications` table) — the only channel used for
  staff-to-staff/system-to-staff alerts. This is where virtually every
  trigger below actually lands.
- **Email** (`lib/mailer.js`) — providers `resend` or `brevo`, or a local
  `outbox` fallback (writes `.html` files to `DATA_DIR/mail-outbox` +
  console log) used whenever no API key is configured, so the whole flow
  is testable without a live provider. Every send logged to `mail_log`
  with 2 automatic retries (4s/8s backoff). `smtp` is a defined-but-
  unimplemented provider option (throws "needs nodemailer").
- **SMS** (`lib/sms.js`) — a provider-neutral webhook. **Used in exactly
  one place in the entire codebase**: the employee access-card SMS send.
  There is no client-facing SMS anywhere (no booking/request SMS
  confirmations) — worth noting since "SMS notifications" might sound
  more built-out than it is.
- **WhatsApp**: not a real integration — only a `wa.me` deep-link
  (`site.whatsapp` setting) used for contact CTAs, not a notification
  channel.

### Trigger inventory (by source file)

| Trigger | File | Priority/audience note |
|---|---|---|
| New public request | `routes/public.js` | excludes lawyers (only staff/supervisors/admins hear about a brand-new unassigned request — a documented fix for offices that missed email-only alerts) |
| Status change, critical flag, deadline change, staff upload, assignment, comment, erasure | `routes/admin/requests.js` | assignment → the new assignee only; erasure → admins only, always `critical` |
| Client document upload | `routes/upload.js` | distinguishes "answered a requirement" vs generic |
| Payment / full settlement / void | `routes/admin/revenue.js` | **excludes lawyers, includes accountants** — deliberate money-visibility split matching the permission model |
| Client/request hard-delete | `routes/admin/client.js`, `routes/admin/settings.js` | admins only, always `critical` |
| Case assignment/hearing/task/activity | `routes/admin/cases.js` | broadcast to case team, excluding the actor |
| New device (staff login) | `routes/admin/auth.js` | admins only, `critical` |
| Errand/trip assignment | `routes/admin/errands.js` | — |
| Custody disbursed & ready to receive | `routes/admin/expenses.js` | `high` |
| Every booking create/change | `lib/bookings.js` `history()` | writes to **four** places at once: `booking_history`, `audit_log`, `booking_client_notifications` (client-visible), and `notifications` (staff) — audience = old+new assignee, plus every admin/supervisor on creation specifically, so an unassigned booking pages the whole management team to go claim it |

### The one scheduled job — `lib/deadlines.js`

Started once at boot (~20s delay, then nightly, 6h backstop interval).
Two watches:

1. **Overdue deadlines** — open, non-archived requests past `deadline`,
   not already alerted *today* → `critical`, re-announced once per
   calendar day for as long as it stays open. Rationale in the code: a
   missed deadline "gets worse purely by going unnoticed."
2. **Unclaimed requests** — open requests with zero `request_assignees`
   rows, waiting ≥2 days → admins+supervisors, `critical` if ≥5 days else
   `high`, but **only once ever per request** (checked, not re-fired
   daily) — "a second reminder about the same forgotten file trains
   people to dismiss the first."

Both rationales are genuinely good notification-design principles worth
carrying into a white-label rebuild as documented conventions, not just
copied code.

### `lib/notify.js` internals

`audienceFor(requestId, {excludeUserId, includeLawyers, includeAccountants})`
— base audience always active admin+supervisor, then opt-in
lawyer/accountant inclusion per call site, matching the same
money/case-visibility split used elsewhere. `notifyAdmins()` is a
separate, narrower helper (admins only, always critical) reserved for
destructive/erasure events specifically. Housekeeping: reads older than 30
days are purged, and any one user's history is trimmed to 500 rows
(oldest-read-first) — **unread notifications are never auto-deleted.**

## Full settings inventory

All keys live in one generic table: `settings(key TEXT PRIMARY KEY, value
TEXT)`, accessed via `getSetting(key, default)` / `setSetting(key, value)`
/ `getBool(key, default)`. **This flat key-value shape itself is tag A** —
simple, reusable, but with no per-tenant namespacing built in (fine for
single-tenant-per-deployment, would need a rethink for true shared-DB
multi-tenancy).

### Site / Brand — tag E/F (values), tag A (mechanism)

| Key | Default | Purpose |
|---|---|---|
| `site_name_ar` / `site_name_en` | 'سند' / 'Sanad' | Brand name, used site-wide + email footer |
| `tagline_ar` / `tagline_en` | seeded | Public tagline |
| `whatsapp` | '' | Floating contact button number |
| `currency` | 'EGP' | Display currency code (single-currency system — see `09-financial-system.md`) |
| `site_domain` | '' | Base URL for OAuth redirects and absolute email links |
| `office_hours_ar/en`, `office_address_ar/en`, `office_map_url` | '' | Public contact page content |
| `office_emails` | '' | Comma-list, internal new-request alert recipients |
| `staff_id_required` | '1' | Whether staff onboarding requires an ID photo |
| `scope_services_by_page` | on | Whether the public request form scopes services to the arrival page |

### AI Assistant — tag B/D — full detail in `11-ai-assistant.md`

`ai_enabled`, `ai_provider`, `ai_model`, `ai_api_key` (write-only),
`ai_system_instructions`, `ai_welcome_message`, `ai_allowed_roles`,
`ai_data_sources`, `ai_audit_log`, `ai_retention_days`, `ai_temperature`,
`ai_max_tokens`.

### Backup — tag B/D — full detail in `10-documents-backup-export.md`

`backup_schedule_enabled`, `backup_schedule_frequency`,
`backup_schedule_weekday`, `backup_schedule_time`,
`backup_schedule_retention`, plus status-only fields written by the job
itself: `backup_schedule_last_run_at/status/error`.

### Content Protection — tag B/D — full detail in `02-public-website-blueprint.md`

`content_protection_enabled`, `_block_select`, `_block_drag`,
`_block_contextmenu`, `_watermark_enabled`, `_watermark_text`,
`_watermark_opacity`. Gated by its own dedicated permission
(`content_protection.manage`), not the generic `settings.manage`.

### Notification / Mail / SMS — tag G

`mail_provider` (default 'resend'), `mail_api_key` (write-only),
`mail_from_name`, `mail_from_email`, `mail_reply_to`,
`notify_email_enabled`, `sms_api_url`/`sms_api_key`/`sms_sender`
(env-var-fallback), `booking_enabled`.

### Security / Identity / Platform — tag G/H

`google_client_id`, `google_client_secret` (write-only),
`owner_account_initialized_v1` (one-time bootstrap guard — see
`05-roles-permissions-security.md`'s Super Admin section),
`platform_entitlements` (JSON — see `04-company-branch-tenant-model.md`).

### Environment variables (not in the `settings` table, but equally load-bearing)

`SESSION_SECRET`, `DATA_DIR`, `PLATFORM_DATA_DIR`, `ADMIN_PATH`,
`SEED_DEMO`, `TENANT_ID`, `PLATFORM_ADMIN_USERNAME`,
`PLATFORM_ADMIN_PASSWORD`. See the repo's own `DEPLOY.md`/`.env.example`
for the deployment-time meaning of each.

### A reusable convention worth keeping: write-only secrets

`ai_api_key`, `mail_api_key`, `google_client_secret` all follow the same
pattern: the settings GET route **never** sends the stored value back to
the browser (only a derived `<key>_set` boolean); an empty submitted field
on save means "leave unchanged"; clearing requires an explicit separate
checkbox (`ai_clear_key`, etc.), not just blanking the field. **Tag A** —
carry this convention into any white-label settings UI handling secrets.
