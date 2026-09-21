/**
 * One password policy, applied everywhere a password is set: staff changing
 * their own, an admin creating or resetting an account, and client
 * registration. Keeping it in one file means the rules on screen and the rules
 * enforced on the server can never drift apart.
 */
const crypto = require('crypto');
const MIN_LENGTH = 10;

const RULES = [
  {
    id: 'length',
    ar: `${MIN_LENGTH} حروف على الأقل`,
    en: `At least ${MIN_LENGTH} characters`,
    test: (p) => p.length >= MIN_LENGTH,
  },
  {
    id: 'letter',
    ar: 'حرف إنجليزي واحد على الأقل (a-z)',
    en: 'At least one letter (a-z)',
    test: (p) => /[a-z]/i.test(p),
  },
  {
    id: 'upper',
    ar: 'حرف كبير واحد على الأقل (A-Z)',
    en: 'At least one capital letter (A-Z)',
    test: (p) => /[A-Z]/.test(p),
  },
  {
    id: 'digit',
    ar: 'رقم واحد على الأقل (0-9)',
    en: 'At least one number (0-9)',
    test: (p) => /\d/.test(p),
  },
  {
    id: 'symbol',
    ar: 'رمز واحد على الأقل (!@#$%&*…)',
    en: 'At least one symbol (!@#$%&*…)',
    test: (p) => /[^A-Za-z0-9]/.test(p),
  },
];

// Passwords that satisfy every rule on paper and are still the first thing an
// attacker tries. Checked case-insensitively against the whole password.
const BANNED = [
  'password1!',
  'password123!',
  'passw0rd!',
  'admin@1234',
  'admin@123',
  'qwerty123!',
  'welcome@123',
  'sanad@1234',
  'sanad@123',
  'p@ssw0rd',
  'p@ssword1',
  'abcd@1234',
  '1234@abcd',
];

/**
 * Returns the rules that were not met. An empty array means the password is
 * acceptable.
 */
function check(password, { lang = 'ar', username = '' } = {}) {
  const p = String(password || '');
  const failed = RULES.filter((r) => !r.test(p)).map((r) => ({ id: r.id, message: r[lang] || r.ar }));

  const lower = p.toLowerCase();

  if (BANNED.some((b) => lower === b || lower.includes(b))) {
    failed.push({
      id: 'common',
      message:
        lang === 'en'
          ? 'This password is too common — choose something else'
          : 'كلمة المرور دي متوقّعة جداً — اختار حاجة تانية',
    });
  }

  if (username && username.length >= 3 && lower.includes(String(username).toLowerCase())) {
    failed.push({
      id: 'username',
      message:
        lang === 'en'
          ? 'The password must not contain the username'
          : 'كلمة المرور مينفعش تحتوي على اسم المستخدم',
    });
  }

  // Four or more identical characters in a row reads as padding, not a password.
  if (/(.)\1{3,}/.test(p)) {
    failed.push({
      id: 'repeat',
      message:
        lang === 'en'
          ? 'Avoid repeating the same character four times or more'
          : 'متكررش نفس الحرف ٤ مرات أو أكتر',
    });
  }

  return failed;
}

const isValid = (password, opts) => check(password, opts).length === 0;

/** A single sentence naming what is still missing, for a form error banner. */
function firstMessage(password, opts = {}) {
  const failed = check(password, opts);
  if (!failed.length) return null;
  const lang = opts.lang || 'ar';
  const lead = lang === 'en' ? 'Password needs: ' : 'كلمة المرور ناقصها: ';
  return lead + failed.map((f) => f.message).join(' · ');
}

/** Rule list for rendering the on-screen checklist. */
const describe = (lang = 'ar') => RULES.map((r) => ({ id: r.id, message: r[lang] || r.ar }));

/** Rough strength score for the meter, 0–4. */
function strength(password) {
  const p = String(password || '');
  if (!p) return 0;

  let score = 0;
  if (p.length >= MIN_LENGTH) score += 1;
  if (p.length >= 14) score += 1;

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  if (classes >= 3) score += 1;
  if (classes === 4) score += 1;

  return Math.min(4, score);
}

/** Generates a compliant password for the "suggest one" button. */
function suggest() {
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%&*?';
  const all = lower + upper + digits + symbols;

  const pick = (set) => set[Math.floor(Math.random() * set.length)];

  // Guarantee one of each class first, then fill and shuffle.
  const out = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  while (out.length < 14) out.push(pick(all));

  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}

/**
 * Easy-to-read one-time password for printed cards and bulk imports.
 * It still satisfies the full password policy and is replaced on first login.
 * Example: Snd@482739
 */
function suggestTemporary() {
  let digits;
  do {
    digits = String(crypto.randomInt(100000, 1000000));
  } while (/(.)\1{3,}/.test(digits));
  return `Snd@${digits}`;
}

module.exports = { MIN_LENGTH, check, isValid, firstMessage, describe, strength, suggest, suggestTemporary, RULES };
