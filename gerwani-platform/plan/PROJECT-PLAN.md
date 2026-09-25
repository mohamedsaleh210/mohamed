# El Gerwany Platform — Project Plan (Phase 0 output)

Follows `premium-project-orchestrator` and the blueprint's `IMPLEMENTATION-PHASES.md`. **No code is written until the ❓ decisions below are answered and a creative direction is chosen.**

## 1. Project brief

| | |
|---|---|
| Type | Company platform built from the Sanad Platform Blueprint (Mode A): public website + client portal + staff/admin back-office |
| Company | El Gerwany (شركة الجرواني): Egyptian law firm + corporate licensing, permits and documentation services |
| Core user jobs | Client: find the right service → submit documents → track progress → get reminded before expiry. Staff: intake → review/quote → field errands → issue → track renewals |
| Languages | Arabic (primary, RTL) + English (LTR) |
| Differentiator | **Renewal tracking** as a first-class feature. Sanad already added `issued_on / expires_on / renewal_on` for Gerwani |

## 2. Skills selected (minimum set)

Using: `brand-identity-system`, `premium-web-design` (+ `public-site-architecture.md`), `product-ui-dashboards`, `design-system-foundations`, `responsive-mobile-first`, `rtl-bilingual-ui`, `media-asset-pipeline`, `image-art-direction`, `motion-design` (CSS only), `web-app-security`, `seo`, `accessibility`, `visual-qa`, `webapp-testing`.

Not used, on purpose: `web-3d-experiences` (no spatial or product value), GSAP/Lottie/Rive (the path animation is plain SVG/CSS), React/Vercel skills (unless the stack decision below picks React).

## 3. Operational DNA (reused from the blueprint)

Requests/workflow engine · client portal · appointments · cases · finance (treasury, revenue, expenses, custody) · errands · agenda · renewals · report profiles · CMS · import/export · backup · the roles/permissions mechanism (resolve per request, per-user deltas, delegation ceiling, last-admin protection) · reduced-motion mechanism. See `config/MODULE-CONFIG.json`.

## 4. Creative DNA (new, see `brand/creative-direction.md`)

Recommended **A — «المسار / The Path»**. The final palette is anchored to the supplied logo, and an anti-clone check vs Sanad is included.

## 5. Information architecture (proposed)

```
Public (ar /ar/… · en /en/…)
├── الرئيسية                  hero + service-path demo, search, audiences, how it works, why us, FAQ, CTA
├── خدمات الشركات والمنشآت      6 categories → 29 service pages (each: documents, steps, duration, renewal, CTA)
├── الخدمات القانونية           ❓ practice areas
├── دليل المستندات              per-service "what do I need" guides (SEO)
├── تتبع طلب                   by request number
├── احجز استشارة
├── من نحن / فريقنا             real photos (media-asset-pipeline)
├── تواصل                      map, hours, WhatsApp
└── الخصوصية / الشروط

Client portal
├── طلباتي (status path per request) · رفع المستندات · الفواتير والمدفوعات
├── تراخيصي وتجديداتها (expiry calendar + reminders)
└── مواعيدي · الملف

Staff back-office
├── لوحة التحكم (today, overdue, renewals due in 30/60/90 days)
├── الطلبات · القضايا · المأموريات · المواعيد · الأجندة
├── العملاء (companies + their establishments + licenses)
├── المالية (خزينة، إيرادات، مصروفات، عهد) · التقارير
└── الإعدادات · المستخدمون والصلاحيات · المحتوى · النسخ الاحتياطي
```

## 6. UX priorities

1. **Service page = checklist.** Required documents as a checklist, the steps as a path, the typical duration, and "needs renewal every X".
2. **Request status as a path** (the brand's signature) in the portal and back-office, with the current step, the next action, and who owns it.
3. **Renewals dashboard.** Staff see what expires in 30/60/90 days; clients see their licenses with dates, and reminders go out before expiry.
4. **Mobile-first portal.** Clients use phones: document upload from the camera, WhatsApp-style clarity.
5. Every screen has empty, loading and error states.

## 7. Motion strategy (CSS only)

Path line draws once (≤ 900ms) → portal path fills to the current step → dialogs slide, toasts fade. No scroll reveals, no library. Reduced motion: static and fully drawn. See `config/MOTION-DESIGN-CONFIG.json`.

## 8. Responsive strategy

Mobile first. The public site stacks the hero with the path demo under the headline. Back-office tables become card lists under 768px; the sidebar becomes a drawer. Test widths: 360, 390, 768, 1024, 1280, 1440. Test both AR and EN.

## 9. Technical architecture (❓ decision)

| Option | Fit |
|---|---|
| **Recommended: Node.js + Express + server-rendered templates + SQLite (Mode A)** | Closest to the proven blueprint engine; fast server-rendered public pages (good SEO); simple hosting; your team already runs this stack. A new codebase with no Sanad code copied, following the blueprint's behavior specs |
| Alternative: Next.js (React) + PostgreSQL | Richer interactive UI, larger ecosystem; more rebuild effort; hosting cost is higher |

Cross-cutting either way: design tokens from `config/BRAND-CONFIG.json`; i18n ar/en with `/ar` and `/en` routes and hreflang; sitemap, robots, OG and JSON-LD (Sanad lacks all of them); CSP **without** `unsafe-inline` (a Sanad gap); account-based login throttling; optional 2FA for admins; renewal reminder scheduler (email; SMS/WhatsApp ❓).

## 10. QA and security plan

- `visual-qa` at all widths in AR and EN, with reduced motion; the anti-clone screenshot comparison vs Sanad.
- `webapp-testing`: request lifecycle, document upload, renewal reminders, booking, permissions matrix (every role × every route), private file access.
- `web-app-security` §9 checklist + `/security-review` on each change.
- Lighthouse, axe and linkinator on public pages; the blueprint's `ACCEPTANCE-CHECKLIST.md` at the end.

## 11. Capability gaps (honest)

| Gap | Status |
|---|---|
| Logo SVG | ❓ If only a PNG exists, vector tracing is an approximation; the real SVG is needed from the designer |
| Photo retouching / AI enhancement | External tool. Here: crop, resize, grade, background removal (hair edges need review) |
| Tax/VAT engine, Egyptian e-invoicing (ETA) | Not in the blueprint engine. New engineering if required ❓ |
| SMS/WhatsApp reminders | Needs a paid provider ❓ |
| Safari/Firefox testing | CI or local machine (the cloud session has Chromium only) |

## 12. Next steps

1. Mohamed answers the ❓ items in `onboarding/ONBOARDING-el-gerwany.md` (a short list is in `README.md`).
2. Choose creative direction A, B or C.
3. Upload the logo and photos to `assets/incoming/` (see `assets/README.md`).
4. Then Phase 1: architecture and repository setup, followed by Phase 2: the design system and a sample page + login in the brand, verified with `visual-qa`.
