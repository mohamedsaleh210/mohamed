const { getSetting } = require('../db');

function setting(key, envKey, fallback = '') {
  const fromDb = String(getSetting(key, '') || '').trim();
  if (fromDb) return fromDb;
  return String(process.env[envKey] || fallback || '').trim();
}

function config() {
  return {
    url: setting('sms_api_url', 'SMS_API_URL'),
    token: setting('sms_api_key', 'SMS_API_KEY'),
    sender: setting('sms_sender', 'SMS_SENDER', 'SANAD'),
  };
}

function isConfigured() {
  return !!config().url;
}

/**
 * Provider-neutral SMS webhook.
 *
 * Configure SMS_API_URL (or the matching settings row) to an HTTPS endpoint
 * that accepts JSON: { to, message, sender }.  If SMS_API_KEY is present it is
 * sent as a Bearer token.  This keeps Sanad independent from a particular SMS
 * company while still making the employee-card button fully operational once
 * a provider endpoint is configured.
 */
async function sendNow({ to, message }) {
  const cfg = config();
  const phone = String(to || '').trim();
  if (!phone) return { ok: false, configured: !!cfg.url, error: 'لا يوجد رقم جوال مسجل للموظف.' };
  if (!cfg.url) {
    return {
      ok: false,
      configured: false,
      error: 'خدمة SMS غير مفعلة. أضف SMS_API_URL ومفتاح المزود من إعدادات البيئة/النظام.',
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
    const response = await fetch(cfg.url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({ to: phone, message: String(message || ''), sender: cfg.sender }),
    });
    clearTimeout(timer);
    const body = await response.text();
    if (!response.ok) {
      return { ok: false, configured: true, error: `SMS ${response.status}: ${body.slice(0, 240)}` };
    }
    return { ok: true, configured: true };
  } catch (err) {
    return { ok: false, configured: true, error: `تعذر إرسال SMS: ${err.message}` };
  }
}

module.exports = { sendNow, isConfigured, config };
