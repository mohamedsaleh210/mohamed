const { getSetting } = require('../db');

const MODULES = [
  { key: 'requests', label: 'الطلبات' },
  { key: 'cases', label: 'القضايا' },
  { key: 'agenda', label: 'أجندة الأعمال' },
  { key: 'renewals', label: 'الانتهاء والتجديد' },
  { key: 'clients', label: 'العملاء والشركات' },
  { key: 'employees', label: 'الموظفون والصلاحيات' },
  { key: 'performance', label: 'تقييم الموظفين' },
  { key: 'payroll', label: 'المرتبات والمكافآت' },
  { key: 'treasury', label: 'الخزنة' },
  { key: 'revenue', label: 'الإيرادات' },
  { key: 'expenses', label: 'المصروفات والعهد' },
  { key: 'errands', label: 'المشاوير' },
  { key: 'support', label: 'الدعم الفني' },
  { key: 'consultations', label: 'الاستشارات' },
  { key: 'bookings', label: 'إدارة المواعيد والحجوزات' },
  { key: 'content', label: 'محتوى الموقع والخدمات' },
  { key: 'imports', label: 'استيراد البيانات' },
  { key: 'reports', label: 'هوية التقارير' },
  { key: 'security', label: 'الأمان وسجل النشاط' },
  { key: 'settings', label: 'الإعدادات' },
  { key: 'ai', label: 'المساعد الذكي' },
];

const PUBLIC_ELEMENTS = [
  { key: 'home', label: 'الصفحة الرئيسية' },
  { key: 'services', label: 'صفحات الخدمات وطلب خدمة' },
  { key: 'consultations', label: 'صفحة الاستشارات' },
  { key: 'appointments', label: 'استقبال المواعيد والحجز العام' },
  { key: 'tracking', label: 'تتبع الطلب' },
  { key: 'client_portal', label: 'بوابة العميل' },
  { key: 'support', label: 'الدعم الفني العام' },
  { key: 'contact', label: 'اتصل بنا' },
  { key: 'guides', label: 'الدليل والأسئلة الشائعة' },
];

const all = (items) => items.map((item) => item.key);

function cleanList(value) {
  return [...new Set((Array.isArray(value) ? value : value == null ? [] : [value]).map(String))];
}

function normalise(value, { legacyAll = true } = {}) {
  let raw = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch (_) { raw = null; }
  }
  if (!raw || typeof raw !== 'object') {
    return {
      modules: legacyAll ? all(MODULES) : [],
      publicElements: legacyAll ? all(PUBLIC_ELEMENTS) : [],
      serviceIds: '*',
    };
  }
  const hasSelection = ['modules', 'publicElements', 'serviceIds'].some((key) => Object.prototype.hasOwnProperty.call(raw, key));
  if (!hasSelection && legacyAll) return normalise(null, { legacyAll: true });
  const moduleKeys = new Set(all(MODULES));
  const publicKeys = new Set(all(PUBLIC_ELEMENTS));
  return {
    modules: cleanList(raw.modules).filter((key) => moduleKeys.has(key)),
    publicElements: cleanList(raw.publicElements).filter((key) => publicKeys.has(key)),
    serviceIds: raw.serviceIds === '*' ? '*' : cleanList(raw.serviceIds).map(Number).filter(Number.isInteger),
  };
}

function current() {
  return normalise(getSetting('platform_entitlements', ''));
}

function middleware(req, res, next) {
  const entitlements = current();
  req.entitlements = entitlements;
  res.locals.entitlements = entitlements;
  res.locals.canModule = (key) => entitlements.modules.includes(key);
  res.locals.canPublicElement = (key) => entitlements.publicElements.includes(key);
  next();
}

function requireModule(key) {
  return (req, res, next) => {
    if ((req.entitlements || current()).modules.includes(key)) return next();
    return res.status(403).render('admin/denied', { permission: `subscription.${key}` });
  };
}

function publicAccess(req, res, next) {
  const path = req.path;
  let key = null;
  if (path === '/') key = 'home';
  else if (path.startsWith('/services') || path.startsWith('/p/') || path.startsWith('/request')) key = 'services';
  else if (path.startsWith('/consultations')) key = 'consultations';
  else if (path.startsWith('/appointments')) key = 'appointments';
  else if (path.startsWith('/track')) key = 'tracking';
  else if (path.startsWith('/portal')) key = 'client_portal';
  else if (path.startsWith('/support')) key = 'support';
  else if (path.startsWith('/contact')) key = 'contact';
  else if (path.startsWith('/guides') || path.startsWith('/faq')) key = 'guides';
  if (!key || (req.entitlements || current()).publicElements.includes(key)) return next();
  return res.status(404).render('errors/404');
}

module.exports = { MODULES, PUBLIC_ELEMENTS, normalise, current, middleware, requireModule, publicAccess };
