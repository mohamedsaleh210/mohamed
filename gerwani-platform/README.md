# El Gerwany Platform — Phase 0 (plan + onboarding)

A new, independent platform for **شركة الجرواني للمحاماة والاستشارات القانونية**, built from `SANAD-PLATFORM-BLUEPRINT-PORTABLE` (on branch `uiux/v4-checkpoint-2-functional-polish`).

- It reuses the blueprint's **operational DNA** (workflows, modules, roles and permissions).
- It gets a **new creative DNA**: nothing from Sanad's visual identity carries over.

This folder is separate from Sanad; no Sanad file was changed. **No code yet.**

| File | What it is |
|---|---|
| `onboarding/ONBOARDING-el-gerwany.md` | The blueprint's onboarding template, filled: ✅ confirmed from Sanad data · 🟡 proposal · ❓ needed from you |
| `brand/creative-direction.md` | Brand strategy + 3 creative directions (recommended: A «المسار») + anti-clone check vs Sanad |
| `plan/PROJECT-PLAN.md` | Skills, IA, UX, motion, responsive, technical architecture, QA/security plan, gaps |
| `config/*.json` | The blueprint's 6 config files, filled (services: 29 real services from Sanad data) |
| `assets/README.md` | Where to upload the logo and photos, and what will be done with them |

## Decisions needed to start building

1. **Creative direction:** A, B or C.
2. **Logo + photos:** upload to `assets/incoming/`.
3. **Company facts:** official English spelling, legal name, contacts, address, domain, about/story.
4. **Legal practice areas** for the "Legal services" page.
5. **Modules to confirm:** cases, custody, payroll, performance, AI assistant, SMS/WhatsApp reminders.
6. **Tax:** VAT-registered? E-invoicing needed?
7. **Stack:** Node/Express + SQLite (recommended) or Next.js + Postgres.
8. **Data migration:** move Gerwani's existing data out of Sanad?
