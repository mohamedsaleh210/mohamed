/*
 * Keeping your place across a save.
 *
 * Every form in the panel posts and then redirects — which is right, because it
 * stops a refresh from repeating the action. But a redirect loads a fresh page
 * at the top, so ticking a checklist item halfway down a long request threw the
 * reader back to the header and made them find their place again. On a file
 * with thirty steps that is the difference between usable and exhausting.
 *
 * Rather than adding an anchor to a hundred and eighty redirects — which
 * somebody would forget on the hundred and eighty-first — the position is
 * remembered here, once, for the whole panel.
 *
 * Deliberately not a general "restore scroll on every load": returning to a
 * page an hour later should start at the top. Only the moment right after your
 * own submission counts.
 */
(function () {
  'use strict';

  /*
   * The browser's own restoration is left alone.
   *
   * Turning it off would fix the redirect case and break the ordinary back
   * button, which restores correctly on its own. Instead this only acts when
   * there is a saved position for this exact page from the last few seconds —
   * which is to say, right after your own submission.
   */
  var KEY = 'sanad.panel.scroll';
  var WINDOW_MS = 20000;

  function remember() {
    try {
      sessionStorage.setItem(
        KEY,
        JSON.stringify({ y: window.scrollY, path: location.pathname, at: Date.now() })
      );
    } catch (_) {
      /* private mode, or the quota is full — losing the position is not fatal */
    }
  }

  // Any submission may redirect, so the position is recorded as it happens.
  document.addEventListener('submit', remember, true);

  /*
   * And on links that act like commands.
   *
   * Filters, tabs and sort orders are ordinary links that reload the same
   * screen — following one should not feel like leaving the page. Links to a
   * different screen are left alone: arriving somewhere new belongs at the top.
   */
  document.addEventListener(
    'click',
    function (e) {
      var link = e.target.closest('a[href]');
      if (!link) return;
      if (link.target === '_blank' || link.hasAttribute('download')) return;

      var url;
      try {
        url = new URL(link.href, location.href);
      } catch (_) {
        return;
      }

      if (url.origin !== location.origin) return;

      // Same screen, different query: a filter rather than a destination.
      if (url.pathname === location.pathname && url.search !== location.search) remember();
    },
    true
  );

  function restore() {
    var raw;
    try {
      raw = sessionStorage.getItem(KEY);
    } catch (_) {
      return;
    }
    if (!raw) return;

    try {
      sessionStorage.removeItem(KEY);
    } catch (_) {}

    var saved;
    try {
      saved = JSON.parse(raw);
    } catch (_) {
      return;
    }

    if (!saved || saved.path !== location.pathname) return;
    if (Date.now() - saved.at > WINDOW_MS) return;
    if (!saved.y || saved.y < 60) return;

    // The browser sets its own position first; this runs after that so it wins.
    var go = function () {
      window.scrollTo({ top: saved.y, behavior: 'auto' });
    };

    go();
    requestAnimationFrame(go);
    // Once more after images and fonts settle, which can shift the layout.
    window.addEventListener('load', function () {
      requestAnimationFrame(go);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restore);
  } else {
    restore();
  }
})();
