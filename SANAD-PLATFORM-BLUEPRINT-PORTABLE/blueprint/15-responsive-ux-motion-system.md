# 15 — Responsive, UX & Motion System (Brand-Neutral)

Source: `public/css/style.css`, `admin.css`, `responsive.css`,
`responsive-admin.css`, `public/js/admin.js`, `public/images/icons.svg`,
view template inventory. This document extracts **reusable interaction
patterns only** — every color/font/timing-value specific choice lives in
`SANAD-BRAND-REFERENCE.md` instead. **Tag A throughout.**

## Design-token architecture (shape, not values)

`:root` CSS custom properties for color roles, radius, shadow, and (admin
panel only) a 3-step motion-timing scale + 2 easing curves. **The shape**
— a semantic token layer sitting above raw values — is reusable even
though Sanad's specific values aren't. A white-label rebuild should adopt
this token-layer *shape* and centralize it (Sanad's own implementation
duplicates tokens by hand across `style.css`/`admin.css` since they never
load on the same page — worth fixing, not copying, in a rebuild).

There is no tokenized spacing or typography scale in the current
implementation — only color/radius/shadow/motion are tokenized. A
white-label rebuild should add a spacing scale from the start.

## Responsive strategy

**Not a fixed device-test matrix** (320/375/390/414/768/1024...) — the
real breakpoints in use are numerous, irregular, and chosen per-component
(40 distinct px values found across the CSS files). A later "fluid
retrofit" layer (`responsive.css`/`responsive-admin.css`, self-described
as "presentation only") sits on top of the larger legacy stylesheets with
a smaller, more consistent breakpoint set and `clamp()`-based fluid
spacing/typography — reducing reliance on hard breakpoints going forward.
**This layering approach itself (a small fluid-retrofit file added on top
of a larger legacy stylesheet, rather than rewriting it) is a reusable
methodology** for incrementally modernizing responsive behavior without a
full rewrite.

`@media (pointer:coarse)` (touch-specific affordances) and
`@media (orientation:landscape) and (max-height:520px)` (short-landscape
phone fix for nav/sidebar) are used alongside standard width queries.
`--tap: 44px` (minimum touch target) is a token in both fluid-retrofit
files.

## Table → card responsive transform

A generic, language-agnostic pattern (gated at `max-width:900px`):

- Markup: a normal `<table>` with `data-label="Column Name"` on every
  `<td>`.
- Below the breakpoint: `table`/`tbody`/`tr`/`td` forced to
  `display:block`, `thead` hidden. Each row becomes a bordered "card";
  each cell becomes a flex row with a `::before{content: attr(data-label)}`
  label recreating the header context a table row normally conveys.
- **Opt-out escape hatch**: a `.table-scroll` modifier keeps a table as a
  real horizontally-scrollable table instead of collapsing to cards — for
  dense/analytical tables where stacking would lose too much at-a-glance
  comparability.
- **Known pitfall, worth documenting for any reuse**: the `tr{display:
  block}` rule was found to override the browser's native `[hidden]`
  user-agent style, silently re-showing hidden rows on mobile. A
  defensive `[hidden]{display:none!important}` rule is now required
  wherever this pattern is used.

## Searchable select component

Progressive enhancement over a real `<select>` (kept as the single source
of truth for value/`change` events — never replaced):

- The native select is visually hidden (not removed); a text
  `<input role="combobox">` + `<ul role="listbox">` are injected in front
  of it.
- Typeahead filters the select's *current* non-hidden/non-disabled
  options.
- Full keyboard nav (ArrowUp/Down, Enter, Escape), `aria-activedescendant`
  wired correctly.
- Selecting an option sets `select.value` **and manually dispatches a real
  `change` event** (programmatic assignment doesn't fire native events) —
  critical for composing with any pre-existing cascading-filter logic on
  the page.
- A clear (×) button resets to blank and refocuses.
- Handles a page's own script mutating the option list at runtime (e.g.
  cascading company→branch filters), exposing a `sync` re-render.
- Native-invalid-bubble suppression on the hidden select, re-reported on
  the visible input in the right position.
- Full ARIA: `combobox`/`listbox`/`option` roles, `aria-expanded`,
  `aria-controls`, `aria-selected`.

This is a complete, reusable, accessible component worth carrying
verbatim (mechanism, not styling) into any white-label rebuild needing a
searchable dropdown.

## Pure-CSS tab component

A radio-button-driven tab system (`input[type=radio]` + sibling-selector
`:checked ~` combinators) — no JS needed to switch tabs. The revealed
panel plays a fade+translateY entrance. Reusable for any tabbed interface
that doesn't need deep-linkable tab state.

## Dialogs & drawers

Native `<dialog>`/`showModal()` for modals — leans on browser-native
behavior rather than a custom modal library. Mobile nav drawer: a
`transform:translateX()` panel + a `.scrim` backdrop, both transitioning
on the shared motion-timing token.

## Icon delivery

SVG sprite with `<symbol>` definitions + `<use href="...#i-name">` — a
generic, framework-agnostic icon mechanism any white-label variant can
keep regardless of the actual icon drawing style chosen.

## Motion pattern categories (names — reusable; specific timing values are brand-specific, see `SANAD-BRAND-REFERENCE.md`)

1. **On-load entrance** for above-the-fold critical content (page
   headers, KPI stat cards) — applied directly on load, deliberately
   *not* scroll-triggered, so it doesn't depend on an
   `IntersectionObserver`.
2. **Staggered list reveal** — cascading entrance via incrementing
   `animation-delay` per child.
3. **Hover micro-interactions** — subtle lift + shadow-deepen on
   buttons/cards.
4. **Tab-switch fade+shift** on panel reveal.
5. **Drawer/dialog open** via transform + backdrop fade.
6. **Inline auto-dismissing success banners, never auto-dismissing
   errors** — a deliberate asymmetry: errors need a read + a next action,
   successes don't need to stay.
7. **Skeleton shimmer**, explicitly scoped to genuinely-async
   chart/table re-renders only — not general page loads (avoids
   skeleton-everywhere overuse).
8. **Chart/data-viz draw-in** — bar scale-in, SVG stroke-dashoffset
   line-draw, area fade-in.

## Accessibility: `prefers-reduced-motion` handled at two levels

- **CSS blanket rule**: `*,*::before,*::after{animation-duration:.01ms
  !important; transition-duration:.01ms!important}` under
  `@media(prefers-reduced-motion:reduce)`.
- **JS-level, for timing-based (not just animation-based) effects**: the
  success-alert auto-dismiss timer is **skipped entirely** (not just
  sped up) when reduced motion is requested — a WCAG 2.2.1 "timing
  adjustable" consideration the CSS rule alone can't cover, since a timer
  duration isn't a CSS animation/transition. A tab-rail auto-scroll effect
  is similarly skipped/made instant via JS. **This "skip the timer, not
  just shorten the animation" distinction is a reusable accessibility
  pattern worth documenting explicitly for any rebuild.**

## Layout patterns

- **Master/detail**: single-column by default, switching to a
  content+fixed-width-sticky-side-panel grid at a wide breakpoint — used
  for case/workspace detail screens with a summary side panel.
- **Numbered pager**: info text ("X–Y of total") + current/disabled/gap
  states, 40px+ touch targets, centers itself on narrow viewports.

## Component/screen inventory (confirms the admin panel's real screen count)

63 admin templates, grouped: auth/account (6), dashboard (2), requests
(4), cases (3), clients (2), companies (2), users/employees (3),
permissions/security (4), treasury/finance (7), payroll (5), reports (3),
scheduling/appointments (9), content/CMS (4), support (3), settings/data
(3), trash (1). This screen count/grouping is a useful sizing reference
for estimating a white-label rebuild's admin-panel scope, independent of
its visual styling.
