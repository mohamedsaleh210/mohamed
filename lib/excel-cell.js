'use strict';

// ExcelJS may expose a visible cell as an object (hyperlink, formula or rich text).
// Always extract the displayed value before validation or persistence.
function text(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 16).replace('T', ' ');
  if (typeof value === 'object') {
    if (value.result !== undefined && value.result !== null) return text(value.result);
    if (value.text !== undefined && value.text !== null) return text(value.text);
    if (Array.isArray(value.richText)) return value.richText.map(part => text(part?.text)).join('');
  }
  return String(value)
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
}

function email(value) {
  return text(value).replace(/\s+/gu, '').toLowerCase();
}

module.exports = { text, email };
