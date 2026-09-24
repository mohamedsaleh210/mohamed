# 05 — Roles, Permissions & Security Model

Source: direct reading of `lib/permissions.js`, `middleware/auth.js`,
`lib/csrf.js`, `lib/entitlements.js`, `lib/license.js`, `lib/tenant-policy.js`,
`lib/access.js`, `lib/audit.js`, `lib/throttle.js`, `lib/session-store.js`,
`lib/password.js`, `lib/password-reset.js`, `lib/security.js`,
`routes/admin/auth.js`, `routes/unified_login.js`, `routes/admin/users.js`,
and `server.js`'s middleware chain. **Tag A/H** throughout unless noted.

## The permission model: role defaults + per-user exceptions

**Core Platform DNA.** A role (`users.role`: `admin`, `supervisor`, `lawyer`,
`accountant`) supplies a *default* permission set; `user_permissions` rows
store only the *deltas* — a grant above the default or a revoke below it.
Changing a role's defaults retroactively affects every user not
individually overridden. Client accounts (`clients` table) are entirely
separate from this system — they have no role/permission concept, only
request/booking ownership.

**Super Admin is not a 5th role.** It's `role === 'admin'` AND
`users.is_super_admin = 1` — a boolean flag, not a role string. This was a
deliberate design choice (migration `057_super_admin.js`'s own comment):
renaming `admin` to a new role string would have broken every hardcoded
`role === 'admin'` check across the codebase, so a flag on top was safer.
`isSuperAdmin()` bypasses the role/override system entirely — `resolve()`
returns the full permission set immediately, no DB lookup of overrides.

### The permission catalogue

~70 keys across 11 groups (`requests`, `cases`, `money`, `expenses`,
`performance`, `payroll`, `clients`, `errands`, `agenda`, `support`,
`content`) plus a separate `admin` group and a deliberately-isolated
`erase` group (`clients.erase`, `requests.erase` — permanently destroys
data, never in any role's default, must be granted explicitly per person).
Every key carries an Arabic label and often a consequence note (e.g.
`users.manage` is flagged "dangerous — holder can grant themselves
anything"; `custody.reverse` is flagged "high-risk financial").

| Role | Default shape |
|---|---|
| `admin` | Every key except the `erase` group |
| `supervisor` | Broad operational access (requests/cases/money/expenses/clients/errands/agenda/support/content, activity/security viewing) but NOT `users.manage`, NOT `settings.manage`, NOT erase |
| `lawyer` | Narrow — own-file editing, NOT `requests.view_all` ("a lawyer sees their own files" per code comment), custody/expense self-service, case work |
| `accountant` | Money/treasury/expenses/custody/performance/payroll — no request or case editing access |

### Enforcement mechanics (why this is a real boundary, not just UI hiding)

- `can(permission)` middleware (`middleware/auth.js`): redirects
  unauthenticated to login, otherwise checks `req.userCan(permission)` — a
  closure built fresh on every request from `permissions.resolve(db,
  freshUserRow)`, i.e. **permissions are re-resolved from the database on
  every request, never cached in the session.** A permission or role change
  takes effect on the user's very next click. (A documented past bug: a
  `Set` doesn't survive session-store JSON serialization, so abilities are
  never written into `req.session.user` — only a per-request `req.user`
  copy.)
- Coarse role gates (`requireAdmin`, `requireAccounting`, `requireStaff`,
  `requireSupervisor`) are layered *alongside* the fine-grained `can()`
  checks on many routes — belt-and-suspenders, not either/or.
- `describe(db, user)` powers the admin permissions-management screen's
  3-state UI (role default / added / removed) — the UI reflects the real
  resolved state, not a separate config.

### Delegation rules when editing another user's permissions

(`POST /:id/permissions`, `routes/admin/users.js`, gated `users.manage`)

- A Super Admin target has nothing to edit — the tier is unconditional.
- Only a Super Admin can trim a *regular admin's* permissions, and never on
  their own account.
- **Delegation ceiling**: a non-Super-Admin actor granting an ability
  *above* the target's role default can only grant abilities the actor
  themselves already holds. Super Admin has no ceiling. Taking away a
  default ability is never capped by this rule.
- Every change is audit-logged with a human-readable Arabic diff
  (`+ label` / `− label`).

## Super Admin anti-lockout — layered, redundant protections

**Tag H, core to any multi-admin system.** All in `routes/admin/users.js`:

1. **Deactivation** (`POST /:id/toggle`): self-deactivation blocked; a
   regular admin cannot deactivate a Super Admin at all; deactivating the
   *last active* `role='admin'` account is refused; deactivating the *last
   active* `is_super_admin=1` account is refused **even if other regular
   admins remain** ("otherwise nobody could configure an admin's
   permissions or promote a new Super Admin ever again" — code comment).
2. **Role/flag edit** (`POST /:id`): nobody can change their own role
   through this form, at any tier. Moving a user into/out of the `admin`
   tier requires a Super Admin actor. The `is_super_admin` flag can only be
   *set* by an existing Super Admin, only onto someone else, and the core
   check — stripping Super Admin status from the last remaining Super
   Admin is refused outright, even when the actor is another Super Admin.
   Every promotion/demotion is separately audit-logged
   (`user.super_admin_promote`/`demote`).
3. **Permissions**: unconditional for Super Admin, so nobody can strip
   abilities via the permissions screen (only via the role-tier path
   above, which has its own last-one-standing guard).

Net guarantee: at least one active `role='admin'` and at least one active
`is_super_admin=1` account always exists, enforced redundantly at two
endpoints, with cross-tier and self-service exclusions layered on top.
**This entire anti-lockout mechanism is Core Platform DNA (A/H)** — any
white-label variant keeping the Super Admin concept must keep these
guarantees; they are not cosmetic.

## Authentication

**Two login entry points, deliberately unified in protection level but
different in feature depth:**

- `routes/admin/auth.js` (`POST {ADMIN_PATH}/login`) — full-featured staff
  login: throttle check, single generic error for both "no such user" and
  "wrong password" (prevents username enumeration), session regeneration
  (anti session-fixation), `security.record()` (login_history row incl.
  posted geolocation) **and** `security.rememberDevice()` — new-device
  fingerprint triggers a `critical`-priority in-app alert to every other
  active admin.
- `routes/unified_login.js` (`POST /login`, public-facing) — checks staff
  by username/email/phone, falls through to `clients` by email/phone.
  Shares the same throttle counter and calls `security.record()`, but does
  **not** call `rememberDevice()` — so this entry point never triggers the
  new-device admin alert (a real, documented gap, not by design intent —
  the code comment notes this path used to have no protection at all and
  was retrofitted).

**Forced password change** (`must_change_password`): set on admin-created
accounts (temp password format `Snd@######`, still policy-compliant).
Enforced globally in `requireAuth` — any non-`/account` path redirects to
the forced-change screen, except an explicit exemption for the
cross-tenant Sanad-owner SSO session.

**No 2FA/TOTP anywhere** (exhaustive grep confirmed) — single-factor
password auth throughout. **No "remember me" feature.**

### Throttling — `lib/throttle.js`

Per-**IP** (not per-account), persisted in SQLite (`login_throttle` table,
survives restarts): 8 attempts / 15-minute window. No account-level
lockout exists. Consequence, both ways: a distributed attacker rotating
IPs isn't slowed; one noisy IP (e.g. an office NAT) throttles every account
behind it. Test-only escape hatch: `SANAD_NO_THROTTLE=1` outside production.

### Password policy — `lib/password.js`

Min length 10, requires letter+uppercase+digit+symbol, blocklist of 13
common passwords, rejects the username as a substring, rejects 4+ repeated
characters. `suggest()` generates a 14-char compliant random password;
`suggestTemporary()` generates the `Snd@######` admin-issued format.
Hashing: `bcryptjs`, cost factor 10, everywhere.

### Password reset — `lib/password-reset.js` + `lib/reset.js`

Per-identifier throttle (4/hour, in-memory, not persisted). **Always**
returns success regardless of whether the identifier exists (prevents
enumeration). Token: 32 random bytes, only a SHA-256 hash stored, 60-minute
TTL, single-use, and any earlier pending reset for that account is
invalidated by a new request. On success: **`revokeSessions()` deletes
every session row for that user**, logging them out everywhere — including
whoever forced the reset.

### Session store — `lib/session-store.js` + cookie config

Custom `SqliteStore` (no npm dependency — "~50 lines, one less package to
patch"), hourly expired-row sweep. Cookie: `sanad.sid` (or
`sanad.tenant.{id}.sid` when `TENANT_ID` is set — collision-avoidance for
shared-origin multi-instance setups), `httpOnly`, `sameSite:lax`, 7-day
rolling expiry, `secure` defaulting on in production for standalone
installs. **Server refuses to boot in production without `SESSION_SECRET`**
(`process.exit(1)` before migrations even run) — falls back to a literal
placeholder string otherwise, a hard-stop safety net.

### Device tracking — `lib/security.js`

`known_devices` table, coarse fingerprint (`{device-class}|{browser}|{os}`
— deliberately not precise: "a browser update should not look like an
intruder"). First-ever device for a new account is never flagged "new" (a
fresh account's first login isn't news); every subsequent new fingerprint
is. Also records geolocation captured client-side (with an explicit
`location_status` enum for denied/unavailable/timeout/unsupported), gated
by the `Permissions-Policy: geolocation=(self)` header plus the browser's
own permission prompt.

## CSRF — `lib/csrf.js`

One token per session, compared via `crypto.timingSafeEqual` (constant-time,
with a length pre-check since the function requires equal-length buffers).
Multipart/file-upload requests can't be checked at the standard middleware
stage (body not yet parsed) — flagged `req.csrfDeferred = true` and must be
explicitly re-checked post-multer via `verifyDeferred()`. **Structural risk
flagged for the blueprint**: this is a manual, easy-to-forget step — a
future multipart route that omits the explicit `verifyDeferred()` call
would silently skip CSRF protection. No such gap was found in this reading
pass, but the pattern itself deserves attention in any rebuild (a
middleware-enforced deferred-check registry would be safer than a
per-route manual call).

## Security headers — `server.js`

Hand-written (no `helmet` dependency — "six headers is not worth a
dependency"): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy:
geolocation=(self), microphone=(), payment=(), usb=()`, a CSP (`default-src
'self'`; `frame-ancestors 'none'`; `object-src 'none'`; fonts/styles
whitelisted to Google Fonts), `Strict-Transport-Security` only in
production, `x-powered-by` disabled, `trust proxy` set to 1 hop.

**Honest gap noted**: `script-src` and `style-src` both include
`'unsafe-inline'` — inline `<script>`/`<style>` blocks are allowed with no
nonce/hash scheme, which meaningfully weakens the CSP's XSS mitigation.
Worth fixing in a white-label rebuild if the templating approach allows it.

## Audit logging — `lib/audit.js`

Free-form dotted-string action convention (`auth.login`, `user.role_change`,
`request.payment`, etc.) with a human-readable Arabic `details` sentence.
Best-effort (wrapped in try/catch — a failed audit write never blocks the
action it describes, and is not transactionally guaranteed alongside it).
Geo-tagged from the actor's **most recent login location**, not a fresh
capture per action.

**Money redaction**: an explicit action-name list plus a regex fallback
plus an Arabic-keyword scan of `details` text — three overlapping checks so
a new money-related action is hidden-by-default from viewers without
`money.view`, even if a developer forgets to add it to the explicit list.
This is how a lawyer without financial visibility is kept from seeing
amounts even inside an otherwise-visible request's activity trail.

**No retention/purge job was found** for `audit_log` — rows appear to
accumulate indefinitely. Flag this for any white-label deployment with a
compliance/retention requirement.

## Tenant/office isolation — the most important architectural finding

**Sanad is single-tenant-per-deployment, not a shared-database
multi-tenant SaaS.** Each customer gets their own deployment with its own
SQLite file (`DATA_DIR`). Cross-customer isolation is therefore an
**infrastructure** property (separate process/container/DB file), not
row-level `tenant_id` filtering inside queries. `lib/tenant-policy.js`
governs the *subscription/license* relationship of one deployment to a
central Sanad owner (trial/active/suspended status, usage caps) — it is
**not** a data-isolation mechanism between tenants, because there is only
ever one tenant's data in a given deployment's file.

**Within** one deployment, `office_branches` (migration `055`) provides
multi-*branch* structure (e.g. Cairo + Alexandria offices of the same
firm) — but **critically, `office_branch_id` is not a systematic
access-control filter.** It's used as a WHERE-clause boundary in only two
places (`routes/public.js`, `routes/admin/report_profiles.js`); the main
data routes (requests, cases, money, clients) never gate visibility by
branch. Branch is a labeling/reporting/default-assignment dimension, not a
security boundary a user can be locked out of.

**The real within-deployment data-visibility boundary is per-user request
assignment** (`lib/access.js`): `visibleRequestFilter(user)` — a user
without `requests.view_all` only sees requests where a `request_assignees`
row exists for them; `canSeeRequest`, `canSeePayments`, `canEditFees`,
`canAssign`/`canUnassign` (deliberately asymmetric — a lawyer can add a
colleague to their own file without the `requests.assign` ability, but
cannot remove anyone without it, "so lawyers cannot drop each other"),
`canAddExpense` (requires both the ability and visibility on that specific
request) all live here as the single reusable primitive so "no query can
forget it" — though the comment itself acknowledges enforcement still
depends on every route remembering to call it.

**For the blueprint**: "tenant isolation" in a white-label future built the
same way = deploy-time infrastructure separation + a license/subscription
gate that can lock a whole deployment read-only if unpaid. If a *true*
shared-database multi-tenant architecture is wanted instead (multiple
companies in one deployment), that is a genuine rebuild, not a
configuration change — see the Postgres reference schema noted in
`13-database-erd.md`, which sketches exactly this target shape with a real
`tenants` table and Postgres row-level security, but implements none of
the operational modules (finance/HR/cases/bookings) yet.

## License / Entitlements — commercial gating, not a security boundary

`lib/license.js` (wraps `lib/tenant-policy.js`): skipped entirely for
standalone/self-hosted installs (no license file present). For managed
installs, an expired/suspended license blocks everything except
logout/contact/support (402/403 + a shared subscription-error view) — "a
suspended office must not retain a read/download back door." Also enforces
a blanket storage-quota pre-check on multipart uploads via `Content-Length`.

`lib/entitlements.js`: a separate feature-flag/module-visibility layer (21
module keys, 9 public-element keys) describing what a subscription tier
includes. Missing/legacy config defaults to "everything enabled." Gates
admin routes with 403 (visible-but-forbidden) and public routes with 404
(hidden-as-if-nonexistent) — a deliberate difference in how a
disabled-by-plan feature is presented to a paying customer's staff vs. an
anonymous visitor. **This is the natural mechanism for a white-label
blueprint's "enabled modules per company" requirement (tag B/D)** — it
already exists and works.

## Middleware chain order (server.js)

Security headers → body parsing → static files → session → the
cross-tenant SSO consumption route (registered before CSRF/locals since it
establishes its own session) → CSRF → locals → license → entitlements →
admin panel (mounted at configurable `ADMIN_PATH`, default `/office-panel`,
with a plain 404 on the literal `/admin` path so an obscured admin path
isn't given away) → entitlements' public-access gate → public/portal/
booking/support/login/upload/track/files routers → 404 → error handler.
