# Acceptance Checklist for a New Company Build

Use this to confirm a build is actually done, not just believed done.
Check every enabled module only — leave disabled-module rows unchecked
with "N/A (disabled)" rather than deleting them, so the checklist stays a
faithful record of what was and wasn't in scope.

## Identity & Brand

- [ ] Company name, logo, favicon appear correctly everywhere (site,
      admin panel, emails, PDFs)
- [ ] No Sanad brand value (name, colors, fonts, imagery, `.seal` logo
      motif) appears anywhere in the build
- [ ] Design tokens (color/radius/shadow/motion) are the new company's
      own values, not placeholders
- [ ] Watermark (if enabled) uses the new company's own text

## Public Website

- [ ] Homepage renders with the new company's hero/copy/metrics/
      testimonials/FAQ
- [ ] Catalogue browse works (pages → categories → services or the
      chosen custom structure)
- [ ] Guest request submission works end to end (ref + tracking link
      generated)
- [ ] Guest tracking (ref + phone) works and rejects mismatches
      identically for "not found" and "wrong phone"
- [ ] About/FAQ/Guides pages contain the new company's actual content,
      not Sanad's or placeholder text
- [ ] Contact page shows real contact info
- [ ] Content protection (if enabled) blocks select/drag/right-click on
      the intended pages only, never on form-bearing pages, and the UI
      never claims it prevents screenshots
- [ ] SEO basics present if required (sitemap, robots.txt, per-page meta
      description) — confirm this was actually built, since it does not
      exist in the source blueprint

## Authentication & Roles

- [ ] Staff login works, throttled, with a generic error for both wrong
      username and wrong password
- [ ] Client portal login/registration works, email verification
      behaves honestly when no mail provider is configured
- [ ] Every role from `ROLES-PERMISSIONS-CONFIG` has been logged in as
      and its default permissions match what was specified
- [ ] Permission changes take effect without requiring the affected user
      to log out and back in
- [ ] If a top administrative tier exists: the last such account cannot
      be deactivated or stripped of its tier, verified by attempting it

## Requests / Core Workflow

- [ ] A request can be created from the public site, from staff intake,
      and (if enabled) from a booking
- [ ] Status transitions work, including the "completed" requirements
      (open todos / documents / summary, if that rule was kept)
- [ ] Assignment/unassignment works with the intended permission
      asymmetry (if kept)
- [ ] Archive-before-erase two-step guard is in place and cannot be
      bypassed
- [ ] Client-visible data is correctly curated (no internal comments,
      audit trail, or full payment ledger leak to the client portal)

## Finance (if enabled)

- [ ] Treasury/revenue/expenses/custody/payroll each produce numbers
      that reconcile (e.g. a payroll payout reduces treasury balance by
      exactly the paid amount)
- [ ] If tax/VAT calculation was required: it actually computes a tax
      amount somewhere — confirm this wasn't left as identity-only
      fields the way the source blueprint's `report_profiles` are
- [ ] Currency displays consistently; if multi-currency was required,
      confirm real conversion exists (the source blueprint has none)

## HR (if enabled)

- [ ] Employee onboarding produces working credentials via whichever
      distribution channel was built
- [ ] Deactivating a staff member with open assigned work triggers a
      handover flow, not a silent orphaning of that work

## Client Portal / Appointments (if enabled)

- [ ] A client can register, verify (or skip verification honestly if no
      mail provider), and see only their own data
- [ ] A booking (if enabled) correctly creates its linked records and
      respects the double-booking guard

## AI Assistant (if enabled)

- [ ] With no API key configured, the assistant shows an honest "not
      connected" message — never a fabricated response
- [ ] A user without a given module's permission gets no data from that
      module through the assistant, verified by testing with a
      restricted-permission account, not just reading the code

## Backup / Security

- [ ] A backup can be created and its manifest correctly identifies
      format/scope
- [ ] A corrupted backup file is rejected before any data is touched
- [ ] Restore behavior (immediate or next-restart) is documented and
      matches what was actually implemented
- [ ] Any export-only mechanism is never described as restorable in the
      UI
- [ ] Security headers are set; CSP does not include `unsafe-inline`
      unless there's a specific, documented reason it couldn't be
      avoided

## Responsive / Accessibility

- [ ] Every screen works at a phone width, a tablet width, and a desktop
      width
- [ ] `prefers-reduced-motion` is honored, including any timer-based
      effects (not just CSS animations)
- [ ] Keyboard navigation works through any custom interactive component
      (searchable selects, tabs, dialogs)

## Final

- [ ] Screenshots captured across roles and breakpoints
- [ ] A local preview is running and was actually clicked through, not
      just started
- [ ] No test/demo credentials or seed data resembling Sanad's own demo
      accounts ship in what's handed to the company
- [ ] Every "N/A (disabled)" row above reflects an actual onboarding
      decision, not an oversight
