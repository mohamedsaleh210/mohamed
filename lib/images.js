const fs = require('fs');
const path = require('path');
const { UPLOAD_DIR } = require('../db');

/**
 * sharp is a native module. On most hosts it installs cleanly, but some shared
 * environments cannot build or load it. Rather than take the whole site down
 * over an image optimiser, we detect that once and carry on without it:
 * uploads still work, they are just stored as sent.
 */
let sharp = null;
let heicConvert = null;
let available = true;
let unavailableReason = '';

try {
  sharp = require('sharp');
  heicConvert = require('heic-convert');
} catch (err) {
  available = false;
  unavailableReason = err.message;
  console.warn(
    '\n  ⚠ معالجة الصور متعطّلة (sharp مش متاح على السيرفر ده).\n' +
      '    الرفع هيشتغل عادي، بس الصور هتتخزن بحجمها الأصلي\n' +
      '    وصور الآيفون (HEIC) مش هتتحوّل. السبب: ' +
      unavailableReason +
      '\n'
  );
}

// Scanned paperwork has to stay readable — small print on an ID card, a stamp
// on the back of a certificate. 2000px on the long edge at quality 82 keeps
// that legible while cutting a typical phone photo by roughly 80%.
const MAX_EDGE = 2000;
const JPEG_QUALITY = 82;

// Anything at or under this is already small enough that re-encoding would
// cost more quality than it saves bytes.
const SKIP_BELOW_BYTES = 220 * 1024;

const isHeic = (mime, name = '') =>
  /image\/(heic|heif)/i.test(mime || '') || /\.(heic|heif)$/i.test(name);

/**
 * Normalises one uploaded image in place.
 *
 * Runs on every image regardless of what the browser did, because the browser
 * step can be skipped: JavaScript disabled, an old phone, or a client who
 * pasted the file through some other path. This is the guarantee.
 *
 * Returns what actually happened so it can be reported and logged.
 */
async function normaliseImage(filePath, { mime, originalName = '' } = {}) {
  const before = fs.statSync(filePath).size;
  const result = {
    converted: false,
    resized: false,
    before,
    after: before,
    mime,
    storedName: path.basename(filePath),
    width: null,
    height: null,
  };

  // Tracked separately from `converted`: a HEIC must end up as a JPEG whether
  // heic-convert did the decoding or sharp did, and regardless of file size.
  // Leaving it as HEIC is exactly the problem this function exists to solve.
  const wasHeic = isHeic(mime, originalName);

  // Nothing to do without the native library — the file stays exactly as the
  // client sent it, which is still a usable outcome.
  if (!available) return result;

  try {
    let input = fs.readFileSync(filePath);

    // ---------------------------------------------------------------- HEIC
    // iPhones save HEIC. Windows cannot open it without a paid codec, so the
    // office would receive files nobody there can view.
    if (wasHeic) {
      try {
        input = Buffer.from(
          await heicConvert({ buffer: input, format: 'JPEG', quality: 0.9 })
        );
      } catch (err) {
        // heic-convert only handles HEVC-coded HEIC. AV1-coded files, and
        // JPEGs merely named .heic, fall through to sharp instead.
        console.warn('heic-convert declined, falling back to sharp:', err.message);
      }
    }

    const image = sharp(input, { failOn: 'none' });
    const meta = await image.metadata();

    // Nothing to do for a file that is already a small, correctly sized JPEG.
    const oversized = Math.max(meta.width || 0, meta.height || 0) > MAX_EDGE;
    if (!wasHeic && !oversized && before <= SKIP_BELOW_BYTES) {
      result.width = meta.width;
      result.height = meta.height;
      return result;
    }

    const output = await image
      // Applies the EXIF orientation tag, so a photo taken sideways is stored
      // upright instead of relying on every viewer to honour the tag.
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();

    // A HEIC is always replaced. For ordinary images, keep the new file only
    // when it is genuinely smaller — re-encoding an already-optimised JPEG
    // can make it grow.
    if (wasHeic || oversized || output.length < before) {
      const target = wasHeic ? filePath.replace(/\.(heic|heif)$/i, '.jpg') : filePath;

      fs.writeFileSync(target, output);
      if (target !== filePath) fs.unlinkSync(filePath);

      const outMeta = await sharp(output).metadata();
      result.after = output.length;
      result.resized = oversized;
      result.converted = wasHeic;
      result.mime = 'image/jpeg';
      result.storedName = path.basename(target);
      result.width = outMeta.width;
      result.height = outMeta.height;
    } else {
      result.width = meta.width;
      result.height = meta.height;
    }
  } catch (err) {
    // A file we cannot process is still a file the client sent us. Keep it as
    // uploaded rather than losing it — the office can open it another way.
    console.error('image normalise failed:', err.message);
  }

  return result;
}

/** Runs the whole batch, returning per-file outcomes plus a summary. */
async function normaliseAll(files) {
  const out = [];
  for (const f of files) {
    if (!/^image\//i.test(f.mimetype) && !isHeic(f.mimetype, f.originalname)) {
      out.push({ file: f, result: null });
      continue;
    }
    const result = await normaliseImage(path.join(UPLOAD_DIR, f.filename), {
      mime: f.mimetype,
      originalName: f.originalname,
    });
    out.push({ file: f, result });
  }

  const processed = out.filter((o) => o.result);
  return {
    files: out,
    savedBytes: processed.reduce((n, o) => n + (o.result.before - o.result.after), 0),
    convertedCount: processed.filter((o) => o.result.converted).length,
  };
}

module.exports = {
  normaliseImage,
  normaliseAll,
  isHeic,
  MAX_EDGE,
  JPEG_QUALITY,
  available: () => available,
  unavailableReason: () => unavailableReason,
};
