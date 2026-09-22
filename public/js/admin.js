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

  // ------------------------------------------------------- success alert auto-recede
  // A save confirmation (.alert.ok) recedes on its own after a few seconds so
  // it doesn't linger as stale chrome once the user has moved on — but only
  // when the visitor hasn't asked for reduced motion (WCAG 2.2.1: the timer
  // itself, not just its animation, is skipped, per ui-ux-pro-max's
  // auto-dismiss guidance in design-review/v4/checkpoint-1/UIUX-PRO-MAX-USAGE.md).
  // Error/warning banners are never auto-dismissed — they need a read and,
  // often, a next action.
  if (!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    document.querySelectorAll('.alert.ok').forEach(function (el) {
      setTimeout(function () { el.classList.add('alert-recede'); }, 4000);
    });
  }

  // ------------------------------------------------------- workspace tab rail scroll-into-view
  // The tabs themselves are plain radio+label — no JS needed to select one.
  // This only keeps the chosen tab's label inside the visible, scrollable
  // rail on narrow screens (Checkpoint 1 correction pass, item 1), so
  // clicking/arrow-keying to a tab near the masked edge doesn't leave its
  // label half-hidden under the fade.
  var tabScrollReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('.wtabs-input').forEach(function (input) {
    input.addEventListener('change', function () {
      if (!input.checked) return;
      var label = document.querySelector('label[for="' + input.id + '"]');
      if (label && label.scrollIntoView) {
        label.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: tabScrollReduced ? 'auto' : 'smooth' });
      }
    });
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

  // ------------------------------------------------------------ KPI count-up
  // Phase 2 V3: ports the same data-count-to utility approved in
  // design/sanad-phase1-preview (design-preview/assets/app.js) — animates a
  // stat's numeric value up from 0 once, the first time it scrolls into
  // view. Purely additive: a stat with no data-count-to attribute (the
  // large majority of Sanad's existing .stat/.v markup) is completely
  // unaffected. Respects prefers-reduced-motion independently of the CSS
  // media query above, since this is a JS rAF loop, not a CSS transition.
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function formatNum(n) {
    return Math.round(n).toLocaleString('en-US');
  }

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
          if (entry.isIntersecting) {
            countUp(entry.target);
            countObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.4 });
      countEls.forEach(function (el) { countObserver.observe(el); });
    } else {
      countEls.forEach(countUp);
    }
  }

  // ------------------------------------------------------- searchable select
  // Progressive enhancement over a real <select> (V4 Checkpoint 2). The
  // <select> stays in the DOM as the single source of truth — its `value`
  // and `change` event are what every existing page script (form submission,
  // request_new.ejs's company->branch cascading filter, users.ejs's row
  // filter) already reads, so none of that had to change. This only adds a
  // type-to-filter input + listbox that read the select's *current* options
  // (skipping ones a page has set `hidden` on, e.g. a cascading filter) and,
  // on pick, set `select.value` + dispatch a real `change` event exactly as
  // if the native control had fired it.
  var sselIdSeq = 0;

  function sselBuildList(state) {
    state.list.innerHTML = '';
    state.items = [];
    var term = state.input.value.trim().toLowerCase();
    var options = Array.prototype.filter.call(state.select.options, function (o) {
      return !o.hidden && !o.disabled && o.value !== '';
    });
    var matches = options.filter(function (o) {
      return !term || o.textContent.toLowerCase().indexOf(term) !== -1;
    });
    if (!matches.length) {
      var empty = document.createElement('li');
      empty.className = 'ssel-empty';
      empty.textContent = term ? 'مفيش نتائج مطابقة' : 'مفيش خيارات متاحة';
      state.list.appendChild(empty);
      return;
    }
    matches.forEach(function (opt, i) {
      var li = document.createElement('li');
      li.className = 'ssel-opt';
      li.id = state.id + '-opt-' + i;
      li.setAttribute('role', 'option');
      li.textContent = opt.textContent;
      li.dataset.value = opt.value;
      if (opt.value === state.select.value) li.setAttribute('aria-selected', 'true');
      li.addEventListener('mousedown', function (e) {
        e.preventDefault();
        sselChoose(state, opt);
      });
      state.list.appendChild(li);
      state.items.push({ el: li, opt: opt });
    });
  }

  function sselSetActive(state, index) {
    state.items.forEach(function (it) { it.el.classList.remove('active'); });
    state.activeIndex = index;
    if (index < 0 || index >= state.items.length) {
      state.input.removeAttribute('aria-activedescendant');
      return;
    }
    var it = state.items[index];
    it.el.classList.add('active');
    it.el.scrollIntoView({ block: 'nearest' });
    state.input.setAttribute('aria-activedescendant', it.el.id);
  }

  function sselOpen(state) {
    sselBuildList(state);
    state.wrap.classList.add('open');
    state.input.setAttribute('aria-expanded', 'true');
    sselSetActive(state, -1);
  }

  function sselClose(state) {
    state.wrap.classList.remove('open');
    state.input.setAttribute('aria-expanded', 'false');
    sselSetActive(state, -1);
  }

  function sselChoose(state, opt) {
    var changed = state.select.value !== opt.value;
    state.select.value = opt.value;
    state.input.value = opt.value ? opt.textContent.trim() : '';
    // Setting .value here is a direct property assignment, so no "input"
    // event fires — the listener that clears a stale required-field
    // validity message (set by an earlier failed submit) never runs on its
    // own. Clear it here too, or a valid pick after one failed attempt
    // would stay silently invalid and keep blocking submission.
    state.input.setCustomValidity('');
    state.wrap.classList.toggle('has-value', !!opt.value);
    sselClose(state);
    if (changed) state.select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function sselSync(select) {
    var state = select.__sselState;
    if (!state) return;
    var current = select.options[select.selectedIndex];
    var isRealValue = current && current.value !== '' && !current.hidden;
    state.input.value = isRealValue ? current.textContent.trim() : '';
    state.wrap.classList.toggle('has-value', !!isRealValue);
    if (state.wrap.classList.contains('open')) sselBuildList(state);
  }

  function initSearchableSelect(select) {
    if (select.__sselState) return;
    sselIdSeq += 1;
    var id = 'ssel-' + sselIdSeq;

    var labelText = select.getAttribute('aria-label') || '';
    var labelEl = select.closest('label');
    if (!labelText && labelEl) {
      labelText = Array.prototype.slice.call(labelEl.childNodes)
        .filter(function (n) { return n.nodeType === 3; })
        .map(function (n) { return n.textContent.trim(); })
        .join(' ').trim();
    } else if (!labelText && select.id) {
      var forLabel = document.querySelector('label[for="' + select.id + '"]');
      if (forLabel) labelText = forLabel.textContent.trim();
    }

    var wrap = document.createElement('div');
    wrap.className = 'ssel';
    select.parentNode.insertBefore(wrap, select);
    select.classList.add('ssel-native');
    select.setAttribute('tabindex', '-1');
    select.setAttribute('aria-hidden', 'true');
    wrap.appendChild(select);

    var inputWrap = document.createElement('div');
    inputWrap.className = 'ssel-input-wrap';
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'ssel-input';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', id + '-list');
    input.setAttribute('autocomplete', 'off');
    input.placeholder = select.getAttribute('data-placeholder') || 'بحث…';
    if (labelText) input.setAttribute('aria-label', labelText);
    inputWrap.appendChild(input);

    // The real <select> stays required for actual constraint validation
    // (the browser still blocks submission on it), but it's visually a
    // 1x1px transparent box, so its own native bubble would try to anchor
    // there. The "invalid" event fires on the select itself before the
    // browser shows that bubble — suppress it there and report on the
    // visible input instead, which sits in the right place on screen.
    if (select.required) {
      select.addEventListener('invalid', function (e) {
        e.preventDefault();
        input.setCustomValidity('من فضلك اختر قيمة.');
        input.reportValidity();
        input.focus();
      });
      input.addEventListener('input', function () { input.setCustomValidity(''); select.setCustomValidity(''); });
    }

    var clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'ssel-clear';
    clearBtn.setAttribute('aria-label', 'مسح الاختيار');
    clearBtn.textContent = '×';
    inputWrap.appendChild(clearBtn);
    wrap.appendChild(inputWrap);

    var list = document.createElement('ul');
    list.className = 'ssel-list';
    list.id = id + '-list';
    list.setAttribute('role', 'listbox');
    wrap.appendChild(list);

    var state = {
      id: id, select: select, wrap: wrap, input: input, list: list, items: [], activeIndex: -1,
    };
    select.__sselState = state;

    var current = select.options[select.selectedIndex];
    if (current && current.value !== '') {
      input.value = current.textContent.trim();
      wrap.classList.add('has-value');
    }

    input.addEventListener('focus', function () { sselOpen(state); });
    input.addEventListener('input', function () { sselOpen(state); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!state.wrap.classList.contains('open')) { sselOpen(state); return; }
        sselSetActive(state, Math.min(state.activeIndex + 1, state.items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        sselSetActive(state, Math.max(state.activeIndex - 1, 0));
      } else if (e.key === 'Enter') {
        if (state.wrap.classList.contains('open') && state.activeIndex > -1) {
          e.preventDefault();
          sselChoose(state, state.items[state.activeIndex].opt);
        }
      } else if (e.key === 'Escape') {
        if (state.wrap.classList.contains('open')) { e.preventDefault(); sselClose(state); }
      }
    });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) sselClose(state);
    });
    clearBtn.addEventListener('click', function () {
      var blank = Array.prototype.filter.call(select.options, function (o) { return o.value === ''; })[0];
      sselChoose(state, blank || { value: '', textContent: '' });
      input.focus();
    });
  }

  document.querySelectorAll('select[data-searchable]').forEach(initSearchableSelect);
  // Exposed so a page's own script can re-sync a searchable select's visible
  // text/option list after it changes the underlying <select> directly
  // (e.g. request_new.ejs resetting the branch when the company changes).
  window.SanadSearchableSelect = { sync: sselSync };
})();
