/* Sanad Design System preview — shared interactions.
   Deliberately mirrors the mechanics already in production Sanad
   (public/js/admin.js drawer + focus trap, footer.ejs mobile nav) rather
   than inventing new patterns, so this is a drop-in preview of the same
   approach, not a new interaction model. */
(function () {
  'use strict';

  // ---- sidebar / mobile drawer (mirrors admin.js setDrawer) ----
  var sidebar = document.getElementById('sidebar');
  var scrim = document.getElementById('scrim');
  function setDrawer(open) {
    if (!sidebar) return;
    sidebar.classList.toggle('open', open);
    if (scrim) scrim.classList.toggle('show', open);
    document.body.classList.toggle('drawer-open', open);
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('#menuBtn')) return setDrawer(true);
    if (e.target.closest('#scrim') || e.target.closest('#sidebarClose')) return setDrawer(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setDrawer(false);
  });

  // ---- public site mobile nav (mirrors footer.ejs's mobile nav script) ----
  var siteNav = document.getElementById('siteNav');
  var navScrim = document.getElementById('mobileNavScrim');
  function setSiteNav(open) {
    if (!siteNav) return;
    siteNav.classList.toggle('open', open);
    if (navScrim) navScrim.classList.toggle('show', open);
    document.body.classList.toggle('drawer-open', open);
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('#publicMenuBtn')) return setSiteNav(true);
    if (e.target.closest('#mobileNavScrim') || e.target.closest('#mobileNavClose')) return setSiteNav(false);
    if (e.target.closest('#siteNav a')) return setSiteNav(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setSiteNav(false);
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

  // ---- dialogs ----
  document.addEventListener('click', function (e) {
    var opener = e.target.closest('[data-dialog-open]');
    if (opener) {
      var dlg = document.getElementById(opener.getAttribute('data-dialog-open'));
      if (dlg) { dlg.classList.add('show'); document.getElementById('dialogScrim').classList.add('show'); }
    }
    if (e.target.closest('[data-dialog-close]') || e.target.id === 'dialogScrim') {
      document.querySelectorAll('.dialog.show').forEach(function (d) { d.classList.remove('show'); });
      var s = document.getElementById('dialogScrim');
      if (s) s.classList.remove('show');
    }
  });

  // restore saved lang on load
  try {
    var saved = localStorage.getItem('sanad-preview-lang');
    if (saved) applyLang(saved);
  } catch (e) {}
})();
