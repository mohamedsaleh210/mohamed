const crypto = require('crypto');

/**
 * Reference numbers.
 *
 * The old format was `SND-` plus a running number, so SND-1001 told you that
 * SND-1002 existed. Now that a reference plus a phone number is enough to open
 * a request, a guessable reference would be a way in.
 *
 * Format: SND-26-K7F2Q
 *   - the year, so staff can date a file at a glance
 *   - five characters from a 31-symbol alphabet ≈ 28 million combinations
 *
 * The alphabet drops 0/O and 1/I/L — the pairs people mishear on the phone and
 * mistype from a photo.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const LENGTH = 5;

function randomPart() {
  const bytes = crypto.randomBytes(LENGTH * 2);
  let out = '';
  for (let i = 0; out.length < LENGTH && i < bytes.length; i++) {
    // Rejection sampling keeps every symbol equally likely.
    if (bytes[i] < Math.floor(256 / ALPHABET.length) * ALPHABET.length) {
      out += ALPHABET[bytes[i] % ALPHABET.length];
    }
  }
  return out.length === LENGTH ? out : randomPart();
}

/**
 * Builds a reference that is not already taken.
 * `exists` is injected so this stays independent of the database.
 */
function generate(exists, year = new Date().getFullYear()) {
  const yy = String(year).slice(-2);
  for (let attempt = 0; attempt < 40; attempt++) {
    const ref = `SND-${yy}-${randomPart()}`;
    if (!exists(ref)) return ref;
  }
  // Practically unreachable; a timestamp suffix guarantees termination.
  return `SND-${yy}-${randomPart()}${Date.now().toString(36).slice(-2).toUpperCase()}`;
}

/** Accepts the reference however the client typed it. */
function normalise(input) {
  const raw = String(input || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[–—]/g, '-');

  // Someone who types just the code, or forgets the dashes, still gets in.
  if (/^SND-\d{2}-[A-Z0-9]+$/.test(raw)) return raw;
  if (/^SND\d{2}[A-Z0-9]+$/.test(raw)) {
    return `SND-${raw.slice(3, 5)}-${raw.slice(5)}`;
  }
  return raw;
}

/**
 * Phone numbers arrive written every possible way: +201001234567,
 * 01001234567, 00201001234567. Comparing the last nine digits treats all of
 * them as the same number without needing to know the country.
 */
function phoneKey(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.slice(-9);
}

const phoneMatches = (a, b) => {
  const ka = phoneKey(a);
  const kb = phoneKey(b);
  return ka.length >= 7 && ka === kb;
};

module.exports = { generate, normalise, phoneKey, phoneMatches, ALPHABET, LENGTH };
