const express = require('express');
const { db, getSetting, setSetting } = require('../../db');
const audit = require('../../lib/audit');
const trash = require('../../lib/trash');
const { can } = require('../../middleware/auth');

const router = express.Router();
router.use(can('contacts.manage'));

const me = (req) => req.session.user.display_name || req.session.user.username;

/**
 * The kinds of contact an office actually has.
 *
 * Fixed rather than free text, because the public page renders each one
 * differently — a phone becomes a tel: link, an email a mailto:, WhatsApp a
 * wa.me link with a prefilled message. A typed category would just be a label.
 */
const KINDS = {
  phone: { ar: 'تليفون', icon: '📞', href: (v) => `tel:${v.replace(/\s/g, '')}` },
  mobile: { ar: 'موبايل', icon: '📱', href: (v) => `tel:${v.replace(/\s/g, '')}` },
  whatsapp: {
    ar: 'واتساب',
    icon: '💬',
    href: (v) => `https://wa.me/${v.replace(/\D/g, '')}`,
  },
  email: { ar: 'بريد إلكتروني', icon: '✉️', href: (v) => `mailto:${v}` },
  address: { ar: 'عنوان', icon: '📍', href: null },
  fax: { ar: 'فاكس', icon: '📠', href: null },
};

const listAll = () =>
  db
    .prepare('SELECT * FROM contacts ORDER BY sort, id')
    .all()
    .map((c) => ({ ...c, kindLabel: KINDS[c.kind] ? KINDS[c.kind].ar : c.kind }));

router.get('/', (req, res) => {
  res.render('admin/contacts', {
    contacts: listAll(),
    kinds: KINDS,
    hours: {
      ar: getSetting('office_hours_ar', ''),
      en: getSetting('office_hours_en', ''),
    },
    address: {
      ar: getSetting('office_address_ar', ''),
      en: getSetting('office_address_en', ''),
      map: getSetting('office_map_url', ''),
    },
    msg: req.query.msg,
    err: req.query.err,
  });
});

/** Normalises a value per kind so the public links are always well formed. */
function clean(kind, raw) {
  const value = String(raw || '').trim();
  if (!value) return null;

  if (kind === 'email') {
    const email = value.toLowerCase();
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
  }

  if (['phone', 'mobile', 'whatsapp', 'fax'].includes(kind)) {
    // Keep the shape the office typed, but make sure there is a real number in
    // it — a wa.me link built from punctuation goes nowhere.
    const digits = value.replace(/\D/g, '');
    return digits.length >= 7 ? value.slice(0, 40) : null;
  }

  return value.slice(0, 300);
}

router.post('/new', (req, res) => {
  const kind = KINDS[req.body.kind] ? req.body.kind : null;
  const value = kind ? clean(kind, req.body.value) : null;

  if (!kind || !value) return res.redirect(req.adminPath + '/contacts?err=bad_value');

  const sort = db.prepare('SELECT COALESCE(MAX(sort),0) + 1 AS n FROM contacts').get().n;

  db.prepare(
    'INSERT INTO contacts (kind, label, value, note, sort, primary_one) VALUES (?,?,?,?,?,?)'
  ).run(
    kind,
    (req.body.label || '').trim().slice(0, 60) || KINDS[kind].ar,
    value,
    (req.body.note || '').trim().slice(0, 200) || null,
    sort,
    req.body.primary_one ? 1 : 0
  );

  // One WhatsApp number drives the floating button, so the primary one wins.
  if (kind === 'whatsapp' && req.body.primary_one) {
    setSetting('whatsapp', value);
    db.prepare("UPDATE contacts SET primary_one = 0 WHERE kind = 'whatsapp' AND value != ?").run(value);
  }

  audit.log(req, 'contact.create', {
    type: 'settings',
    details: `أضاف ${KINDS[kind].ar}: ${value}`,
  });

  res.redirect(req.adminPath + '/contacts?msg=added');
});

router.post('/:id/edit', (req, res) => {
  const row = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!row) return res.redirect(req.adminPath + '/contacts');

  const value = clean(row.kind, req.body.value);
  if (!value) return res.redirect(req.adminPath + '/contacts?err=bad_value');

  db.prepare(
    'UPDATE contacts SET label = ?, value = ?, note = ?, active = ?, primary_one = ? WHERE id = ?'
  ).run(
    (req.body.label || '').trim().slice(0, 60) || row.label,
    value,
    (req.body.note || '').trim().slice(0, 200) || null,
    req.body.active ? 1 : 0,
    req.body.primary_one ? 1 : 0,
    row.id
  );

  if (row.kind === 'whatsapp' && req.body.primary_one) {
    setSetting('whatsapp', value);
    db.prepare('UPDATE contacts SET primary_one = 0 WHERE kind = ? AND id != ?').run('whatsapp', row.id);
  }

  audit.log(req, 'contact.update', {
    type: 'settings',
    details: `عدّل ${row.label || row.kind}: ${row.value} ← ${value}`,
  });

  res.redirect(req.adminPath + '/contacts?msg=saved');
});

router.post('/:id/delete', (req, res) => {
  const row = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!row) return res.redirect(req.adminPath + '/contacts');

  const trashId = trash.remove({
    entity: 'contact',
    id: row.id,
    label: `${row.label || row.kind}: ${row.value}`,
    row,
    by: me(req),
    deleteFn: () => db.prepare('DELETE FROM contacts WHERE id = ?').run(row.id),
  });

  audit.log(req, 'contact.delete', {
    type: 'settings',
    details: `حذف ${row.label || row.kind}: ${row.value}`,
  });

  res.redirect(`${req.adminPath}/contacts?msg=deleted&undo=${trashId}`);
});

router.post('/hours', (req, res) => {
  setSetting('office_hours_ar', (req.body.office_hours_ar || '').trim().slice(0, 200));
  setSetting('office_hours_en', (req.body.office_hours_en || '').trim().slice(0, 200));
  setSetting('office_address_ar', (req.body.office_address_ar || '').trim().slice(0, 300));
  setSetting('office_address_en', (req.body.office_address_en || '').trim().slice(0, 300));

  const map = (req.body.office_map_url || '').trim();
  // Only a real link, so nothing can smuggle javascript: into an href.
  setSetting('office_map_url', /^https:\/\//.test(map) ? map.slice(0, 400) : '');

  audit.log(req, 'settings.update', { type: 'settings', details: 'حدّث مواعيد وعنوان المكتب' });
  res.redirect(req.adminPath + '/contacts?msg=hours_saved');
});

module.exports = router;
module.exports.KINDS = KINDS;
