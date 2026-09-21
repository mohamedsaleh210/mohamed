const fs = require('fs');
const path = require('path');

/**
 * While email is in outbox mode there is no inbox to open, so any link the
 * system would have emailed is appended to TEST-ACCOUNTS.txt instead. That
 * makes the upload and verification flows clickable during development.
 *
 * The moment a real provider key is configured this stops writing — the links
 * are private tokens and do not belong in a plain-text file on a live server.
 */
const FILE = path.join(__dirname, '..', 'TEST-ACCOUNTS.txt');
const START = '### روابط مؤقتة (وضع التجربة) ###';
const END = '### نهاية الروابط المؤقتة ###';
const KEEP = 15;

function record(label, url) {
  // Required lazily: lib/mailer pulls in the database, and this module is
  // loaded from places that run before it is ready.
  const mailer = require('./mailer');
  if (mailer.isLive()) return;

  try {
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const entry = `  [${stamp}]  ${label}\n      ${url}\n`;

    let text = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : '';
    let head = text;
    let existing = '';

    const s = text.indexOf(START);
    const e = text.indexOf(END);
    if (s !== -1 && e !== -1) {
      head = text.slice(0, s);
      existing = text.slice(s + START.length, e).trim();
    }

    // Newest first, capped, so the file stays readable over a long session.
    const blocks = existing ? existing.split(/\n(?=  \[)/).filter(Boolean) : [];
    blocks.unshift(entry.trimEnd());

    const body = blocks.slice(0, KEEP).join('\n');

    const note =
      '\n  ⚠️  دي روابط حقيقية بتوكنات — موجودة هنا بس لأن البريد الإلكتروني في وضع التجربة.\n' +
      '      أول ما تحط مفتاح المزوّد، الكتابة هنا بتقف تلقائياً.\n\n';

    fs.writeFileSync(FILE, `${head.trimEnd()}\n\n${START}\n${note}${body}\n\n${END}\n`, 'utf8');
  } catch (err) {
    // A development convenience must never interfere with the real request.
    console.warn('dev link log failed:', err.message);
  }
}

module.exports = { record, FILE };
