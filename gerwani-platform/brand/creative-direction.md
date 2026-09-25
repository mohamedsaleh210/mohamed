# El Gerwany — Creative Direction (draft for approval)

Status: **3 options, recommendation A. Final colors will be anchored to the supplied logo** (not yet received). Nothing here is inherited from Sanad's brand; see the anti-clone table at the end.

## Brand strategy (from what is known)

- **What they are:** an Egyptian law firm whose distinctive offer is taking companies and establishments through licensing, permits, approvals, contracts and utility procedures, and **tracking expiry and renewal** afterwards.
- **Who it's for:** owners and managers of shops, factories, malls, offices, clinics and medical practices; plus legal-consultation clients.
- **The customer's real problem:** bureaucracy is opaque. They don't know which documents, which office, how long, or when a license expires.
- **Brand idea:** **"مسار واحد واضح" / "One clear path."** Every design decision must make the process feel visible, ordered and under control. (It extends their existing tagline «التراخيص والتشغيل والموافقات في مسار واحد».)

### Personality → design translation

| Trait (and its limit) | Type | Color | Shape | Imagery | Motion |
|---|---|---|---|---|---|
| Clear, not simplistic | Plain sans with a strong weight contrast; short headlines | High-contrast ink on light surfaces | Straight lines, grids | Real documents, real offices | Things move to show progress, never for decoration |
| Organized, not bureaucratic | Tabular numbers for dates and deadlines | One signal color reserved for "action/deadline" | Stepped path motif | Ordered compositions | Sequential steps, short durations |
| Trustworthy, not stiff | Humanist Arabic (not geometric-cold) | Deep, confident primary | Small radius (not sharp, not bubbly) | Real team faces, eye-level | Calm settle, no bounce |
| Proactive (they remind you before expiry) | — | Deadline colors are semantic and consistent | Countdown chips | — | Gentle attention cue on upcoming renewals |

---

## Option A — «المسار» / The Path  ✅ recommended

- **Mood:** civic-modern, precise, process-first. It feels like a well-run government services portal, but with a private firm's warmth.
- **Palette (provisional, to be re-anchored to the logo):** Deep cobalt `#1F3A93` (primary) · Ink `#121826` (text) · Porcelain `#F3F5F9` (background, cool) · White `#FFFFFF` (surfaces) · Signal tangerine `#E4602A` (action/deadline accent, ≤ 5% of any screen; as a fill with ink text, or `#B4461B` for small text) · Line `#D9DFEA` (decorative) · input borders `#7C879C`. Contrast checked against WCAG AA.
- **Type:** IBM Plex Sans Arabic + IBM Plex Sans (matched metrics, precise, excellent Arabic; weights 400/500/600/700). Tabular figures for dates and fees.
- **Shape:** radius 4px (inputs/cards) / 8px (dialogs); hairline borders instead of soft shadows; a **route line** motif, a thin line with nodes that connects the steps of a service across the site.
- **Imagery:** documentary photos of the team at work (filing, signing, site visits), cool-neutral grade, desaturated slightly; the people are shown as they are.
- **Icons:** outline, 1.5px, squared caps (Tabler or Phosphor "regular").
- **Motion:** crisp. Durations 140/220/360ms; easing `cubic-bezier(.3,0,0,1)`. **Signature moment:** the "license path" line draws as the hero loads and fills to the current step in the client portal. Reduced motion: static filled path.
- **Hero wireframe (RTL):**
```
┌──────────────────────────────────────────────────────────┐
│ [logo]            الخدمات  التجديدات  من نحن  تواصل   [ابدأ طلب] │
├──────────────────────────────────────────────────────────┤
│  ترخيص منشأتك في مسار واحد واضح            ┌─────────────────┐ │
│  من الطلب حتى التجديد.                      │ ● تقديم المستندات │ │
│  [ابدأ طلب خدمة] [احجز استشارة]             │ │                │ │
│                                           │ ● المراجعة       │ │
│  ابحث عن خدمة: [رخصة تشغيل محل…     🔍]     │ │                │ │
│                                           │ ○ الإصدار        │ │
│                                           │ ○ التجديد بعد 12 شهر│ │
│                                           └─────────────────┘ │
└──────────────────────────────────────────────────────────┘
      (live mini-demo of a real service path, e.g. «رخصة تشغيل محل»)
```

## Option B — «الوقار» / Counsel

- **Mood:** classic law-firm gravitas, editorial, partner-led.
- **Palette:** Oxblood `#6B1E2E` · Charcoal `#1C1C1E` · Cool white `#FAFAF8` · Stone `#E7E5E0` · Accent slate-blue `#3E5C76`.
- **Type:** Noto Naskh Arabic (headlines) + Readex Pro (UI/body); Latin: Newsreader + Inter Tight.
- **Shape:** near-square (2px), generous whitespace, thin rules.
- **Imagery:** black-and-white partner portraits, architectural details of courts and offices.
- **Motion:** calm fades only. **Signature:** slow typographic reveal of the headline.
- **Risk:** it communicates "law firm" strongly but undersells the fast, practical licensing service, which is their real differentiator.

## Option C — «التشغيل» / Operate

- **Mood:** friendly operations partner for small businesses, energetic and practical.
- **Palette:** Emerald `#0B7A55` · Deep ink `#0F1B17` · Mint-white `#F2F7F4` · Accent sun `#F5B82E` (sparingly).
- **Type:** Alexandria (headlines) + Readex Pro (body); Latin: Manrope.
- **Shape:** 12px radius, chunky pill buttons, category color-coding.
- **Imagery:** bright photos of shop fronts, clinics and factories (clients' worlds), plus simple flat icons per category.
- **Motion:** lively micro-interactions, a counter for "licenses delivered". **Signature:** category cards flip to show required documents.
- **Risk:** less "law firm", more "service agency"; the emerald must stay clearly apart from Sanad's teal family.

---

## Anti-clone check vs Sanad (`SANAD-BRAND-REFERENCE.md`)

| Axis | Sanad | A — The Path | B — Counsel | C — Operate |
|---|---|---|---|---|
| Primary hue | Ink teal `#12303a` + brass `#c9a24b` | Cobalt + tangerine ✅ | Oxblood ✅ | Emerald + sun ⚠️ (sun near brass, keep it tiny) |
| Background | Warm paper `#f7f4ee` | Cool porcelain ✅ | Cool white ✅ | Mint-white ✅ |
| Typeface | Tajawal only | IBM Plex Sans Arabic ✅ | Noto Naskh + Readex ✅ | Alexandria + Readex ✅ |
| Radius / depth | 16px, soft shadows | 4px, hairlines ✅ | 2px, rules ✅ | 12px, flat ⚠️ closer |
| Logo motif | CSS circular seal | Real logo + route line ✅ | Real logo ✅ | Real logo ✅ |
| Icons | 1.75px round caps | 1.5px squared ✅ | 1.25px ✅ | Filled/duotone ✅ |
| Motion | Calm 120/200/320ms, "not decorative" | Crisp path-drawing ✅ | Calm fades ⚠️ similar tone | Lively ✅ |
| Hero | Office photo + text | Live service-path demo ✅ | Editorial type ✅ | Category grid ✅ |

**Result:** A differs from Sanad on all 8 axes; B on 7; C on 6. Note: Sanad's existing Gerwani service page used gold `#cda646`, which is part of Sanad's brass family and will **not** be carried over.

## Decisions needed from Mohamed

1. Choose A, B or C (or a mix).
2. Upload the logo (SVG if available). The final palette is tuned to it, and if the logo's colors conflict with the chosen option, the logo wins.
3. Upload the team and office photos. They'll go through the `media-asset-pipeline` process (authorization check, no identity alteration).
