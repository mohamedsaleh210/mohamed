const { db } = require('../db');

/**
 * Staff profile rules.
 *
 * The office needs to know who is behind an action months later, and every
 * account needs a way back in if its password is forgotten. Both depend on the
 * profile being filled, so it is required rather than encouraged.
 */
const LABELS = {
  legal_name: 'الاسم كما في البطاقة',
  display_name: 'الاسم المختصر',
  email: 'البريد الإلكتروني',
  phone: 'رقم الموبايل',
  national_id: 'الرقم القومي',
  birth_date: 'تاريخ الميلاد',
  photo: 'الصورة الشخصية',
  id_front: 'صورة البطاقة (الوجه)',
  id_back: 'صورة البطاقة (الظهر)',
};

/** Whether ID card images are demanded, which the admin controls. */
function idCardRequired() {
  const { getSetting } = require('../db');
  return getSetting('staff_id_required', '1') === '1';
}

/** Egyptian national IDs are 14 digits; anything else is a typo. */
const validNationalId = (v) => /^\d{14}$/.test(String(v || '').replace(/\D/g, ''));

const validEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v || '').trim());

const validPhone = (v) => String(v || '').replace(/\D/g, '').length >= 9;

function validBirthDate(v) {
  const s = String(v || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;

  const d = new Date(s + 'T00:00:00Z');
  if (isNaN(d)) return false;

  const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  return age >= 16 && age <= 100;
}

/** Which required fields are still missing or invalid. */
function missingFields(user) {
  const out = [];
  // Egyptian names run to four, five, six parts. The rule is only that it
  // matches the card — so two parts is clearly a nickname, and anything longer
  // is accepted as written.
  if (String(user.legal_name || '').trim().split(/\s+/).filter(Boolean).length < 3)
    out.push('legal_name');
  if (!String(user.display_name || '').trim()) out.push('display_name');
  if (!validEmail(user.email)) out.push('email');
  if (!validPhone(user.phone)) out.push('phone');
  if (!validNationalId(user.national_id)) out.push('national_id');
  if (!validBirthDate(user.birth_date)) out.push('birth_date');

  if (idCardRequired()) {
    if (!user.id_front) out.push('id_front');
    if (!user.id_back) out.push('id_back');
  }
  return out;
}

const isComplete = (user) => missingFields(user).length === 0;

/**
 * Validates a submitted profile, returning normalised values or the first
 * problem in plain Arabic.
 */
function validate(body) {
  const legalName = String(body.legal_name || '').trim().replace(/\s+/g, ' ');
  const displayName = String(body.display_name || '').trim().replace(/\s+/g, ' ');
  const email = String(body.email || '').trim().toLowerCase();
  const phone = String(body.phone || '').trim();
  const nationalId = String(body.national_id || '').replace(/\D/g, '');
  const birthDate = String(body.birth_date || '').trim();

  // Not a fixed number of parts — names here are four, five, sometimes six.
  // Anything under three is a shortened form, not what the card says.
  if (legalName.split(' ').filter(Boolean).length < 3)
    return { error: 'اكتب الاسم بالكامل زي ما هو مكتوب في البطاقة بالحرف.' };
  if (legalName.length > 120) return { error: 'الاسم طويل بشكل غير معتاد — راجعه.' };
  if (displayName.length < 2) return { error: 'اكتب اسم مختصر يعرفك بيه زمايلك.' };
  if (displayName.length > 30) return { error: 'الاسم المختصر طويل — خليه أقصر.' };
  if (!validEmail(email)) return { error: 'اكتب بريد إلكتروني صحيح.' };
  if (!validPhone(phone)) return { error: 'اكتب رقم موبايل صحيح بمفتاح الدولة.' };
  if (!validNationalId(nationalId)) return { error: 'الرقم القومي لازم يكون ١٤ رقم.' };
  if (!validBirthDate(birthDate)) return { error: 'اكتب تاريخ ميلاد صحيح.' };

  return {
    values: {
      legal_name: legalName,
      display_name: displayName,
      email,
      phone,
      national_id: nationalId,
      birth_date: birthDate,
    },
  };
}

/** Rejects an address already used by another account. */
function emailTaken(email, exceptId) {
  return !!db
    .prepare('SELECT 1 FROM users WHERE lower(email) = lower(?) AND id != ?')
    .get(email, exceptId);
}

/**
 * Everything a template needs to draw someone: a photo when there is one, and
 * a coloured initial when there is not — so a missing photo still reads as a
 * person rather than a gap.
 */
function avatarFor(user, adminPath = '') {
  if (!user) return { initial: '؟', color: '#66757e', url: null };

  const name = user.display_name || user.author_label || user.username || '؟';
  const initial = String(name).trim().charAt(0) || '؟';

  // A stable colour per person, so the same face keeps the same tint.
  const palette = ['#12303a', '#2f7bbf', '#a9853a', '#3a9d6b', '#8a63c9', '#c15450', '#d98a3d'];
  let sum = 0;
  for (let i = 0; i < String(name).length; i++) sum += String(name).charCodeAt(i);

  return {
    initial,
    color: palette[sum % palette.length],
    url: user.photo ? `${adminPath}/avatar/${user.id}` : null,
  };
}

module.exports = {
  LABELS,
  idCardRequired,
  missingFields,
  isComplete,
  validate,
  emailTaken,
  avatarFor,
  validNationalId,
  validBirthDate,
};
