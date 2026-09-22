/* Sanad Design System preview — shared interactions.
   Deliberately mirrors the mechanics already in production Sanad
   (public/js/admin.js drawer + focus trap, footer.ejs mobile nav) rather
   than inventing new patterns, so this is a drop-in preview of the same
   approach, not a new interaction model. */
(function () {
  'use strict';

  // ---- V3 motion: single source of truth for "is motion allowed" ----
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- sidebar / mobile drawer (mirrors admin.js setDrawer) ----
  // V3 adds: focus moves into the drawer on open and returns to the trigger
  // on close (neither existed in V1/V2 — this is a genuine a11y addition,
  // not a behavior change to preserve), plus a body scroll lock so the page
  // behind the drawer can't scroll while it's open.
  var sidebar = document.getElementById('sidebar');
  var scrim = document.getElementById('scrim');
  var drawerOpener = null;
  function setDrawer(open, opener) {
    if (!sidebar) return;
    sidebar.classList.toggle('open', open);
    if (scrim) scrim.classList.toggle('show', open);
    document.body.classList.toggle('drawer-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
    sidebar.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      drawerOpener = opener || document.getElementById('menuBtn');
      var firstLink = sidebar.querySelector('a,button');
      if (firstLink) firstLink.focus();
    } else if (drawerOpener) {
      drawerOpener.focus();
      drawerOpener = null;
    }
  }
  document.addEventListener('click', function (e) {
    var opener = e.target.closest('#menuBtn');
    if (opener) return setDrawer(true, opener);
    if (e.target.closest('#scrim') || e.target.closest('#sidebarClose')) return setDrawer(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sidebar && sidebar.classList.contains('open')) setDrawer(false);
  });

  // ---- public site mobile nav (mirrors footer.ejs's mobile nav script) ----
  var siteNav = document.getElementById('siteNav');
  var navScrim = document.getElementById('mobileNavScrim');
  var navOpener = null;
  function setSiteNav(open, opener) {
    if (!siteNav) return;
    siteNav.classList.toggle('open', open);
    if (navScrim) navScrim.classList.toggle('show', open);
    document.body.classList.toggle('drawer-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
      navOpener = opener || document.getElementById('publicMenuBtn');
      var firstLink = siteNav.querySelector('a,button');
      if (firstLink) firstLink.focus();
    } else if (navOpener) {
      navOpener.focus();
      navOpener = null;
    }
  }
  document.addEventListener('click', function (e) {
    var opener = e.target.closest('#publicMenuBtn');
    if (opener) return setSiteNav(true, opener);
    if (e.target.closest('#mobileNavScrim') || e.target.closest('#mobileNavClose')) return setSiteNav(false);
    if (e.target.closest('#siteNav a')) return setSiteNav(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && siteNav && siteNav.classList.contains('open')) setSiteNav(false);
  });

  // ---- RTL/LTR + AR/EN live toggle (demonstrates real mirroring, not
  // just translated text) ----
  var langBtns = document.querySelectorAll('#langToggle, .js-lang-toggle');
  function applyLang(lang) {
    var dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', dir);
    document.querySelectorAll('[data-ar][data-en]').forEach(function (el) {
      el.textContent = lang === 'ar' ? el.getAttribute('data-ar') : el.getAttribute('data-en');
    });
    document.querySelectorAll('[data-lang-label]').forEach(function (el) {
      el.textContent = lang === 'ar' ? 'English' : 'العربية';
    });
    try { localStorage.setItem('sanad-preview-lang', lang); } catch (e) {}
  }
  langBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('lang') === 'ar' ? 'ar' : 'en';
      applyLang(current === 'ar' ? 'en' : 'ar');
    });
  });

  // ---- collapsible sidebar groups (full-navigation preview) ----
  // V3 adds: aria-expanded on the toggle button, and `inert` on the body
  // while collapsed so its links drop out of the tab order and can't be
  // clicked while visually hidden (not just visually clipped, as in V2).
  document.addEventListener('click', function (e) {
    var toggle = e.target.closest('.side-group-label.toggle');
    if (!toggle) return;
    var group = toggle.closest('.side-group');
    var collapsed = group.classList.toggle('collapsed');
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    var body = group.querySelector('.side-group-body');
    if (body) { if (collapsed) body.setAttribute('inert', ''); else body.removeAttribute('inert'); }
  });

  // ---- dropdowns ----
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-dropdown-trigger]');
    document.querySelectorAll('.dropdown-menu.show').forEach(function (m) {
      if (!trigger || m !== trigger.parentElement.querySelector('.dropdown-menu')) m.classList.remove('show');
    });
    if (trigger) {
      var menu = trigger.parentElement.querySelector('.dropdown-menu');
      if (menu) menu.classList.toggle('show');
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var openMenu = document.querySelector('.dropdown-menu.show');
    if (!openMenu) return;
    openMenu.classList.remove('show');
    var trigger = openMenu.parentElement.querySelector('[data-dropdown-trigger]');
    if (trigger) trigger.focus();
  });

  // ---- tabs ----
  document.querySelectorAll('[data-tabs]').forEach(function (group) {
    var tabs = group.querySelectorAll('.tab');
    var panels = document.querySelectorAll('[data-tab-panel][data-tab-group="' + group.getAttribute('data-tabs') + '"]');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var target = tab.getAttribute('data-tab');
        panels.forEach(function (p) {
          p.hidden = p.getAttribute('data-tab-panel') !== target;
        });
      });
    });
  });

  // ---- settings workspace: in-page nav switches ONE focused panel at a
  // time (V3 — was every panel stacked and visible at once in V2). Generic
  // by .settings-nav/[data-settings-panel], so any future settings-style
  // page picks this up automatically. ----
  var settingsNav = document.querySelector('.settings-nav');
  if (settingsNav) {
    var settingsLinks = settingsNav.querySelectorAll('a[href^="#"]');
    var settingsPanels = document.querySelectorAll('[data-settings-panel]');
    function showSettingsPanel(id) {
      settingsPanels.forEach(function (p) { p.hidden = p.getAttribute('data-settings-panel') !== id; });
      settingsLinks.forEach(function (l) { l.classList.toggle('active', l.getAttribute('href') === '#' + id); });
    }
    settingsLinks.forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        showSettingsPanel(link.getAttribute('href').slice(1));
      });
    });
  }

  // ---- dialogs ----
  // V3 adds: focus moves into the dialog on open (it needs tabindex="-1" to
  // be focusable itself as a fallback when it has no interactive child) and
  // returns to whatever opened it on close — same "don't lose focus" rule
  // applied to the drawer above.
  var dialogOpener = null;
  document.addEventListener('click', function (e) {
    var opener = e.target.closest('[data-dialog-open]');
    if (opener) {
      var dlg = document.getElementById(opener.getAttribute('data-dialog-open'));
      if (dlg) {
        dlg.classList.add('show');
        var ds = document.getElementById('dialogScrim');
        if (ds) ds.classList.add('show');
        dialogOpener = opener;
        var focusTarget = dlg.querySelector('[data-dialog-close],a,button,input') || dlg;
        if (!dlg.hasAttribute('tabindex')) dlg.setAttribute('tabindex', '-1');
        focusTarget.focus();
      }
    }
    if (e.target.closest('[data-dialog-close]') || e.target.id === 'dialogScrim') {
      document.querySelectorAll('.dialog.show').forEach(function (d) { d.classList.remove('show'); });
      var s = document.getElementById('dialogScrim');
      if (s) s.classList.remove('show');
      if (dialogOpener) { dialogOpener.focus(); dialogOpener = null; }
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var openDialog = document.querySelector('.dialog.show');
    if (!openDialog) return;
    openDialog.classList.remove('show');
    var s = document.getElementById('dialogScrim');
    if (s) s.classList.remove('show');
    if (dialogOpener) { dialogOpener.focus(); dialogOpener = null; }
  });

  // ---- V3: KPI count-up on reveal — data-count-to="262200" on the element
  // that already shows the final formatted number (e.g. a .role-kpi-value).
  // Reduced motion (or no IntersectionObserver) => the final value is set
  // immediately, never animated, so the number is always correct and never
  // mid-count in a screenshot taken "too early". ----
  function formatNum(n) { return n.toLocaleString('en-US'); }
  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count-to'));
    if (isNaN(target)) return;
    var suffix = el.getAttribute('data-count-suffix') || '';
    if (reduceMotion) { el.textContent = formatNum(target) + suffix; return; }
    var start = null, duration = 700;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      el.textContent = formatNum(Math.round(target * eased)) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var countEls = document.querySelectorAll('[data-count-to]');
  if (countEls.length) {
    if ('IntersectionObserver' in window && !reduceMotion) {
      var countIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { countUp(entry.target); countIO.unobserve(entry.target); }
        });
      }, { threshold: .4 });
      countEls.forEach(function (el) { countIO.observe(el); });
    } else {
      countEls.forEach(countUp);
    }
  }

  // ---- V3: staggered entrance reveal (opt-in via data-reveal), used on the
  // public homepage for the category/service/office cards and the floating
  // status cards in the hero. Falls back to an immediate reveal with no
  // IntersectionObserver, under reduced motion, or if JS never runs the
  // observer callback for some reason — content is never permanently hidden
  // by this. ----
  var revealEls = document.querySelectorAll('[data-reveal]');
  if (revealEls.length) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      revealEls.forEach(function (el) { el.classList.add('revealed'); });
    } else {
      var revealIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { entry.target.classList.add('revealed'); revealIO.unobserve(entry.target); }
        });
      }, { threshold: .15 });
      revealEls.forEach(function (el, i) {
        el.style.transitionDelay = (Math.min(i % 6, 5) * 60) + 'ms';
        revealIO.observe(el);
      });
    }
  }

  // restore saved lang on load
  try {
    var saved = localStorage.getItem('sanad-preview-lang');
    if (saved) applyLang(saved);
  } catch (e) {}
})();
