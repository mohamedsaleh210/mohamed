# README-FIRST — Read This Before Anything Else

## What is this package?

This is a **portable, implementation-grade platform blueprint**, extracted
by reverse-engineering the real, running Sanad legal-services SaaS
codebase — reading actual routes, views, middleware, and database
migrations, not prior documentation or memory. It describes Sanad's
**operating model** (how the platform actually works: permissions,
request workflow, finance, HR, client portal, AI, security, UX patterns)
separated cleanly from Sanad's **brand** (its name, colors, fonts, logo,
copy, imagery, motion personality).

The goal: hand this package to a fresh coding session or repository —
**one with zero access to the original Sanad source code** — and have it
build an independent platform for a *different* company, sharing Sanad's
proven operational engine, looking nothing like Sanad.

This package contains no Sanad source code, no database, no real
customer/employee data, no credentials, and no secrets. It is
documentation and configuration templates only.

## How do I use it?

1. Read this file.
2. Read `MASTER-BLUEPRINT.md` — the consolidated architecture overview
   that ties every module together and points into the detailed
   `blueprint/` documents for depth.
3. Fill in `COMPANY-ONBOARDING-TEMPLATE.md` for the new company (see
   "How do I create Company #1, #2, #3…?" below).
4. Populate the six `config/*.example.json` files using the onboarding
   answers.
5. Hand a fresh coding session `NEW-COMPANY-MASTER-PROMPT.md`, together
   with the filled-in onboarding template and config files.
6. That session follows `IMPLEMENTATION-PHASES.md` and validates its work
   against `ACCEPTANCE-CHECKLIST.md`.

## What must I ask Mohamed (or the new company's owner) for?

Everything listed in `COMPANY-ONBOARDING-TEMPLATE.md`: company identity,
branding assets and direction, public-website content, which modules to
enable/disable/customize, service architecture choice, role/permission
choices, country/locale settings, and AI configuration. **None of this
can be safely guessed** — a wrong guess here (e.g. assuming Sanad's teal/
gold palette, assuming Arabic-first, assuming the legal-services case
module is wanted) produces a Sanad clone instead of an independent
product, which is exactly what this package exists to prevent.

## What must never be copied automatically from Sanad?

Everything tagged **E (Brand-Specific)**, **F (Content-Specific)**, or
**G (Integration-Specific)** across the blueprint documents — see the DNA
classification legend in `blueprint/00-README-and-methodology.md`. In
practice: Sanad's name, logo, colors, fonts, imagery, icon style, motion
timing/personality, homepage copy, testimonials, FAQ content, legal case
categories (unless the new company is also a law firm), the specific AI
provider/model choice, and any Egypt-specific business rule (14-digit
national ID format, EGP currency default, Egyptian court fields) unless
the new company also operates in Egypt. `blueprint/SANAD-BRAND-REFERENCE.md`
exists specifically to quarantine these values — read it to know exactly
what to leave behind, never to know what to copy.

## Which files should be read first?

In order: this file → `MASTER-BLUEPRINT.md` → `GAP-REGISTER.md` (know the
honest limitations before promising a capability) → `BUILD-MODES.md`
(confirm which deployment mode is wanted) → `COMPANY-ONBOARDING-TEMPLATE.md`
(fill it in) → the specific `blueprint/NN-*.md` documents relevant to
whichever module is being built next.

## How do I create Company #1, #2, #3…?

Each new company gets its own **fresh copy** of this entire package (or a
fresh read of it, if kept centrally), plus its own filled-in
`COMPANY-ONBOARDING-TEMPLATE.md` and its own populated `config/*.json`
files. Nothing about one company's onboarding answers or config should
leak into another's — every company starts from the same blueprint but
produces an entirely independent product. If Build Mode B (true
multi-tenant SaaS — see `BUILD-MODES.md`) is chosen instead, each
company becomes a tenant row inside one shared platform rather than a
separate deployment, but the *onboarding questionnaire itself is
unchanged* — only where the answers get stored differs.

## Portability test result (see also the final response of the extraction session)

A documentation-only test was run against this package, assuming zero
access to the Sanad repository: **could another capable coding agent
build a new company platform from this package plus a completed
onboarding template?** Result: **yes, for everything tagged reusable
mechanism (tag A) in the blueprint** — the permission engine, request
workflow, finance/HR/client/booking modules, backup/AI architecture, and
UX patterns are described in enough implementation detail (schema shapes,
route responsibilities, state machines, validation rules) to be rebuilt
independently. **Honest gaps** (no functioning tax engine, no true
multi-tenant isolation today, no general static-page CMS, no sitemap/SEO
infrastructure, the `documents.internal` visibility inconsistency) are
carried forward explicitly in `GAP-REGISTER.md` rather than silently
assumed solved — a future build must treat these as **new work**, not
as "already handled, just copy it." Nothing in this package was invented
to paper over a gap; where detail was insufficient, it is marked as such
in the relevant document rather than guessed.
