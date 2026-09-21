/**
 * Live feedback for password fields.
 *
 * Mirrors lib/password.js. The server is what actually enforces the policy;
 * this exists so nobody discovers the rules by being rejected.
 *
 * Markup contract:
 *   <input data-pw="new">          the password being chosen
 *   <input data-pw="confirm">      the re-typed copy
 *   <div  data-pw-meter></div>     strength bar (optional)
 *   <ul   data-pw-rules></ul>      checklist (optional)
 *   <p    data-pw-match></p>       match message (optional)
 *   <button data-pw-suggest>       fills both fields (optional)
 *   <button data-pw-toggle>        show/hide (optional)
 */
(function () {
  'use strict';

  var MIN = 10;

  var RULES = [
    { id: 'length', ar: MIN + ' حروف على الأقل', en: 'At least ' + MIN + ' characters',
      test: function (p) { return p.length >= MIN; } },
    { id: 'letter', ar: 'حرف إنجليزي (a-z)', en: 'A letter (a-z)',
      test: function (p) { return /[a-z]/i.test(p); } },
    { id: 'upper', ar: 'حرف كبير (A-Z)', en: 'A capital letter (A-Z)',
      test: function (p) { return /[A-Z]/.test(p); } },
    { id: 'digit', ar: 'رقم (0-9)', en: 'A number (0-9)',
      test: function (p) { return /\d/.test(p); } },
    { id: 'symbol', ar: 'رمز (!@#$%&*…)', en: 'A symbol (!@#$%&*…)',
      test: function (p) { return /[^A-Za-z0-9]/.test(p); } },
  ];

  var LANG = document.documentElement.getAttribute('lang') === 'en' ? 'en' : 'ar';
  var TXT = {
    ar: { weak: 'ضعيفة', fair: 'مقبولة', good: 'كويسة', strong: 'قوية',
          match: 'الكلمتان متطابقتان', noMatch: 'الكلمتان مش متطابقتين' },
    en: { weak: 'Weak', fair: 'Fair', good: 'Good', strong: 'Strong',
          match: 'Passwords match', noMatch: 'Passwords do not match' },
  }[LANG];

  function strength(p) {
    if (!p) return 0;
    var score = 0;
    if (p.length >= MIN) score += 1;
    if (p.length >= 14) score += 1;
    var classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(function (r) {
      return r.test(p);
    }).length;
    if (classes >= 3) score += 1;
    if (classes === 4) score += 1;
    return Math.min(4, score);
  }

  function suggest() {
    var lower = 'abcdefghjkmnpqrstuvwxyz';
    var upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
    var digits = '23456789';
    var symbols = '!@#$%&*?';
    var all = lower + upper + digits + symbols;
    var pick = function (s) { return s[Math.floor(Math.random() * s.length)]; };
    var out = [pick(lower), pick(upper), pick(digits), pick(symbols)];
    while (out.length < 14) out.push(pick(all));
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out.join('');
  }

  document.querySelectorAll('[data-pw="new"]').forEach(function (input) {
    // Each field looks for its companions inside the nearest form, so several
    // password forms can share one page without interfering.
    var scope = input.closest('form') || document;
    var confirmField = scope.querySelector('[data-pw="confirm"]');
    var meter = scope.querySelector('[data-pw-meter]');
    var rulesBox = scope.querySelector('[data-pw-rules]');
    var matchBox = scope.querySelector('[data-pw-match]');
    var submitBtn = scope.querySelector('button[type="submit"]');

    // These regions update live as the user types, with no page reload, so a
    // screen reader needs an explicit live region to ever announce them.
    if (meter) meter.setAttribute('aria-live', 'polite');
    if (rulesBox) rulesBox.setAttribute('aria-live', 'polite');
    if (matchBox) matchBox.setAttribute('aria-live', 'polite');

    if (rulesBox && !rulesBox.children.length) {
      RULES.forEach(function (r) {
        var li = document.createElement('li');
        li.setAttribute('data-rule', r.id);
        li.innerHTML = '<span class="pw-dot"></span><span>' + (r[LANG] || r.ar) + '</span>';
        rulesBox.appendChild(li);
      });
    }

    function paint() {
      var p = input.value;
      var allPass = true;

      RULES.forEach(function (r) {
        var ok = r.test(p);
        if (!ok) allPass = false;
        if (!rulesBox) return;
        var li = rulesBox.querySelector('[data-rule="' + r.id + '"]');
        if (li) li.classList.toggle('ok', ok);
      });

      if (meter) {
        var s = strength(p);
        meter.setAttribute('data-level', p ? String(s) : '0');
        var label = meter.querySelector('.pw-label');
        if (label) {
          label.textContent = !p ? '' : s <= 1 ? TXT.weak : s === 2 ? TXT.fair : s === 3 ? TXT.good : TXT.strong;
        }
      }

      var matched = true;
      if (confirmField) {
        var c = confirmField.value;
        matched = !c || c === p;
        if (matchBox) {
          matchBox.textContent = !c ? '' : matched ? TXT.match : TXT.noMatch;
          matchBox.className = 'pw-match ' + (!c ? '' : matched ? 'ok' : 'bad');
        }
        if (c) confirmField.classList.toggle('pw-bad', !matched);
      }

      // The button is a hint, not the gate — the server still validates.
      if (submitBtn) {
        var ready = allPass && (!confirmField || (confirmField.value && matched));
        submitBtn.classList.toggle('pw-not-ready', !ready);
      }
    }

    input.addEventListener('input', paint);
    if (confirmField) confirmField.addEventListener('input', paint);
    paint();

    var suggestBtn = scope.querySelector('[data-pw-suggest]');
    if (suggestBtn) {
      suggestBtn.addEventListener('click', function () {
        var value = suggest();
        input.value = value;
        if (confirmField) confirmField.value = value;
        input.type = 'text';
        if (confirmField) confirmField.type = 'text';
        paint();
        input.focus();
        input.select();
      });
    }

    var toggleBtn = scope.querySelector('[data-pw-toggle]');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        if (confirmField) confirmField.type = show ? 'text' : 'password';
        toggleBtn.textContent = show
          ? (LANG === 'en' ? 'Hide' : 'إخفاء')
          : (LANG === 'en' ? 'Show' : 'إظهار');
      });
    }
  });
})();
