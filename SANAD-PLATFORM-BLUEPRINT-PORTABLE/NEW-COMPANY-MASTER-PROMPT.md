# New Company Master Prompt

Copy the block below verbatim into a fresh Claude coding session (a new
repository, with **no access to the Sanad source code**), together with:
1. This entire `SANAD-PLATFORM-BLUEPRINT-PORTABLE/` package.
2. A completed `COMPANY-ONBOARDING-TEMPLATE.md` for the new company.
3. The six populated `config/*.json` files.

---

## PROMPT TO PASTE

You have been given a portable platform blueprint package
(`SANAD-PLATFORM-BLUEPRINT-PORTABLE/`) extracted from a proven legal-
services SaaS platform, plus a completed company onboarding template and
populated configuration files for a **new, independent company**. You do
not have, and must never seek, access to the original Sanad source code
or repository — everything you need is in this package.

**A. Read the package first, in this order**: `README-FIRST.md` →
`MASTER-BLUEPRINT.md` → `GAP-REGISTER.md` → `BUILD-MODES.md` → the
completed `COMPANY-ONBOARDING-TEMPLATE.md` → the six `config/*.json`
files → then the specific `blueprint/NN-*.md` documents relevant to
whatever module you're building. Do not start writing code before you've
read the onboarding template and config files completely — guessing an
answer that was actually provided is a real error, not a shortcut.

**B. You are building a NEW independent platform from scratch.** There is
no existing codebase to extend or theme — you are implementing the
architecture the blueprint describes, informed by it, not copying files
from it (there are no files to copy; this package is documentation and
configuration only).

**C-D. Preserve the approved business capabilities, nothing more.** Build
exactly the modules the onboarding template and `MODULE-CONFIG.example.json`
(populated) mark ENABLED, in the CUSTOMIZED shape where specified, and
skip everything marked DISABLED. Do not add a module "because Sanad had
it" if it wasn't selected. Do not skip a module's underlying mechanism
(e.g. the permission-resolution pattern, the audit-logging pattern) even
where the *feature it's attached to* is disabled — security/governance
mechanisms (tag A/H in the blueprint) are foundational, not optional
add-ons.

**E-F. Create a completely independent visual identity. NEVER copy Sanad
branding.** Every color, font, logo, icon style, image, motion timing
value, and piece of homepage copy must come from the populated
`BRAND-CONFIG.example.json`/`CONTENT-CONFIG.example.json` and the
onboarding template — never from `blueprint/SANAD-BRAND-REFERENCE.md`,
which exists purely so you know what to leave behind. If a brand
question wasn't answered in the onboarding template, **stop and ask the
person running this build** rather than defaulting to anything
Sanad-shaped.

**G. Build a new public website tailored to this company** — its own
hero message, its own services framing, its own tone of voice, its own
information architecture within the reusable page→category→service
shape (or a custom structure, if the onboarding template specified one).

**H. Create this company's own animations, motion language, imagery, and
visual storytelling**, guided by `config/MOTION-DESIGN-CONFIG.example.json`
(populated) and the reusable motion pattern *categories* in
`blueprint/15-responsive-ux-motion-system.md` — never the specific timing
values documented as Sanad's own choice.

**I. Preserve required security, permissions, and operational
relationships.** These are not brand choices — implement them per
`blueprint/05-roles-permissions-security.md` (server-side permission
re-resolution every request, CSRF protection, audit logging with money
redaction, Super-Admin-equivalent anti-lockout guarantees if a top
administrative tier exists), `blueprint/03` (request lifecycle state
handling, the archive-before-erase two-step guard), and
`blueprint/10-documents-backup-export.md` (the backup-vs-export
distinction — never let your restore UI describe a non-restorable export
as a backup, and vice versa).

**J. Build database, backend, frontend, portals, and dashboards** for
every enabled module, following the data-relationship guidance in
`blueprint/13-database-erd.md` and the module-specific documents. Choose
`BUILD-MODES.md` Mode A (independent instance) unless the onboarding
template explicitly selected Mode B (true multi-tenant) — if Mode B was
selected, implement the additional isolation requirements `BUILD-MODES.md`
documents; do not assume Mode A's patterns are automatically tenant-safe.

**K. Implement responsive/mobile behavior** using the reusable patterns
in `blueprint/15` (table→card transform, searchable select, master/
detail layout) styled entirely with this company's own design tokens.

**L. Test all roles and workflows** — every role defined in the
populated `ROLES-PERMISSIONS-CONFIG.example.json`, every enabled module's
core workflow end to end (see the sequence flows in
`blueprint/01-sitemap-and-personas.md` as a template for the kinds of
journeys to test, adapted to this company's actual modules).

**M. Produce screenshots and a final local preview** before declaring
the build complete, so the outcome can actually be inspected, not just
asserted.

**N. Continue autonomously until complete**, but stop and ask a genuine
question whenever: a brand/content decision has no answer in the
onboarding template or config files, two technically valid
implementation choices would materially change business behavior and
neither the blueprint nor the onboarding template decides between them,
or you'd need to invent a capability the blueprint doesn't describe and
the onboarding template doesn't request (check `GAP-REGISTER.md` first —
many "missing" capabilities are documented gaps with an honest current-
vs-future note, not things to silently invent).

### The one rule that matters most

**SAME PLATFORM DNA ≠ SAME WEBSITE DESIGN.** Two companies built from
this exact same blueprint should be able to look, sound, and feel
completely different from each other and from Sanad — different colors,
different fonts, different imagery, different motion personality,
different copy voice, potentially even different service catalogue
structures — while sharing the same proven operational engine (the
permission model, the request workflow, the finance/HR mechanics, the
security guarantees). If your output looks like a Sanad reskin, you have
not followed this prompt correctly. If two companies built from this
blueprint look interchangeable except for a logo swap, you have not
followed this prompt correctly either.

---

## What to hand this session, checklist

- [ ] `SANAD-PLATFORM-BLUEPRINT-PORTABLE/` (this whole package)
- [ ] `COMPANY-ONBOARDING-TEMPLATE.md`, fully answered for this company
- [ ] `config/BRAND-CONFIG.example.json`, populated (rename without
      `.example` once filled in)
- [ ] `config/MODULE-CONFIG.example.json`, populated
- [ ] `config/SERVICES-CONFIG.example.json`, populated
- [ ] `config/ROLES-PERMISSIONS-CONFIG.example.json`, populated
- [ ] `config/CONTENT-CONFIG.example.json`, populated
- [ ] `config/MOTION-DESIGN-CONFIG.example.json`, populated
