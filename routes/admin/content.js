const express = require('express');
const { db } = require('../../db');
const audit = require('../../lib/audit');
const trash = require('../../lib/trash');
const { can } = require('../../middleware/auth');

const me = (req) => req.session.user.display_name || req.session.user.username;

const router = express.Router();
router.use(can('content.manage'));

const nextSort = (table, where = '', params = []) => {
  const row = db
    .prepare(`SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM ${table} ${where}`)
    .get(...params);
  return row.n;
};

// ---------------------------------------------------------------- overview
router.get('/', (req, res) => {
  const pages = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM categories c WHERE c.page_id = p.id) AS category_count,
        (SELECT COUNT(*) FROM services s
           JOIN categories c ON c.id = s.category_id
          WHERE c.page_id = p.id AND s.active = 1) AS service_count,
        (SELECT COUNT(*) FROM requests r WHERE r.page_id = p.id) AS request_count
       FROM pages p ORDER BY p.sort, p.id`
    )
    .all();

  // One page at a time, so the screen stays readable as the office grows. The
  // chosen page is remembered in the address, which makes it linkable.
  const current =
    pages.find((p) => String(p.id) === String(req.query.page)) || pages[0] || null;

  const categories = current
    ? db.prepare('SELECT * FROM categories WHERE page_id = ? ORDER BY sort, id').all(current.id)
    : [];
  const services = db.prepare('SELECT * FROM services ORDER BY category_id, sort, id').all();

  // Services whose category was removed in an older version of the app would
  // otherwise be invisible. Surface them so they can be fixed.
  const allCategories = db.prepare('SELECT * FROM categories').all();
  const orphans = services.filter(
    (s) => !s.category_id || !allCategories.some((c) => c.id === s.category_id)
  );

  res.render('admin/content', {
    pages,
    current,
    categories,
    allCategories,
    services,
    orphans,
    msg: req.query.msg,
    err: req.query.err,
  });
});

// ---------------------------------------------------------------- ordering
// Accepts the full ordered list of ids and rewrites `sort` in one transaction,
// which keeps the numbers contiguous no matter how the list was rearranged.
router.post('/categories/reorder', express.json(), (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ ok: false });

  const stmt = db.prepare('UPDATE categories SET sort = ? WHERE id = ?');
  db.transaction(() => ids.forEach((id, i) => stmt.run(i + 1, id)))();

  audit.log(req, 'category.reorder', { type: 'category', details: 'أعاد ترتيب الأقسام' });
  res.json({ ok: true });
});

router.post('/services/reorder', express.json(), (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  const categoryId = parseInt(req.body.category_id, 10) || null;
  if (!ids.length) return res.status(400).json({ ok: false });

  const stmt = db.prepare('UPDATE services SET sort = ? WHERE id = ?');
  db.transaction(() => ids.forEach((id, i) => stmt.run(i + 1, id)))();

  const cat = categoryId
    ? db.prepare('SELECT name_ar FROM categories WHERE id = ?').get(categoryId)
    : null;
  audit.log(req, 'service.reorder', {
    type: 'category',
    id: categoryId,
    label: cat ? cat.name_ar : null,
    details: cat ? `أعاد ترتيب خدمات قسم «${cat.name_ar}»` : 'أعاد ترتيب الخدمات',
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- categories
router.post('/categories', (req, res) => {
  const b = req.body;
  const nameAr = (b.name_ar || '').trim();
  if (!nameAr) return res.redirect(req.adminPath + '/content?err=cat_name');

  /*
   * Which page the category belongs to.
   *
   * The form sends the page being viewed. If it does not — an older cached
   * page, or a request built by hand — the default page takes it, because a
   * category with no page is invisible on the site and impossible to find
   * afterwards.
   */
  const targetPage =
    db.prepare('SELECT id FROM pages WHERE id = ?').get(b.page_id) ||
    db.prepare('SELECT id FROM pages WHERE is_default = 1').get() ||
    db.prepare('SELECT id FROM pages ORDER BY sort, id LIMIT 1').get();

  const info = db
    .prepare(
      'INSERT INTO categories (page_id, sort, name_ar, name_en, desc_ar, desc_en) VALUES (?,?,?,?,?,?)'
    )
    .run(
      targetPage ? targetPage.id : null,
      nextSort('categories', 'WHERE page_id = ?', [targetPage ? targetPage.id : null]),
      nameAr, (b.name_en || '').trim(), b.desc_ar || '', b.desc_en || ''
    );

  audit.log(req, 'category.create', {
    type: 'category',
    id: Number(info.lastInsertRowid),
    label: nameAr,
    details: `أضاف قسم: ${nameAr}`,
  });
  res.redirect(
    `${req.adminPath}/content?msg=cat_added` +
      (targetPage ? `&page=${targetPage.id}` : '')
  );
});

router.post('/categories/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!before) return res.redirect(req.adminPath + '/content');

  const b = req.body;
  const nameAr = (b.name_ar || '').trim();
  if (!nameAr) return res.redirect(req.adminPath + '/content?err=cat_name');

  db.prepare('UPDATE categories SET name_ar=?, name_en=?, desc_ar=?, desc_en=? WHERE id=?').run(
    nameAr,
    (b.name_en || '').trim(),
    b.desc_ar || '',
    b.desc_en || '',
    id
  );

  const changes = [];
  if (before.name_ar !== nameAr) changes.push(`الاسم: «${before.name_ar}» ← «${nameAr}»`);
  audit.log(req, 'category.update', {
    type: 'category',
    id,
    label: nameAr,
    details: changes.length ? changes.join('، ') : 'عدّل بيانات القسم',
  });
  res.redirect(req.adminPath + '/content?msg=cat_saved');
});

router.post('/categories/:id/delete', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!cat) return res.redirect(req.adminPath + '/content');

  // A category holding services is never deleted silently — the services would
  // vanish from the site with no trace of why.
  const count = db.prepare('SELECT COUNT(*) c FROM services WHERE category_id = ?').get(id).c;
  if (count > 0) {
    return res.redirect(`${req.adminPath}/content?err=cat_has_services&n=${count}&name=${encodeURIComponent(cat.name_ar)}`);
  }

  const trashId = trash.remove({
    entity: 'category',
    id,
    label: cat.name_ar,
    row: cat,
    by: me(req),
    deleteFn: () => db.prepare('DELETE FROM categories WHERE id = ?').run(id),
  });

  audit.log(req, 'category.delete', {
    type: 'category',
    id,
    label: cat.name_ar,
    details: `حذف قسم: ${cat.name_ar}`,
  });
  res.redirect(`${req.adminPath}/content?msg=cat_deleted&undo=${trashId}`);
});

// ---------------------------------------------------------------- services
router.get('/services/new', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort, id').all();
  if (!categories.length) return res.redirect(req.adminPath + '/content?err=no_categories');
  res.render('admin/service_edit', {
    svc: null,
    categories,
    preselect: parseInt(req.query.category, 10) || categories[0].id,
  });
});

router.post('/services/new', (req, res) => {
  const b = req.body;
  const categoryId = parseInt(b.category_id, 10) || null;
  const titleAr = (b.title_ar || '').trim();
  if (!titleAr || !categoryId) return res.redirect(req.adminPath + '/content?err=svc_fields');

  const info = db
    .prepare(
      `INSERT INTO services (category_id, sort, title_ar, title_en, body_ar, body_en, is_consultation, active)
       VALUES (?,?,?,?,?,?,?,?)`
    )
    .run(
      categoryId,
      nextSort('services', 'WHERE category_id = ?', [categoryId]),
      titleAr,
      (b.title_en || '').trim(),
      b.body_ar || '',
      b.body_en || '',
      b.is_consultation ? 1 : 0,
      b.active ? 1 : 0
    );

  audit.log(req, 'service.create', {
    type: 'service',
    id: Number(info.lastInsertRowid),
    label: titleAr,
    details: `أضاف خدمة: ${titleAr}`,
  });
  res.redirect(req.adminPath + '/content?msg=svc_added');
});

router.get('/services/:id/edit', (req, res) => {
  const svc = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
  if (!svc) return res.redirect(req.adminPath + '/content');
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort, id').all();
  res.render('admin/service_edit', { svc, categories, preselect: svc.category_id });
});

router.post('/services/:id/edit', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
  if (!before) return res.redirect(req.adminPath + '/content');

  const b = req.body;
  const categoryId = parseInt(b.category_id, 10) || null;
  const titleAr = (b.title_ar || '').trim();
  if (!titleAr || !categoryId) return res.redirect(req.adminPath + '/content?err=svc_fields');

  // Moving a service to another category puts it at the end of that list
  // rather than inheriting a position that already belongs to something else.
  const sort =
    categoryId === before.category_id
      ? before.sort
      : nextSort('services', 'WHERE category_id = ?', [categoryId]);

  db.prepare(
    `UPDATE services SET category_id=?, sort=?, title_ar=?, title_en=?, body_ar=?, body_en=?,
     is_consultation=?, active=? WHERE id=?`
  ).run(
    categoryId,
    sort,
    titleAr,
    (b.title_en || '').trim(),
    b.body_ar || '',
    b.body_en || '',
    b.is_consultation ? 1 : 0,
    b.active ? 1 : 0,
    id
  );

  const changes = [];
  if (before.title_ar !== titleAr) changes.push(`العنوان: «${before.title_ar}» ← «${titleAr}»`);
  if (before.category_id !== categoryId) changes.push('نقلها لقسم تاني');
  if (!!before.active !== !!(b.active ? 1 : 0))
    changes.push(b.active ? 'أظهرها على الموقع' : 'أخفاها من الموقع');

  audit.log(req, 'service.update', {
    type: 'service',
    id,
    label: titleAr,
    details: changes.length ? changes.join('، ') : 'عدّل بيانات الخدمة',
  });
  res.redirect(req.adminPath + '/content?msg=svc_saved');
});

router.post('/services/:id/toggle', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const svc = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
  if (!svc) return res.redirect(req.adminPath + '/content');

  const next = svc.active ? 0 : 1;
  db.prepare('UPDATE services SET active = ? WHERE id = ?').run(next, id);
  audit.log(req, 'service.toggle', {
    type: 'service',
    id,
    label: svc.title_ar,
    details: next ? 'أظهر الخدمة على الموقع' : 'أخفى الخدمة من الموقع',
  });
  res.redirect(req.adminPath + '/content?msg=' + (next ? 'svc_shown' : 'svc_hidden'));
});

router.post('/services/:id/delete', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const svc = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
  if (!svc) return res.redirect(req.adminPath + '/content');

  // A service attached to real requests stays: deleting it would leave those
  // requests pointing at nothing.
  const used = db.prepare('SELECT COUNT(*) c FROM requests WHERE service_id = ?').get(id).c;
  if (used > 0) {
    return res.redirect(`${req.adminPath}/content?err=svc_in_use&n=${used}&name=${encodeURIComponent(svc.title_ar)}`);
  }

  const trashId = trash.remove({
    entity: 'service',
    id,
    label: svc.title_ar,
    row: svc,
    by: me(req),
    deleteFn: () => db.prepare('DELETE FROM services WHERE id = ?').run(id),
  });

  audit.log(req, 'service.delete', {
    type: 'service',
    id,
    label: svc.title_ar,
    details: `حذف خدمة: ${svc.title_ar}`,
  });
  res.redirect(`${req.adminPath}/content?msg=svc_deleted&undo=${trashId}`);
});

// ---------------------------------------------------------------- pages
/**
 * Pages are the top level: each one is a small site of its own, with its own
 * banner and colour, holding the categories a visitor to that side would expect.
 */
const slugify = (raw) =>
  String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);

router.post('/pages/new', (req, res) => {
  const nameAr = (req.body.name_ar || '').trim();
  const nameEn = (req.body.name_en || '').trim();
  if (!nameAr || !nameEn) return res.redirect(req.adminPath + '/content?err=page_name');

  let slug = slugify(req.body.slug) || slugify(nameEn);
  if (!slug) return res.redirect(req.adminPath + '/content?err=page_slug');

  // The slug is in the visitor's address bar, so a collision has to be resolved
  // rather than rejected — the office should not have to invent one.
  let n = 2;
  const taken = db.prepare('SELECT 1 FROM pages WHERE slug = ?');
  const base = slug;
  while (taken.get(slug)) slug = `${base}-${n++}`;

  const sort = db.prepare('SELECT COALESCE(MAX(sort),0) + 1 AS n FROM pages').get().n;

  const info = db
    .prepare(
      `INSERT INTO pages (slug, name_ar, name_en, tagline_ar, tagline_en,
                          intro_ar, intro_en, colour, sort, show_in_menu)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      slug, nameAr.slice(0, 60), nameEn.slice(0, 60),
      (req.body.tagline_ar || '').trim().slice(0, 160) || null,
      (req.body.tagline_en || '').trim().slice(0, 160) || null,
      (req.body.intro_ar || '').trim().slice(0, 600) || null,
      (req.body.intro_en || '').trim().slice(0, 600) || null,
      /^#[0-9a-f]{6}$/i.test(req.body.colour || '') ? req.body.colour : '#a9853a',
      sort,
      req.body.show_in_menu ? 1 : 0
    );

  audit.log(req, 'page.create', {
    type: 'settings',
    details: `أضاف صفحة: ${nameAr} (/${slug})`,
  });

  res.redirect(`${req.adminPath}/content?page=${info.lastInsertRowid}&msg=page_created`);
});

router.post('/pages/:id/edit', (req, res) => {
  const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
  if (!page) return res.redirect(req.adminPath + '/content');

  const nameAr = (req.body.name_ar || '').trim() || page.name_ar;
  const nameEn = (req.body.name_en || '').trim() || page.name_en;

  let slug = slugify(req.body.slug) || page.slug;
  if (slug !== page.slug) {
    let n = 2;
    const base = slug;
    while (db.prepare('SELECT 1 FROM pages WHERE slug = ? AND id != ?').get(slug, page.id)) {
      slug = `${base}-${n++}`;
    }
  }

  db.prepare(
    `UPDATE pages SET slug = ?, name_ar = ?, name_en = ?, tagline_ar = ?, tagline_en = ?,
                      intro_ar = ?, intro_en = ?, colour = ?, active = ?, show_in_menu = ?
     WHERE id = ?`
  ).run(
    slug, nameAr.slice(0, 60), nameEn.slice(0, 60),
    (req.body.tagline_ar || '').trim().slice(0, 160) || null,
    (req.body.tagline_en || '').trim().slice(0, 160) || null,
    (req.body.intro_ar || '').trim().slice(0, 600) || null,
    (req.body.intro_en || '').trim().slice(0, 600) || null,
    /^#[0-9a-f]{6}$/i.test(req.body.colour || '') ? req.body.colour : page.colour,
    req.body.active ? 1 : 0,
    req.body.show_in_menu ? 1 : 0,
    page.id
  );

  audit.log(req, 'page.update', { type: 'settings', details: `عدّل صفحة: ${nameAr}` });
  res.redirect(`${req.adminPath}/content?page=${page.id}&msg=page_saved`);
});

router.post('/pages/:id/delete', (req, res) => {
  const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
  if (!page) return res.redirect(req.adminPath + '/content');

  // The default page is where orphaned categories land; deleting it would leave
  // them nowhere to go.
  if (page.is_default) {
    return res.redirect(`${req.adminPath}/content?err=page_default`);
  }

  const categories = db.prepare('SELECT COUNT(*) c FROM categories WHERE page_id = ?').get(page.id).c;
  if (categories > 0) {
    return res.redirect(`${req.adminPath}/content?err=page_has_categories&n=${categories}`);
  }

  const trashId = trash.remove({
    entity: 'page',
    id: page.id,
    label: page.name_ar,
    row: page,
    by: me(req),
    deleteFn: () => db.prepare('DELETE FROM pages WHERE id = ?').run(page.id),
  });

  audit.log(req, 'page.delete', { type: 'settings', details: `حذف صفحة: ${page.name_ar}` });
  res.redirect(`${req.adminPath}/content?msg=page_deleted&undo=${trashId}`);
});

/** Moving a category to another page. */
router.post('/categories/:id/move', (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.body.page_id);
  if (!cat || !page) return res.redirect(req.adminPath + '/content');

  db.prepare('UPDATE categories SET page_id = ? WHERE id = ?').run(page.id, cat.id);

  // Requests keep the page they were filed under; only new ones follow the move.
  audit.log(req, 'category.move', {
    type: 'category',
    id: cat.id,
    label: cat.name_ar,
    details: `نقل القسم إلى صفحة: ${page.name_ar}`,
  });

  res.redirect(`${req.adminPath}/content?page=${page.id}&msg=moved`);
});

module.exports = router;
