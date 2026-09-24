# Sanad Platform Blueprint — Master Reusable Architecture

## What this is

This is a reverse-engineered, implementation-grade specification of the Sanad
platform's **operating model** — extracted from the actual running codebase,
not from prior design documents or memory. It is written so that a competent
engineering team (human or AI) can later take:

1. this blueprint,
2. a new company's information,
3. that company's visual identity/assets,
4. its enabled services/modules, and
5. its country/business rules,

and build an **independent product** that shares Sanad's proven operating
model without being a Sanad clone — different name, different brand, no
shared code repository required.

## What this is NOT

- Not a redesign of Sanad.
- Not a new company website.
- Not a place where Sanad's brand (name, colors, logo, copy, imagery, motion
  personality) leaks into the reusable core as a mandatory default.
- Not a change to Sanad's actual application behavior. This entire document
  set was produced by reading the codebase; nothing in `/home/user/mohamed`
  outside `docs/platform-blueprint/` and `SANAD-BRAND-REFERENCE.md` was
  modified to produce it.

## Source of truth

Every claim in this document set is derived from reading the actual
implementation on branch `uiux/v4-checkpoint-2-functional-polish` at the
commit current when this blueprint was written — routes, views, middleware,
`lib/`, `db/migrations/`, and `db/catalogue.js` — not from prior audits,
screenshots, or README files. Where a `.md`/`.txt` document elsewhere in the
repo describes something the code does not actually do (or does
differently), that discrepancy is called out explicitly in the relevant
section, and the **code's actual behavior is used as the reference**, per
the instruction that opened this extraction.

Where a concept commonly expected in a system like this (e.g. e-invoicing,
multi-currency, court/session tracking) does **not** exist in the code, the
relevant section says so plainly rather than assuming it exists. A blueprint
that overstates what's implemented would mislead whoever builds from it
later.

## The DNA classification system

Every capability documented in this blueprint is tagged with one of eight
letters. This tagging is the single most important discipline in the whole
document set — its purpose is to stop Sanad's specific choices from
silently becoming mandatory rules for a future company built on this
blueprint.

| Tag | Name | Meaning | Example |
|---|---|---|---|
| **A** | Core Platform DNA | Reusable business/system behavior every deployment keeps. Not configurable — it's what makes this platform *this kind of platform*. | Request has a lifecycle with statuses and an audit trail; permissions are enforced server-side; file uploads are authorized before serving. |
| **B** | Optional Module | Reusable, but a company can enable or disable it entirely. | AI Assistant; consultations/appointments; cases/legal-ops module; payroll. |
| **C** | Country-Specific | Tax, invoicing, identity-field, terminology, payment or regulatory behavior tied to a specific country/jurisdiction. | Egyptian national ID field shape; EGP as the only currency currently wired in; Arabic-first terminology. |
| **D** | Company-Configurable | Left to each company/office to set, using platform mechanisms that already exist. | Services offered, prices, branches, working hours, approval thresholds, custom form fields. |
| **E** | Brand-Specific | Sanad's own identity. Must never become a hardcoded default in the reusable core. | "Sanad" name, teal/gold palette, Tajawal font, specific hero imagery, specific motion timing. |
| **F** | Content-Specific | Sanad's actual homepage copy, FAQ answers, testimonials, statistics, articles — content, not structure. | The specific hero headline text; the specific FAQ questions currently in the database. |
| **G** | Integration-Specific | A specific external provider Sanad happens to be wired to. The *capability* (e.g. "send email") is Core DNA; the *provider* (e.g. Resend) is swappable. | Resend for email; whichever AI provider is configured; SMS gateway if any. |
| **H** | Security / Governance | Authentication, authorization, audit, isolation, backup, and protection mechanisms. Structurally Core DNA (A), but broken out because it deserves its own scrutiny in a white-label context — a new company must never inherit a *weaker* security posture, only a *reconfigured* one (e.g. different admin path, different session secret). | CSRF protection; permission enforcement in middleware, not just UI; Super Admin anti-lockout; audit logging. |

A single feature can carry more than one tag where genuinely appropriate
(e.g. "AI Assistant" is B — optional module — and its provider choice is G),
but each document states explicitly, per capability, which parts are fixed
platform behavior and which parts are swappable.

## Document map

| File | Covers |
|---|---|
| `00-README-and-methodology.md` | This file. |
| `01-sitemap-and-personas.md` | Full site map by audience; every user persona's journey. |
| `02-public-website-blueprint.md` | The marketing site, content system, booking, localization. |
| `03-services-and-request-engine.md` | Service catalogue → request lifecycle → workflow engine. |
| `04-company-branch-tenant-model.md` | Platform → office/company → branch → scoping. |
| `05-roles-permissions-security.md` | Role/permission engine, permission matrix, security model. |
| `06-hr-employee-engine.md` | Employee profile, HR lifecycle. |
| `07-client-engine-appointments.md` | Client portal, appointments/consultations. |
| `08-cases-legal-operations.md` | Cases/legal-practice module. |
| `09-financial-system.md` | Treasury, revenue, expenses, custody, payroll. |
| `10-documents-backup-export.md` | File system, backup/restore, office/branch export. |
| `11-ai-assistant.md` | AI subsystem architecture and permission intersection. |
| `12-notifications-settings.md` | Notification triggers; full settings inventory. |
| `13-database-erd.md` | Entity inventory and Mermaid ERDs by domain. |
| `14-reporting-localization.md` | Report/export matrix; language and country engine. |
| `15-responsive-ux-motion-system.md` | Reusable UX and motion patterns (brand-neutral). |
| `16-white-label-config-schema.md` | The brand + content configuration layer for future companies. |
| `SANAD-BRAND-REFERENCE.md` | Sanad's own visual identity — reference only, never a default. |

## Status of this document set

This is a living extraction produced in one working pass. Each section is
built from direct code reading (either by the author of this document or by
research delegated to sub-agents whose factual findings were verified and
synthesized here, never invented). Where a section notes an open question or
an area that would benefit from deeper reading before a real build starts,
that is stated in the section itself rather than glossed over.
