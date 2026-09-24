# Sanad Brand Reference — REFERENCE ONLY

**This document is reference material describing Sanad's own visual
identity. Nothing in this file should become a hardcoded default in the
reusable platform core. Every value here is tag E (brand-specific) unless
explicitly noted otherwise.**

Source: direct reading of `public/css/style.css`, `public/css/admin.css`,
`public/css/responsive*.css`, `public/images/icons.svg`,
`views/partials/head.ejs`/`admin_head.ejs`.

## Color palette

```css
/* Public site (style.css) */
--ink: #12303a;        --ink-deep: #0b2029;
--brass: #c9a24b;       --brass-deep: #856527;   /* WCAG-AA-darkened from #a9853a (3.44:1 → 4.5:1+) */
--brass-soft: #f4eedd;  --paper: #f7f4ee;
--card: #ffffff;        --text: #1e2a30;
--muted: #63727b;       --line: #e6dfd1;
--danger: #c15450;

/* Admin panel (admin.css) — a related but independently-maintained set */
--ink: #12303a;   --ink-2: #0b2029;   --ink-3: #1c4351;
--brass: #c9a24b; --brass-deep: #856527; --brass-soft: #f4eedd;
--bg: #eef1f0;    --card: #ffffff;    --line: #e3e8e6;
--ok: #3a9d6b;    --ok-bg: #e7f6ee;
--warn: #d98a3d;  --warn-bg: #fdf3e3;
--danger: #c15450; --danger-bg: #fdeceb;
--info: #2f7bbf;
--chip-teal: #2c6e6a; --chip-teal-bg: #e5f1f0;
```

**Note for a white-label rebuild**: the two stylesheets never load
together (public site vs. admin panel are different template families),
so `var()` can't reach across files — each maintains its own copy of the
shared tokens by hand. A white-label design-token system should
centralize this rather than repeat Sanad's duplication pattern.

WhatsApp-green (`#25d366`) is used for the floating contact button — a
channel/contact choice, not a generic "floating action button
requirement."

## Typography

**Single font family across the entire product: Tajawal** (Google Fonts,
weights 400/500/700/800), loaded identically in every head partial.
Fallback stack: `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`.
An Arabic-optimized geometric sans, chosen specifically for this
RTL-Arabic-first product — not a generic recommendation for any other
company's brand voice. Print-only templates deliberately skip Tajawal in
favor of system fonts (`Tahoma, Arial, sans-serif`) for print reliability.

Body base sizes: public `16.5px`/1.7 line-height; admin `15.5px`/1.7. No
modular type scale beyond a handful of `clamp()` fluid headings.

## Radius / shadow / spacing personality

- Radius: `16px` (public cards), `14px`/`10px` (admin) — a specific
  roundedness choice, not a universal default.
- Shadow: soft, low-contrast (`0 1px 2px rgba(18,48,58,.04), 0 10px 30px
  rgba(18,48,58,.06)`) — calm/understated, matching the brand's overall
  restrained tone.
- No tokenized spacing scale — spacing is hard-coded per-rule throughout
  (a gap in the token system, not a deliberate choice worth copying).

## Motion personality

Timing scale (admin.css only — public site has no token scale at all,
its durations are ad hoc per rule): `--motion-fast: 120ms`,
`--motion-normal: 200ms`, `--motion-slow: 320ms`; easings
`cubic-bezier(.2,0,0,1)` (standard) and `cubic-bezier(0,0,.2,1)`
(decelerate). Alert auto-dismiss: 4000ms. Skeleton shimmer: 1.3s. Chart
draw-in: 900ms with a 120ms delay.

These read as **calm, understated, "not decorative"** per the code's own
comments — a specific personality choice reflecting a legal-services
brand's desired tone (trustworthy, unflashy), not a universal motion
default. A white-label company with a different personality (energetic
consumer brand, playful startup) should choose its own timing/easing
values entirely — the *category* of motion (entrance, hover, tab-switch,
skeleton, chart draw-in — see `15-responsive-ux-motion-system.md`) is
reusable; these specific numbers are not.

## Logo — there isn't one, there's a CSS construct

**No dedicated logo image file exists anywhere in `public/images/`.**
What stands in for a logo everywhere is a `.seal` element: a circular div
with a 2px brass border, a dashed inner ring, and the word "سند"/"Sanad"
or an initial centered inside (`display:grid; place-items:center`),
defined independently (not shared) in `style.css`, `admin.css`, and
again in each standalone print template. This is a specific visual
motif — a circular emblem standing in for an actual logo, tied to an
"official seal/stamp" legal-services metaphor. **Any white-label company
needs a real logo asset; this CSS-seal pattern is not something to
inherit as a fallback.**

**No favicon exists** — confirmed via grep of `public/` and every view.
A genuine gap in the current product, not a pattern to propagate.

## Imagery

Exactly one photograph in the whole product: `sanad-global-hero.png`
(1.72MB, the homepage hero — a professional using the platform in an
office). This specific image-style direction (photographic, professional/
office setting) is a choice for this brand; a white-label company should
make its own art-direction decision (see the `image-art-direction` skill
if this task continues into an actual new-company build).

## Icon system

`public/images/icons.svg` — a single inline SVG sprite, 45 `<symbol>`
definitions, 24×24 viewBox, **1.75px stroke weight, round caps/joins**,
`stroke="currentColor"` (inherits text color, no embedded fills). The
*delivery mechanism* (SVG sprite + `<use>`) is reusable (tag A, see
`15-responsive-ux-motion-system.md`); the specific 1.75px-stroke drawing
style is Sanad's visual choice.

## Public-site vs. dashboard style — two related but distinct surfaces

The public marketing site (warm paper background `#f7f4ee`, brass
accents, editorial tone) and the admin dashboard (cooler `#eef1f0`
background, denser data-tool tone, semantic ok/warn/danger/info colors
for operational states) share the core ink/brass palette but are styled
as two related-but-distinct surfaces — a pattern worth keeping
structurally (marketing site ≠ product UI, visually related but not
identical) even though the specific colors change per company.

## Summary: what NOT to carry into the reusable core

Every hex value, the Tajawal font choice, the `.seal` logo motif, the
16px/14px radius choices, the specific motion timing numbers, the single
hero photograph, and the 1.75px icon stroke style are all Sanad-specific
and must be supplied fresh per white-label company via the
`16-white-label-config-schema.md` brand configuration layer.
