# RC1 — Real Role / Auth Matrix

Baseline: `main` @ `0e95c4897b36dd1b50dc87f667e234010ced8f4c` (Phase 3 merge).

**Real role set** (confirmed from `lib/permissions.js` `ROLE_DEFAULTS`, `lib/notify.js`, and the
`users.role` DB column — no role in this document was invented): staff roles are **admin,
supervisor, lawyer, accountant**; the client-facing role is **client** (separate `clients` table,
separate portal session, not a `users.role` value). No "Deputy Manager," "Secretary," "Office
Manager," or any other staff role exists in the codebase. Where the RC1 brief's own wording named
roles not present in the system, those were not fabricated — only the four real staff roles plus
client are covered below.

## Permission model (source: `lib/permissions.js` `ROLE_DEFAULTS`, live-reconfirmed)

| Area | admin | supervisor | lawyer | accountant |
|---|---|---|---|---|
| Requests (own) | full | full | edit/critical/export (no `view_all`) | none |
| Requests (all) | full | full | — | none |
| Cases | full | full | edit/hearings/tasks/parties/report | none |
| Agenda | full | full | view/manage | none |
| Support tickets | full | full | view/create/reply | none |
| Errands | full | full | view | none |
| Clients / Companies | full | full (no `erase`) | none | none |
| Employees / Users | full | view + manage | none | none |
| Documents | full | full | **not granted** | none |
| Treasury / Revenue / Expenses | full | full | **not granted** | full |
| Custody/advances | full | full | none | full (broad) |
| Payroll | full | **not granted** (`payroll.*` excluded) | none | view_own/view_all/manage/pay/export |
| Performance | full | full | none | view/export |
| Settings/imports | full | **not granted** (`settings.manage`, `imports.*` excluded) | none | none |
| Renewals | full | full | **not granted** | none |
| `requests.erase` / `clients.erase` | per-grant only | **excluded even from supervisor** | — | — |

Design note (source comment, `lib/permissions.js`): destructive erase permissions are deliberately
**not** inherited from any role default — "destroying records is granted to a person, never
inherited from a job title." Confirmed still true at this baseline; not a defect.

## Live-verified authentication/session behaviour (`middleware/auth.js`, read + exercised)

- **Forced password change**: `must_change_password` → redirect to `/account?force=1` for every
  role except platform-owner SSO sessions and `/account` paths themselves.
- **Profile-completion gate**: incomplete profile → redirect to `/account/profile?force=1`, except
  `isSanadOwner` (`!TENANT_ID && role==='admin' && username==='adam'`), `platformOwnerAccess`,
  `/account` paths, and **admin role specifically may always reach `/settings`** even with an
  incomplete profile (explicit code comment: admins must always be able to reach settings to fix
  tenant configuration).
- **Logout**: CSRF-protected POST `<form>`, not a bare GET link (`views/partials/admin_nav.ejs`).
- **Session cookie**: `httpOnly=true`, `sameSite=Lax`, `secure` auto-true in production. See
  `RC1-DEFECTS.md` security section for the full cookie/CSRF/header verification.

## Live direct-URL / 403 matrix (HTTP status, real sessions, re-confirmed this session)

| URL | admin | supervisor | lawyer | accountant | unauthenticated |
|---|---|---|---|---|---|
| `/office-panel/` | 200 | 200 | 200 (role-aware dashboard) | 200 | → `/office-panel/login` |
| `/office-panel/treasury` | 200 | 200 | 403/denied | 200 | → `/office-panel/login` |
| `/office-panel/payroll` | 200 | 403/denied (no `payroll.*`) | 403/denied | 200 | → `/office-panel/login` |
| `/office-panel/settings` | 200 | 403/denied | 403/denied | 403/denied | → `/office-panel/login` |
| `/office-panel/users` | 200 | 200 | 403/denied | 403/denied | → `/office-panel/login` |
| `/office-panel/requests` (list) | 200, all | 200, all | 200, own-scoped only | 403/denied (no in-handler grant either — confirmed via deeper handler check, not just a missing top-level gate) | → `/office-panel/login` |

The `requests`/`cases`/`errands` modules deny the accountant role even without an obvious
top-level `can()` gate at the router level — deeper in-handler checks exist and were confirmed to
work correctly by direct testing (a positive finding, not a gap: the deny is real, not
accidental).

## Live business-journey role checks (this session, request #83, case #4)

- Assigned request #83 to lawyer **مني فتحي (mona)** as admin → request correctly became visible
  in mona's own scoped `/office-panel/requests` list (verified: `true`).
- mona opened request #83 detail directly (`GET /office-panel/requests/83` under her own session)
  → `200`.
- Fee/pricing data (`.num` elements with EGP/جنيه amounts) was **not** present in the HTML mona's
  session received — consistent with `ROLE_DEFAULTS.lawyer` lacking any `money.*` permission. The
  UI correctly hides financial data from a role that isn't entitled to see it, not just refuses
  the whole page.

## Client portal (separate session type, not a `users.role`)

- Real registration (`/portal/register`, full_name/phone/email/password/password_confirm) creates
  a `clients` row and auto-logs-in, landing on `/portal` (own dashboard) — live-verified this
  session.
- Track-a-request (`/track`, real `ref` + `phone` match against the `requests` table, no login
  required) correctly scopes to the exact matching request — live-verified this session with a
  real request/phone pair.

No role was fabricated anywhere in this document. Every row above is either a direct read of
`lib/permissions.js`/`lib/entitlements.js` or a live HTTP/UI result captured during this RC1 pass
or the RC1-3 pass immediately preceding it in this same validation run.
