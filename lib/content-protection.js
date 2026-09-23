const { getSetting, getBool } = require('../db');

/**
 * Public-website content protection.
 *
 * Deterrence, not real security: a browser cannot stop a person from
 * photographing their own screen, and this never claims otherwise (see the
 * settings view and content-protection.js for the wording). What it does do —
 * disable the obvious "right-click, save image", drag-out-of-the-page, and
 * select-and-copy paths, and optionally lay a faint watermark over protected
 * media — is enough to stop casual copying without pretending to be a lock.
 *
 * Scope is the public marketing site only. Nothing here ever touches the
 * admin panel, the client portal, forms, or print/PDF output — see
 * views/partials/head.ejs / footer.ejs, which are exclusive to the public
 * layout, for where this actually gets wired onto a page.
 */
/** Escapes text for safe placement inside an SVG <text> node. */
function escapeSvgText(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A small tileable SVG — one rotated line of the watermark text — encoded as
 * a data: URI so the CSS can lay it over protected media with a plain
 * background-image, no client-side drawing and nothing for a screen reader
 * to pick up (background images are never exposed to assistive tech).
 */
function watermarkSvgDataUri(text, opacityPercent) {
  const opacity = Math.max(0.01, Math.min(0.4, opacityPercent / 100)).toFixed(2);
  const safeText = escapeSvgText(text);
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160">' +
    `<text x="160" y="85" font-family="Tajawal, Arial, sans-serif" font-size="22" font-weight="700" ` +
    `fill="#ffffff" fill-opacity="${opacity}" text-anchor="middle" transform="rotate(-28 160 85)">${safeText}</text>` +
    '</svg>';
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function config() {
  const watermarkEnabled = getBool('content_protection_watermark_enabled', false);
  const watermarkText = getSetting('content_protection_watermark_text', '') || 'Sanad | سند';
  // Stored as a whole percent (1-40) so the settings form can use a plain
  // number input; watermarkSvgDataUri converts it to a CSS opacity value.
  const watermarkOpacity = Math.min(40, Math.max(1, parseInt(getSetting('content_protection_watermark_opacity', '8'), 10) || 8));

  return {
    enabled: getBool('content_protection_enabled', false),
    blockSelect: getBool('content_protection_block_select', true),
    blockDrag: getBool('content_protection_block_drag', true),
    blockContextMenu: getBool('content_protection_block_contextmenu', true),
    watermarkEnabled,
    watermarkText,
    watermarkOpacity,
    watermarkCss: watermarkEnabled ? watermarkSvgDataUri(watermarkText, watermarkOpacity) : 'none',
  };
}

module.exports = { config, watermarkSvgDataUri };
