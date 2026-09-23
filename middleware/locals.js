const { db, getSetting, getBool } = require('../db');
const { UI, STATUS } = require('../lib/i18n');
const social = require('../lib/social');
const contentProtection = require('../lib/content-protection');

const waLink = (num, text) => {
  const digits = String(num || '').replace(/[^\d]/g, '');
  if (!digits) return '#';
  return `https://wa.me/${digits}${text ? '?text=' + encodeURIComponent(text) : ''}`;
};

/** Egyptian office hours — every date shown to staff or clients uses Cairo time. */
const TZ = 'Africa/Cairo';

const fmtDate = (value) => {
  if (!value) return '';
  const d = new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z'));
  if (isNaN(d)) return String(value).split(' ')[0];
  return new Intl.DateTimeFormat('ar-EG', {
    timeZone: TZ,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
};

const fmtDateTime = (value) => {
  if (!value) return '';
  const d = new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z'));
  if (isNaN(d)) return String(value);
  return new Intl.DateTimeFormat('ar-EG', {
    timeZone: TZ,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
};

/** "منذ 3 ساعات" — much easier to scan in a busy list than a timestamp. */
const timeAgo = (value) => {
  if (!value) return '';
  const then = new Date(String(value).replace(' ', 'T') + 'Z').getTime();
  if (isNaN(then)) return '';
  const secs = Math.floor((Date.now() - then) / 1000);
  if (secs < 60) return 'الآن';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `منذ ${days} يوم`;
  return fmtDate(value);
};

const money = (n, currency = 'EGP') =>
  `${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;

function locals(req, res, next) {
  const lang = req.session.lang === 'en' ? 'en' : 'ar';

  res.locals.lang = lang;
  res.locals.dir = lang === 'ar' ? 'rtl' : 'ltr';
  res.locals.t = UI[lang];
  res.locals.STATUS = STATUS;
  res.locals.pick = (row, field) => row[`${field}_${lang}`] || row[`${field}_ar`] || '';

  res.locals.site = {
    name_ar: getSetting('site_name_ar', 'سند'),
    name_en: getSetting('site_name_en', 'Sanad'),
    tagline_ar: getSetting('tagline_ar', ''),
    tagline_en: getSetting('tagline_en', ''),
    whatsapp: getSetting('whatsapp', ''),
    currency: getSetting('currency', 'EGP'),
    domain: getSetting('site_domain', ''),
  };

  // Active social accounts, ready for the header and footer partials.
  res.locals.socialLinks = db
    .prepare('SELECT * FROM social_links WHERE active = 1 ORDER BY sort, id')
    .all()
    .map((l) => ({ ...l, meta: social.get(l.platform) }));

  // The consultations page only earns a nav slot when something is in it.
  res.locals.hasConsultations = !!db
    .prepare('SELECT 1 FROM services WHERE is_consultation = 1 AND active = 1 LIMIT 1')
    .get();

  res.locals.waLink = waLink;
  res.locals.fmtDate = fmtDate;
  res.locals.fmtDateTime = fmtDateTime;
  res.locals.timeAgo = timeAgo;
  res.locals.money = money;
  // req.user carries the resolved abilities; the session copy does not, because
  // a Set cannot be serialised into the store. Overwriting it here would make
  // every template ask a question the routes answer differently.
  res.locals.user = req.user || req.session.user || null;

  // The pages menu, resolved once — every public template needs it and none of
  // them should be querying for it.
  try {
    res.locals.menuPages = db
      .prepare('SELECT id, slug, name_ar, name_en, colour FROM pages WHERE active = 1 AND show_in_menu = 1 ORDER BY sort, id')
      .all()
      .filter((p) => p.slug !== 'gerwani-company-services');
  } catch (_) {
    // Before the migration has run.
    res.locals.menuPages = [];
  }
  // NOTE: never expose this as `client` — EJS reads a truthy `client` local as
  // its own compile option and silently drops the include() helper.
  res.locals.clientUser = req.session.client || null;
  res.locals.path = req.path;
  res.locals.query = req.query;

  // views/partials/head.ejs and footer.ejs are shared by both the public
  // marketing pages AND the client portal (views/portal/*.ejs all include
  // the same partials — there is no separate portal head). The portal is
  // explicitly out of scope for content protection, so the office's raw
  // setting is never enough on its own: it's paired with the request path
  // to decide whether protection is actually active on THIS page. The admin
  // panel needs no such check — it uses admin_head.ejs, a wholly separate
  // partial that never reads any of this.
  const cp = contentProtection.config();
  res.locals.contentProtection = cp;
  res.locals.contentProtectionActive = cp.enabled && !req.path.startsWith('/portal');

  // A ready-to-drop class string for the informational public templates
  // that opt into protection (home/services/category/about/guides/faq/page)
  // — empty when the office hasn't enabled it, so those templates never gain
  // a stray class name for a feature that's off.
  res.locals.protectedContentClass = res.locals.contentProtectionActive
    ? ['protected-content', cp.blockSelect ? 'cp-select-off' : '', cp.blockDrag ? 'cp-drag-off' : '']
        .filter(Boolean)
        .join(' ')
    : '';

  next();
}

module.exports = { locals, waLink, fmtDate, fmtDateTime, timeAgo, money, TZ };
