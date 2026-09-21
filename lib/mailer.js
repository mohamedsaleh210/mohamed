const fs = require('fs');
const path = require('path');
const { db, getSetting, DATA_DIR } = require('../db');

const OUTBOX = path.join(DATA_DIR, 'mail-outbox');

/**
 * Sending is deliberately split from composing.
 *
 * Until the office supplies a provider key, the "outbox" transport writes each
 * message to disk as a viewable .html file and marks it in the log. That means
 * the whole flow — templates, links, tokens, retries — can be built and tested
 * now, and switching it on later is a settings change with no code involved.
 */
function currentProvider() {
  const provider = getSetting('mail_provider', 'resend');
  const key = getSetting('mail_api_key', '');
  const from = getSetting('mail_from_email', '');

  if (!key || !from) return 'outbox';
  return provider;
}

const isLive = () => currentProvider() !== 'outbox';

function fromHeader() {
  const name = getSetting('mail_from_name', 'سند');
  const email = getSetting('mail_from_email', 'no-reply@localhost');
  return `${name} <${email}>`;
}

/** Absolute links for emails; without a domain they would be unclickable. */
function baseUrl() {
  const domain = getSetting('site_domain', '').trim().replace(/\/+$/, '');
  if (domain) return /^https?:\/\//i.test(domain) ? domain : 'https://' + domain;
  return process.env.SITE_URL || 'http://localhost:' + (process.env.PORT || 3000);
}

// ---------------------------------------------------------------- transports
const transports = {
  /** Writes the message to DATA_DIR/mail-outbox so it can be opened and read. */
  async outbox({ to, subject, html }) {
    if (!fs.existsSync(OUTBOX)) fs.mkdirSync(OUTBOX, { recursive: true });
    const safe = String(to).replace(/[^a-z0-9@._-]/gi, '_');
    const file = `${Date.now()}-${safe}.html`;
    fs.writeFileSync(
      path.join(OUTBOX, file),
      `<!-- TO: ${to}\n     SUBJECT: ${subject} -->\n${html}`,
      'utf8'
    );
    console.log(`  ✉  [outbox] ${subject} → ${to}  (${path.join('mail-outbox', file)})`);
    return { ok: true, file };
  },

  async resend({ to, subject, html, replyTo }) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getSetting('mail_api_key', '')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromHeader(),
        to: [to],
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return { ok: true };
  },

  async brevo({ to, subject, html, replyTo }) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': getSetting('mail_api_key', ''),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: getSetting('mail_from_name', 'سند'),
          email: getSetting('mail_from_email', ''),
        },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        ...(replyTo ? { replyTo: { email: replyTo } } : {}),
      }),
    });

    if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return { ok: true };
  },

  /**
   * Plain SMTP would need nodemailer. Rather than add a dependency that may
   * never be used, this fails loudly with an instruction.
   */
  async smtp() {
    throw new Error('SMTP يحتاج تثبيت nodemailer — استخدم Resend أو Brevo، أو كلّم المطوّر.');
  },
};

// ---------------------------------------------------------------- sending
const logInsert = db.prepare(`
  INSERT INTO mail_log (template, to_email, subject, lang, request_id, provider, status)
  VALUES (?,?,?,?,?,?,'pending')
`);

const logDone = db.prepare(
  "UPDATE mail_log SET status = ?, error = ?, attempts = attempts + 1, sent_at = datetime('now'), outbox_file = ? WHERE id = ?"
);

/**
 * Queues a message. Returns immediately — the client should never wait on an
 * email round-trip while a page load hangs.
 */
function send({ to, subject, html, template = 'generic', lang = 'ar', requestId = null }) {
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to))) {
    console.warn('mail skipped, invalid address:', to);
    return null;
  }

  const provider = currentProvider();
  const logId = Number(
    logInsert.run(template, to, subject, lang, requestId, provider).lastInsertRowid
  );

  const replyTo = getSetting('mail_reply_to', '') || null;

  setImmediate(async () => {
    const attempt = async (n) => {
      try {
        const out = await transports[provider]({ to, subject, html, replyTo });
        logDone.run('sent', null, out.file || null, logId);
      } catch (err) {
        // Two quick retries cover the usual transient API hiccup; beyond that
        // the failure is recorded rather than retried forever.
        if (n < 2) {
          setTimeout(() => attempt(n + 1), 4000 * (n + 1));
          return;
        }
        console.error(`mail failed (${template} → ${to}):`, err.message);
        logDone.run('failed', err.message.slice(0, 400), null, logId);
      }
    };
    attempt(0);
  });

  return logId;
}

/** Synchronous variant used by the settings "send test" button. */
async function sendNow(opts) {
  const provider = currentProvider();
  const logId = Number(
    logInsert
      .run(opts.template || 'test', opts.to, opts.subject, opts.lang || 'ar', null, provider)
      .lastInsertRowid
  );

  try {
    const out = await transports[provider]({
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      replyTo: getSetting('mail_reply_to', '') || null,
    });
    logDone.run('sent', null, out.file || null, logId);
    return { ok: true, provider, file: out.file || null };
  } catch (err) {
    logDone.run('failed', err.message.slice(0, 400), null, logId);
    return { ok: false, provider, error: err.message };
  }
}

const recentLog = (limit = 60) =>
  db.prepare('SELECT * FROM mail_log ORDER BY id DESC LIMIT ?').all(limit);

const pendingCount = () =>
  db.prepare("SELECT COUNT(*) c FROM mail_log WHERE status = 'failed'").get().c;

module.exports = {
  send,
  sendNow,
  baseUrl,
  isLive,
  currentProvider,
  recentLog,
  pendingCount,
  OUTBOX,
};
