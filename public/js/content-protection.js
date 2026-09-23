/*
 * Public content-protection deterrence — behavior half of content-protection.css.
 *
 * This is deterrence, not real security: nothing here can stop someone from
 * photographing their own screen, and nothing here claims to. It only makes
 * the routine "right-click → Save Image As", drag-image-out-of-the-page and
 * select-all-copy paths a little friction, for the marketing pages an office
 * has explicitly opted to protect from casual copying.
 *
 * Loaded (see views/partials/footer.ejs) only when the office has enabled
 * protection, and only ever runs inside .protected-content — never touches
 * a form field, a link, or anything outside that wrapper.
 */
(function () {
  'use strict';

  var root = document.querySelector('.protected-content');
  if (!root) return;

  var cfg = window.__sanadContentProtection || {};

  function isExempt(target) {
    return !!(target.closest && target.closest(
      'input, textarea, select, [contenteditable], a[href^="mailto:"], a[href^="tel:"], .cp-allow-copy'
    ));
  }

  if (cfg.blockContextMenu) {
    root.addEventListener('contextmenu', function (e) {
      if (isExempt(e.target)) return;
      e.preventDefault();
    });
  }

  if (cfg.blockDrag) {
    root.addEventListener('dragstart', function (e) {
      if (e.target && e.target.tagName === 'IMG') e.preventDefault();
    });
  }

  if (cfg.blockSelect) {
    // Belt-and-braces alongside the CSS user-select rule: some browsers'
    // "Select All" / long-press menu can still fire a copy on unselectable
    // text. Blocking the copy event itself only inside the protected area,
    // and only when the selection isn't inside an exempt field, closes that
    // without ever touching a form field's own copy behavior.
    root.addEventListener('copy', function (e) {
      if (isExempt(e.target)) return;
      e.preventDefault();
    });
  }
})();
