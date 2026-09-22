# RC1 — Hostinger Deployment Readiness Checklist

**Documentation only. Nothing was deployed.** All items below are source-verified from this
repository at `main` @ `0e95c4897b36dd1b50dc87f667e234010ced8f4c`.

## 1. Node runtime

- `package.json` → `"engines": { "node": ">=18" }`.
- Start command: `npm start` → `node server.js` (equivalently `node server.js` directly).
- No build step: `"build": "echo \"no build step — Sanad renders on the server\""` — this is a
  server-rendered EJS app, nothing to compile for the front end.

## 2. Install / start commands (for Hostinger's Node app setup)

- Install: `npm install` (production dependencies only if Hostinger's panel offers that option).
- Start: `node server.js` (or `npm start`).
- **Native module risk**: `better-sqlite3` is a **required** dependency and needs a native binary
  matching the exact Node ABI/OS/arch. This is the single most likely Hostinger-specific
  installation risk — confirm `npm install` completes cleanly on Hostinger's actual Node version
  before relying on the deployment. `sharp` and `heic-convert` (image processing) are
  **optionalDependencies** — by design, a failed native build for these does not fail the whole
  `npm install`.

## 3. Environment variables (from `.env.example`, values redacted, names real)

| Variable | Required in production? | Notes |
|---|---|---|
| `NODE_ENV` | Yes (`production`) | Gates the SESSION_SECRET hard-exit and secure-cookie default. |
| `PORT` | No on Hostinger/Railway | Comment in `.env.example` says these platforms assign it automatically — do not set. |
| `SESSION_SECRET` | **Yes** | App refuses to boot in production without it (`process.exit(1)`, verified this session). Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. |
| `PLATFORM_SESSION_SECRET` | Only for the multi-tenant platform layer | Must differ from `SESSION_SECRET`. |
| `PLATFORM_ADMIN_USERNAME` / `PLATFORM_ADMIN_PASSWORD` | Only on first production run of the platform layer | Not applicable to a single-tenant deployment. |
| `PLATFORM_COOKIE_SECURE` | Platform layer only | — |
| `ADMIN_PATH` | Recommended to change | Defaults to `/office-panel`; app warns (non-fatal) at startup if left default in production. |
| `DATA_DIR` | **Strongly recommended** | Must point **outside** the deployed project folder or data is lost on every redeploy. `.env.example` gives the exact Hostinger convention: `/home/<username>/sanad-data`. If unset in production, the app auto-defaults to `~/sanad-data` and even auto-migrates an old in-folder database on first boot — but setting it explicitly is safer and matches the documented convention. |
| `PLATFORM_DATA_DIR` | Platform layer only | — |
| `PLATFORM_PORT` | Platform layer only | — |
| `SEED_DEMO` | **Must be `0` (or unset) in production** | `1` mixes demo clients/requests into the real database; app warns (non-fatal) if left on in production. |
| `DISABLE_TENANT_LAUNCHER` | Only if the host can't run tenant workspaces as subprocesses | Not applicable to a single-tenant deployment. |

No secret *values* are recorded in this checklist or anywhere in the RC1 evidence set — only
variable names and whether they're required, per the RC1 brief's explicit instruction.

## 4. Database / storage location

- Engine: `better-sqlite3` (embedded, single file) — confirmed unconditional `require` in
  `db/index.js`, not conditional on a `pg`/Postgres path (the `pg` package in `package.json` is
  present but not wired into `db/index.js`'s primary path in this codebase state).
- Location: `DATA_DIR/sanad.db`. `db/index.js` resolves `DATA_DIR` with production-aware defaults
  (see above) and includes a one-time, non-destructive auto-migration (`fs.cpSync`, copy not move)
  if it finds an old in-project database and an empty safe location.
- Uploaded files live under the same `DATA_DIR` (not a separate path), inheriting the same
  outside-the-deploy-folder safety guarantee.

## 5. Reverse proxy / base URL

- `app.set('trust proxy', 1)` is set (comment: "behind Railway/Render/nginx, so req.ip is the real
  client") — correct for Hostinger's reverse-proxy setup so client IPs and secure-cookie detection
  work correctly behind TLS termination.
- Public base URL used in outgoing links (emails, share links) comes from the `site_domain`
  application setting or the `SITE_URL` env var — not hardcoded to `localhost`.

## 6. HTTPS

- Session cookie `secure` flag automatically becomes `true` in production (confirmed this
  session: `sessionCookieSecure = SESSION_COOKIE_SECURE==='true' || (SESSION_COOKIE_SECURE!=='false'
  && NODE_ENV==='production' && !TENANT_ID)`).
- **This means the production deployment must actually be served over HTTPS**, or browsers will
  silently drop the secure session cookie and logins will not persist. Hostinger provides free SSL
  (Let's Encrypt) — must be enabled and the app must be reached via `https://` before go-live.
  Not independently verified here since nothing was deployed.

## 7. Session / cookie requirements

- `express-session` with a SQLite-backed store (`SqliteStore`), stored inside `DATA_DIR` — no
  external Redis/memcached dependency required, which simplifies shared/managed hosting.
- Cookie name is tenant-scoped when `TENANT_ID` is set (`sanad.tenant.<id>.sid`), otherwise
  `sanad.sid`.
- `httpOnly: true`, `sameSite: 'lax'` always; `secure` per the HTTPS note above.

## 8. SMTP / email

- **Not SMTP-based.** `lib/mailer.js` uses HTTP-API email providers (Resend or Brevo, selected via
  the `mail_provider` application setting) — this avoids the common shared-hosting problem of
  outbound SMTP ports (25/465/587) being blocked or rate-limited.
- Until a provider API key + from-address are configured (via Settings, not an env var), mail
  falls back to a local "outbox": each message is written as a viewable `.html` file under
  `DATA_DIR/mail-outbox` rather than actually sent — safe default for a fresh deployment, but must
  be switched to a real provider before go-live if email delivery (confirmations, notifications)
  is needed.

## 9. WhatsApp integration

- References found in `lib/i18n.js`, `lib/emails.js`, `routes/admin/settings.js`,
  `routes/admin/contacts.js` — based on the surrounding code shape this appears to be a
  click-to-chat (`wa.me`) link integration rather than a server-side WhatsApp Business API
  requiring its own credentials/webhook. Not deeply re-verified this pass (time budget); no
  indication of a Hostinger-specific blocker either way.

## 10. Backups

- `backups/` is correctly excluded from git (`.gitignore`, reconfirmed in RC1-1 baseline).
- No automated scheduled-backup mechanism was found in the application code itself. Recommend
  either Hostinger's own account-level backup feature, or a cron job that snapshots `DATA_DIR`
  (which contains the entire database + all uploaded files, per the design above) on a schedule.
  This is an operational/infrastructure item, not a code defect.

## 11. Logs

- The app logs via plain `console.log` / `console.warn` / `console.error` to stdout/stderr — no
  dedicated log file, rotation, or structured-logging library in the dependency list. Relies on
  whatever process manager Hostinger's Node hosting uses to capture and retain these streams.

## 12. Health-check URL

- No dedicated `/health` or `/healthz` route exists in the codebase.
- **Recommendation**: use `GET /` (the public homepage) as the health-check target for Hostinger's
  uptime monitor — it renders through the full request pipeline including DB-backed settings/
  services queries, so a `200` there is a meaningful signal that both the app process and the
  database are functioning, not just that a bare port is open.

## 13. Anything identified as specifically risky on Hostinger

1. **`better-sqlite3` native build** — the one item most likely to need hands-on attention during
   the actual first deploy; not testable without deploying, which RC1 explicitly does not do.
2. **HTTPS must be live before go-live** — secure cookies will otherwise silently break login
   persistence, with no obvious error message pointing at the cause.
3. **`DATA_DIR` must be set (or the auto-default must be verified to land in a persistent
   location)** — Hostinger's specific home-directory layout should be checked once, since the
   auto-default logic assumes a writable, stable home directory outside the deployed code folder.
4. **`SEED_DEMO` and default `ADMIN_PATH`** must be explicitly turned off/changed for the real
   production tenant — both already produce non-fatal startup warnings if forgotten, but should be
   checked deliberately rather than relied upon.

Nothing above was deployed, changed, or tested against an actual Hostinger environment — this is a
documentation-only readiness checklist built entirely from reading the existing, already-merged
source code.
