/* Sanad admin — drawer navigation, reordering, and confirmations. */
(function () {
  'use strict';

  // ------------------------------------------------------------ alert announcements
  // Server-rendered .alert banners (validation errors, save confirmations)
  // had no ARIA role, so screen readers never announced them. This only sets
  // an attribute on markup the server already rendered — no change to when
  // alerts appear, their text, or form submission/validation behavior.
  document.querySelectorAll('.alert').forEach(function (el) {
    if (el.hasAttribute('role')) return;
    var isError = el.classList.contains('err') || el.classList.contains('danger');
    el.setAttribute('role', isError ? 'alert' : 'status');
    if (!isError) el.setAttribute('aria-live', 'polite');
  });

  // ------------------------------------------------------------ drawer
  var sidebar = document.getElementById('sidebar');
  var scrim = document.getElementById('scrim');
  var drawerReturnFocus = null;
  var drawerScrollY = 0;

  function drawerFocusable() {
    if (!sidebar) return [];
    return Array.prototype.slice.call(sidebar.querySelectorAll(
      'a[href], button:not([disabled]), summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(function (el) { return el.offsetParent !== null; });
  }

  function setDrawer(open) {
    if (!sidebar) return;
    if (open) {
      drawerReturnFocus = document.activeElement;
      drawerScrollY = window.scrollY || 0;
      document.body.style.top = '-' + drawerScrollY + 'px';
    }
    sidebar.classList.toggle('open', open);
    if (scrim) scrim.classList.toggle('show', open);
    document.body.classList.toggle('drawer-open', open);
    sidebar.setAttribute('aria-hidden', open ? 'false' : (window.innerWidth < 1000 ? 'true' : 'false'));
    var btn = document.getElementById('menuBtn');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      window.setTimeout(function () {
        var focusables = drawerFocusable();
        if (focusables[0]) focusables[0].focus();
      }, 30);
    } else {
      document.body.style.top = '';
      window.scrollTo(0, drawerScrollY);
      if (drawerReturnFocus && drawerReturnFocus.focus) drawerReturnFocus.focus();
    }
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('#menuBtn')) return setDrawer(true);
    if (e.target.closest('#sidebarClose') || e.target.closest('#scrim')) return setDrawer(false);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setDrawer(false);
    if (e.key === 'Tab' && sidebar && sidebar.classList.contains('open')) {
      var focusables = drawerFocusable();
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  window.addEventListener('resize', function () {
    if (window.innerWidth >= 1000) {
      sidebar && sidebar.classList.remove('open');
      scrim && scrim.classList.remove('show');
      document.body.classList.remove('drawer-open');
      document.body.style.top = '';
      sidebar && sidebar.setAttribute('aria-hidden', 'false');
    } else if (sidebar && !sidebar.classList.contains('open')) {
      sidebar.setAttribute('aria-hidden', 'true');
    }
  });
  if (sidebar) sidebar.setAttribute('aria-hidden', window.innerWidth < 1000 ? 'true' : 'false');

  // ------------------------------------------------------------ responsive tables
  // Card-mode tables need a human label for every value. Older screens did
  // not add data-label to each cell, so derive it from the matching <th> once
  // in the browser. This keeps all existing EJS routes/data untouched.
  document.querySelectorAll('table.tbl').forEach(function (table) {
    var heads = Array.prototype.map.call(table.querySelectorAll('thead th'), function (th) {
      return (th.textContent || '').trim();
    });
    table.querySelectorAll('tbody tr').forEach(function (row) {
      Array.prototype.forEach.call(row.children, function (cell, i) {
        if (cell.tagName === 'TD' && !cell.hasAttribute('data-label')) {
          cell.setAttribute('data-label', heads[i] || '');
        }
      });
    });
  });

  if (sidebar) {
    sidebar.addEventListener('click', function (e) {
      if (window.innerWidth < 1000 && e.target.closest('a')) setDrawer(false);
    });
  }

  // ------------------------------------------------------------ confirmations
  // Any form carrying data-confirm asks before it submits.
  document.addEventListener('submit', function (e) {
    var msg = e.target.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) e.preventDefault();
  });

  // ------------------------------------------------------------ reordering
  var statusPill = null;

  function flash(text, isError) {
    if (!statusPill) {
      statusPill = document.createElement('div');
      statusPill.className = 'sort-status';
      statusPill.setAttribute('role', 'status');
      statusPill.setAttribute('aria-live', 'polite');
      document.body.appendChild(statusPill);
    }
    statusPill.textContent = text;
    statusPill.style.background = isError ? '#c15450' : '#12303a';
    statusPill.classList.add('show');
    clearTimeout(flash._t);
    flash._t = setTimeout(function () {
      statusPill.classList.remove('show');
    }, 2200);
  }

  function csrfToken() {
    var m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute('content') : '';
  }

  function refreshArrows(list) {
    var items = list.querySelectorAll('.sort-item');
    items.forEach(function (item, i) {
      var up = item.querySelector('[data-move="up"]');
      var down = item.querySelector('[data-move="down"]');
      if (up) up.disabled = i === 0;
      if (down) down.disabled = i === items.length - 1;
    });
  }

  function save(list) {
    var ids = Array.prototype.map.call(list.querySelectorAll('.sort-item'), function (el) {
      return Number(el.getAttribute('data-id'));
    });

    var payload = { ids: ids };
    if (list.getAttribute('data-category-id')) {
      payload.category_id = Number(list.getAttribute('data-category-id'));
    }

    fetch(list.getAttribute('data-reorder-url'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken() },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        if (!r.ok) throw new Error('failed');
        flash('تم حفظ الترتيب');
      })
      .catch(function () {
        flash('الترتيب مااتحفظش — حدّث الصفحة وجرّب تاني', true);
      });
  }

  // Some lists interleave a hidden editor row between items; those carry
  // data-no-drag and must never be counted in the order that gets saved.
  document.querySelectorAll('.sortable[data-reorder-url]').forEach(function (list) {
    refreshArrows(list);

    // --- arrows (primary on touch screens) ---
    list.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-move]');
      if (!btn) return;
      e.preventDefault();

      var item = btn.closest('.sort-item');
      if (btn.getAttribute('data-move') === 'up') {
        var prev = item.previousElementSibling;
        if (prev) item.parentNode.insertBefore(item, prev);
      } else {
        var next = item.nextElementSibling;
        if (next) item.parentNode.insertBefore(next, item);
      }

      refreshArrows(list);
      save(list);

      // Keep focus on the button that moved so repeated taps keep working.
      var again = item.querySelector('[data-move="' + btn.getAttribute('data-move') + '"]');
      if (again && !again.disabled) again.focus();
    });

    // --- drag and drop (desktop) ---
    var dragging = null;

    list.addEventListener('pointerdown', function (e) {
      var grip = e.target.closest('.grip');
      if (!grip) return;
      var item = grip.closest('.sort-item');
      if (item) item.setAttribute('draggable', 'true');
    });

    list.addEventListener('dragstart', function (e) {
      var item = e.target.closest('.sort-item');
      if (!item) return;
      dragging = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      // Firefox needs data set for the drag to start at all.
      e.dataTransfer.setData('text/plain', item.getAttribute('data-id'));
    });

    list.addEventListener('dragover', function (e) {
      if (!dragging) return;
      e.preventDefault();
      var over = e.target.closest('.sort-item');
      if (!over || over === dragging) return;

      var rect = over.getBoundingClientRect();
      var after = e.clientY > rect.top + rect.height / 2;
      list.insertBefore(dragging, after ? over.nextSibling : over);
    });

    list.addEventListener('dragend', function () {
      if (!dragging) return;
      dragging.classList.remove('dragging');
      dragging.removeAttribute('draggable');
      dragging = null;
      refreshArrows(list);
      save(list);
    });

    list.addEventListener('drop', function (e) {
      e.preventDefault();
    });
  });
})();
