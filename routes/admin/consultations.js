const express = require('express');
const { db } = require('../../db');
const audit = require('../../lib/audit');
const trash = require('../../lib/trash');
const { can } = require('../../middleware/auth');

const router = express.Router();
router.use(can('content.manage'));

const me = (req) => req.session.user.display_name || req.session.user.username;

/**
 * Consultations are services with is_consultation = 1, but they behave
 * differently enough day to day — no category grouping, their own public page —
 * that mixing them into the services screen made both harder to scan.
 */
function consultationCategory() {
  let cat = db
    .prepare("SELECT * FROM categories WHERE name_ar = 'الاستشارات' LIMIT 1")
    .get();
  if (!cat) {
    const sort = db.prepare('SELECT COALESCE(MAX(sort),0) + 1 AS n FROM categories').get().n;
    const info = db
      .prepare(
        'INSERT INTO categories (sort, name_ar, name_en, desc_ar, desc_en) VALUES (?,?,?,?,?)'
      )
      .run(
        sort,
        'الاستشارات',
        'Consultations',
        'استشارات قانونية قبل أي خطوة.',
        'Legal consultations before you take any step.'
      );
    cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid);
  }
  return cat;
}

router.get('/', (req, res) => {
  const items = db
    .prepare('SELECT * FROM services WHERE is_consultation = 1 ORDER BY sort, id')
    .all();

  res.render('admin/consultations', { items, msg: req.query.msg, err: req.query.err });
});

router.post('/', (req, res) => {
  const b = req.body;
  const titleAr = (b.title_ar || '').trim();
  if (!titleAr) return res.redirect('/consultations-admin?err=title');

  const cat = consultationCategory();
  const sort = db
    .prepare('SELECT COALESCE(MAX(sort),0) + 1 AS n FROM services WHERE is_consultation = 1')
    .get().n;

  const info = db
    .prepare(
      `INSERT INTO services (category_id, sort, title_ar, title_en, body_ar, body_en,
                             is_consultation, active)
       VALUES (?,?,?,?,?,?,1,?)`
    )
    .run(cat.id, sort, titleAr, (b.title_en || '').trim(), b.body_ar || '', b.body_en || '',
         b.active ? 1 : 0);

  audit.log(req, 'consultation.create', {
    type: 'service',
    id: Number(info.lastInsertRowid),
    label: titleAr,
    details: `أضاف استشارة: ${titleAr}`,
  });
  res.redirect(req.baseUrl + '?msg=added');
});

router.post('/reorder', express.json(), (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ ok: false });

  const stmt = db.prepare('UPDATE services SET sort = ? WHERE id = ? AND is_consultation = 1');
  db.transaction(() => ids.forEach((id, i) => stmt.run(i + 1, id)))();
  res.json({ ok: true });
});

router.post('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const item = db
    .prepare('SELECT * FROM services WHERE id = ? AND is_consultation = 1')
    .get(id);
  if (!item) return res.redirect(req.baseUrl);

  const b = req.body;
  const titleAr = (b.title_ar || '').trim();
  if (!titleAr) return res.redirect(req.baseUrl + '?err=title');

  db.prepare(
    'UPDATE services SET title_ar=?, title_en=?, body_ar=?, body_en=?, active=? WHERE id=?'
  ).run(titleAr, (b.title_en || '').trim(), b.body_ar || '', b.body_en || '',
        b.active ? 1 : 0, id);

  audit.log(req, 'consultation.update', {
    type: 'service',
    id,
    label: titleAr,
    details: `عدّل استشارة: ${titleAr}`,
  });
  res.redirect(req.baseUrl + '?msg=saved');
});

router.post('/:id/toggle', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const item = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
  if (!item) return res.redirect(req.baseUrl);

  const next = item.active ? 0 : 1;
  db.prepare('UPDATE services SET active = ? WHERE id = ?').run(next, id);
  audit.log(req, 'consultation.toggle', {
    type: 'service',
    id,
    label: item.title_ar,
    details: `${next ? 'أظهر' : 'أخفى'} استشارة: ${item.title_ar}`,
  });
  res.redirect(req.baseUrl + '?msg=' + (next ? 'shown' : 'hidden'));
});

router.post('/:id/delete', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const item = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
  if (!item) return res.redirect(req.baseUrl);

  const used = db.prepare('SELECT COUNT(*) c FROM requests WHERE service_id = ?').get(id).c;
  if (used > 0) return res.redirect(`${req.baseUrl}?err=in_use&n=${used}`);

  const trashId = trash.remove({
    entity: 'service',
    id,
    label: item.title_ar,
    row: item,
    by: me(req),
    deleteFn: () => db.prepare('DELETE FROM services WHERE id = ?').run(id),
  });

  audit.log(req, 'consultation.delete', {
    type: 'service',
    id,
    label: item.title_ar,
    details: `حذف استشارة: ${item.title_ar}`,
  });
  res.redirect(`${req.baseUrl}?msg=deleted&undo=${trashId}`);
});

module.exports = router;
