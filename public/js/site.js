(function () {
  'use strict';
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ------------------------------------------------------------ KPI count-up
  // Same utility as the admin panel's data-count-to (public/js/admin.js),
  // ported here since the public site loads its own script, not admin.js.
  function formatNum(n) { return Math.round(n).toLocaleString('en-US'); }

  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count-to'));
    if (!isFinite(target)) return;
    var suffix = el.getAttribute('data-count-suffix') || '';
    if (reduceMotion) { el.textContent = formatNum(target) + suffix; return; }
    var duration = 700, start = null;
    function ease(t) { return 1 - Math.pow(1 - t, 3); }
    function tick(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      el.textContent = formatNum(target * ease(p)) + suffix;
      if (p < 1) window.requestAnimationFrame(tick);
    }
    window.requestAnimationFrame(tick);
  }

  var countEls = document.querySelectorAll('[data-count-to]');
  if (countEls.length) {
    if ('IntersectionObserver' in window && !reduceMotion) {
      var countObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { countUp(entry.target); countObserver.unobserve(entry.target); }
        });
      }, { threshold: 0.4 });
      countEls.forEach(function (el) { countObserver.observe(el); });
    } else {
      countEls.forEach(countUp);
    }
  }

  // ------------------------------------------------------------ scroll reveal
  // .reveal elements start hidden (opacity/transform, in CSS) and fade/rise
  // in once, the first time they cross into view. A long marketing page
  // benefits from scroll-triggered reveal (unlike the always-visible admin
  // dashboard, which uses a plain on-load CSS animation instead) — sections
  // below the fold would otherwise finish an on-load animation before the
  // visitor ever scrolls to them. Skipped entirely under reduced motion:
  // reveal elements are simply visible from the start (see the CSS guard).
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var revealEls = document.querySelectorAll('.reveal, .reveal-stagger > *');
    if (revealEls.length) {
      var revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
      revealEls.forEach(function (el) { revealObserver.observe(el); });

      // Safety net: an instant jump to an anchor, a print, or any path that
      // never scrolls an element gently into view would otherwise leave it
      // at opacity:0 forever. Anything still unrevealed a couple of seconds
      // after load is shown outright — real content must never depend on a
      // scroll gesture actually happening.
      window.setTimeout(function () {
        document.querySelectorAll('.reveal:not(.in-view), .reveal-stagger > *:not(.in-view)').forEach(function (el) {
          el.classList.add('in-view');
        });
      }, 2000);
    }
  }

  // ------------------------------------------------------------ FAQ accordion
  // Native <details> already opens/closes with no JS. This only adds a
  // smooth height transition on top of that real toggle — closing one
  // <details> when another opens in the same group is left to the browser
  // (each is independent, matching the original behavior).
  document.querySelectorAll('.faq-item, .home-faq details').forEach(function (d) {
    var summary = d.querySelector('summary');
    var body = d.querySelector('p');
    if (!summary || !body) return;
    summary.addEventListener('click', function (e) {
      e.preventDefault();
      var opening = !d.open;
      if (opening) {
        d.open = true;
        var h = body.scrollHeight;
        body.style.maxHeight = '0px';
        requestAnimationFrame(function () { body.style.maxHeight = h + 'px'; });
      } else {
        body.style.maxHeight = body.scrollHeight + 'px';
        requestAnimationFrame(function () { body.style.maxHeight = '0px'; });
        body.addEventListener('transitionend', function onEnd() {
          d.open = false; body.style.maxHeight = '';
          body.removeEventListener('transitionend', onEnd);
        });
      }
    });
  });
})();
