# Sanad v16.3.9 — Login sessions and temporary passwords

## Implemented

- Fixed the company-card login flow on local HTTP deployments.
- Gave every tenant a separate session cookie so central Sanad and tenant sessions cannot overwrite each other.
- Kept secure cookies enabled when the tenant is served over HTTPS.
- Fixed the portable Sanad owner account as `adam` with the approved password.
- Added easy one-time passwords in the format `Snd@482739` for access cards and employee Excel imports.
- Kept forced password change on first login.
- Updated the tenant import example password.

## Verification

- Tenant production-mode login over local HTTP completed with HTTP 302 and a tenant-specific cookie.
- Owner credentials verified against both the main and platform databases.
- 100 generated temporary passwords passed the password policy.
- Smart import tests passed: 21.
- Tenant import test passed.
- Booking and tenant-isolation tests passed: 51.
- Main regression suite passed 972 checks; two pre-existing non-functional lint checks remain unrelated to this release.
