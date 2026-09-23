const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const refLib = require('../lib/ref');
const { db, getSetting, getBool } = require('../db');
const mailer = require('../lib/mailer');
const notify = require('../lib/notify');
const emails = require('../lib/emails');
const devlinks = require('../lib/devlinks');
const tenantPolicy = require('../lib/tenant-policy');
const passwordPolicy = require('../lib/password');

const router = express.Router();
router.get('/guides', (req, res) => res.render('public/guides'));
router.get('/faq', (req, res) => res.render('public/faq'));

router.get('/lang/:lang', (req, res) => {
  req.session.lang = req.params.lang === 'en' ? 'en' : 'ar';
  res.redirect(req.get('referer') || '/');
});

router.get('/', (req, res) => {
  // The home page shows the same category cards as /services — one mental model
  // for the visitor, and a page that stays short as the catalogue grows.
  const categories = db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM services s
          WHERE s.category_id = c.id AND s.is_consultation = 0 AND s.active = 1) AS service_count
       FROM categories c
       ORDER BY c.sort, c.id`
    )
    .all()
    .filter((c) => c.service_count > 0);

  const pages = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM services s
           JOIN categories c ON c.id = s.category_id
          WHERE c.page_id = p.id AND s.active = 1 AND s.is_consultation = 0) AS service_count
       FROM pages p WHERE p.active = 1 ORDER BY p.sort, p.id`
    )
    .all()
    .filter((p) => p.service_count > 0);

  const visiblePages = pages;
  // A fresh catalogue may have many active categories under one default page.
  // Showing only that page made the home screen look as if the other services
  // had been deleted. Use the real category cards until three populated
  // top-level pages exist; every active category/service remains reachable.
  const audiencePages = visiblePages.length >= 3 ? visiblePages : categories.map(c => ({
    id: `category-${c.id}`,
    slug: `category-${c.id}`,
    name_ar: c.name_ar,
    name_en: c.name_en,
    tagline_ar: c.desc_ar,
    tagline_en: c.desc_en,
    colour: '#a9853a',
    service_count: c.service_count,
  }));
  const popularServices = db.prepare(`SELECT s.*,c.name_ar category_name,p.slug page_slug,
    (SELECT COUNT(*) FROM request_services rs WHERE rs.service_id=s.id) +
    (SELECT COUNT(*) FROM requests r WHERE r.service_id=s.id) demand_count
    FROM services s
    LEFT JOIN categories c ON c.id=s.category_id
    LEFT JOIN pages p ON p.id=c.page_id
    WHERE s.active=1 AND s.is_consultation=0
    ORDER BY s.home_pinned DESC,s.home_pinned_sort,demand_count DESC,s.sort,s.id`).all()
    .slice(0,6);
  const homepageSections = db.prepare('SELECT * FROM homepage_sections ORDER BY sort,id').all();
  const homepageMetrics = db.prepare('SELECT * FROM homepage_metrics WHERE visible=1 ORDER BY sort,id').all();
  const testimonials = db.prepare('SELECT * FROM testimonials WHERE approved=1 AND visible=1 ORDER BY sort,id LIMIT 6').all();
  const homepageFaqs = db.prepare('SELECT * FROM homepage_faqs WHERE approved=1 AND visible=1 ORDER BY sort,id LIMIT 8').all();
  const homepageContent = db.prepare('SELECT content_key,value_ar,value_en FROM homepage_content ORDER BY sort,content_key').all();

  res.render('public/home', { categories, pages: audiencePages, popularServices,
    homepageSections, homepageMetrics, testimonials, homepageFaqs, homepageContent });
});

/**
 * The services page lists categories, not every service.
 *
 * With three categories a flat list is fine; at fifteen it becomes a wall of
 * text nobody reads. Categories first keeps the page short however far the
 * catalogue grows, and the count on each card tells the visitor what is inside
 * before they commit to a click.
 */
/**
 * Contact page.
 *
 * Every way of reaching the office in one place, because the alternative is a
 * client hunting through the footer for a number that may not be the right one
 * for what they need.
 */
/**
 * A page.
 *
 * Its own banner, colour and words — so a visitor who came about a university
 * place sees a university page, not a general list with universities somewhere
 * in it. Everything below is that page's categories and nothing else.
 */
router.get('/p/:slug', (req, res) => {
  const categoryMatch = /^category-(\d+)$/.exec(String(req.params.slug || ''));
  if (categoryMatch) return res.redirect(`/services/${categoryMatch[1]}`);
  const page = db
    .prepare('SELECT * FROM pages WHERE slug = ? AND active = 1')
    .get(req.params.slug);
  if (!page) return res.status(404).render('errors/404');

  const categories = db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM services s
          WHERE s.category_id = c.id AND s.active = 1 AND s.is_consultation = 0) AS service_count
       FROM categories c
       WHERE c.page_id = ? ORDER BY c.sort, c.id`
    )
    .all(page.id)
    .filter((c) => c.service_count > 0);

  res.render('public/page', { page, categories });
});

router.get('/contact', (req, res) => {
  const contacts = db
    .prepare('SELECT * FROM contacts WHERE active = 1 ORDER BY sort, id')
    .all();

  const byKind = {};
  contacts.forEach((c) => (byKind[c.kind] = byKind[c.kind] || []).push(c));

  res.render('public/contact', {
    contacts,
    byKind,
    hours: res.locals.lang === 'ar'
      ? getSetting('office_hours_ar', '')
      : getSetting('office_hours_en', '') || getSetting('office_hours_ar', ''),
    address: res.locals.lang === 'ar'
      ? getSetting('office_address_ar', '')
      : getSetting('office_address_en', '') || getSetting('office_address_ar', ''),
    mapUrl: getSetting('office_map_url', ''),
  });
});
router.get('/about',(req,res)=>res.render('public/about'));

router.get('/services', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const selectedPage = String(req.query.page || '').trim().slice(0, 80);
  const pages = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM categories c WHERE c.page_id = p.id) AS category_count,
        (SELECT COUNT(*) FROM services s
           JOIN categories c ON c.id = s.category_id
          WHERE c.page_id = p.id AND s.is_consultation = 0 AND s.active = 1) AS service_count
       FROM pages p WHERE p.active = 1
       ORDER BY p.sort, p.id`
    )
    .all()
    .filter((p) => p.service_count > 0);

  let searchResults = [];
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const params = [like, like, like, like];
    let pageClause = '';
    if (selectedPage) {
      pageClause = ' AND p.slug = ?';
      params.push(selectedPage);
    }
    searchResults = db.prepare(`
      SELECT s.id,s.title_ar,s.title_en,s.body_ar,s.body_en,
             c.name_ar category_name_ar,c.name_en category_name_en,
             p.name_ar page_name_ar,p.name_en page_name_en,p.slug page_slug
      FROM services s
      JOIN categories c ON c.id=s.category_id
      LEFT JOIN pages p ON p.id=c.page_id
      WHERE s.active=1 AND s.is_consultation=0
        AND (s.title_ar LIKE ? ESCAPE '\\' OR COALESCE(s.title_en,'') LIKE ? ESCAPE '\\'
          OR COALESCE(s.body_ar,'') LIKE ? ESCAPE '\\' OR COALESCE(s.body_en,'') LIKE ? ESCAPE '\\')
        ${pageClause}
      ORDER BY s.home_pinned DESC,s.home_pinned_sort,s.sort,s.id
      LIMIT 60
    `).all(...params);
  }

  /*
   * A fork, not an index.
   *
   * This page used to list every category from every page in one grid, so a
   * visitor who came about a university place read past building permits and
   * utility connections to find it — and going back from a category landed
   * them in the same mixture rather than where they started.
   *
   * Now it asks one question: which of these are you here about.
   */
  res.render('public/services', { pages, q, selectedPage, searchResults });
});

router.get('/services/:id', (req, res) => {
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!category) return res.redirect('/services');

  const services = db
    .prepare(
      `SELECT * FROM services
       WHERE category_id = ? AND is_consultation = 0 AND active = 1
       ORDER BY sort, id`
    )
    .all(category.id);

  /*
   * The page this category belongs to, and its siblings within that page.
   *
   * "Other categories" used to mean every category in the office, so somebody
   * reading about degree equivalency was offered building permits next — and
   * the trail back led to a mixed index rather than to the universities page
   * they arrived from.
   */
  const page = category.page_id
    ? db.prepare('SELECT * FROM pages WHERE id = ? AND active = 1').get(category.page_id)
    : null;

  const others = db
    .prepare(
      `SELECT c.* FROM categories c
       WHERE c.id != ? AND c.page_id IS ? AND EXISTS (
         SELECT 1 FROM services s
         WHERE s.category_id = c.id AND s.is_consultation = 0 AND s.active = 1)
       ORDER BY c.sort, c.id`
    )
    .all(category.id, category.page_id);

  res.render('public/category', { category, services, others, page });
});

router.get('/consultations', (req, res) => {
  const services = db
    .prepare('SELECT * FROM services WHERE is_consultation = 1 AND active = 1 ORDER BY sort, id')
    .all();
  res.render('public/consultations', { services });
});

/** Services grouped under their category, for the picker on the request form. */
/**
 * The services offered on the request form.
 *
 * Scoped to one page when the visitor arrived through one. An office with four
 * pages and a hundred and fifty services would otherwise hand somebody who came
 * about a company registration the entire catalogue — which is not a list, it
 * is a wall, and the honest response to it is to close the tab.
 *
 * The office can turn the scoping off for a catalogue small enough to read
 * whole.
 */
function serviceGroups(pageId = null) {
  const scoped = pageId && getSetting('scope_services_by_page', '1') === '1';

  const categories = scoped
    ? db.prepare('SELECT * FROM categories WHERE page_id = ? ORDER BY sort, id').all(pageId)
    : db.prepare('SELECT * FROM categories ORDER BY sort, id').all();

  const services = db
    .prepare('SELECT * FROM services WHERE active = 1 ORDER BY is_consultation, sort, id')
    .all();

  return categories
    .map((c) => ({ category: c, items: services.filter((s) => s.category_id === c.id) }))
    .filter((g) => g.items.length);
}

/** How many services exist in total, to say what is being left out. */
const totalServiceCount = () =>
  db.prepare('SELECT COUNT(*) c FROM services WHERE active = 1 AND is_consultation = 0').get().c;

router.get('/request', (req, res) => {
  const preselectId = req.query.service ? parseInt(req.query.service, 10) : null;

  // The page the visitor came from — either given directly, or inferred from
  // the service they clicked.
  let pageId = req.query.page ? parseInt(req.query.page, 10) : null;
  if (!pageId && preselectId) {
    const row = db
      .prepare(
        `SELECT c.page_id FROM services s JOIN categories c ON c.id = s.category_id
         WHERE s.id = ?`
      )
      .get(preselectId);
    if (row) pageId = row.page_id;
  }

  // "Show me everything" is always available; it is a link, not a dead end.
  const showAll = req.query.all === '1';
  const activePage = pageId && !showAll
    ? db.prepare('SELECT * FROM pages WHERE id = ? AND active = 1').get(pageId)
    : null;

  const groups = serviceGroups(activePage ? activePage.id : null);
  const all = groups.flatMap((g) => g.items);
  const shown = all.filter((s) => !s.is_consultation).length;

  res.render('public/request', {
    groups,
    services: all,
    chosen: preselectId ? all.find((s) => s.id === preselectId) || null : null,
    activePage,
    scopedOut: Math.max(0, totalServiceCount() - shown),
    error: null,
    form: {},
  });
});

router.post('/request', (req, res) => {
  const name = (req.body.name || '').trim();
  const phone = (req.body.phone || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const message = (req.body.message || '').trim();
  /*
   * Several services, or none at all.
   *
   * The first one chosen becomes the primary — it is what the reference, the
   * page and every existing screen read — and the rest are recorded alongside
   * it. A request with none is a client describing a problem in their own
   * words, which is the common case, not an error.
   */
  const pickedIds = String(req.body.service_ids || req.body.service_id || '')
    .split(',')
    .map((v) => parseInt(v, 10))
    .filter((v) => Number.isInteger(v) && v > 0)
    .slice(0, 12);

  const picked = pickedIds
    .map((id) => db.prepare('SELECT * FROM services WHERE id = ? AND active = 1').get(id))
    .filter(Boolean);

  const serviceId = picked.length ? picked[0].id : null;

  // A signed-in client gets the request attached to their account immediately.
  const clientId = req.session.client ? req.session.client.id : null;

  // Without a service, the description is the request — so it has to say
  // something.
  const problems = [];
  if (!name || !phone) {
    problems.push(
      res.locals.lang === 'ar'
        ? 'من فضلك اكتب الاسم ورقم التواصل.'
        : 'Please enter your name and contact number.'
    );
  }
  if (!picked.length && message.length < 10) {
    problems.push(
      res.locals.lang === 'ar'
        ? 'اختر خدمة أو اشرح اللي محتاجه — سطر واحد على الأقل يكفي.'
        : 'Pick a service or describe what you need — a line is enough.'
    );
  }

  if (problems.length) {
    const groups = serviceGroups();
    const all = groups.flatMap((g) => g.items);
    return res.render('public/request', {
      groups,
      services: all,
      chosen: serviceId ? all.find((s) => s.id === serviceId) || null : null,
      activePage: null,
      scopedOut: 0,
      form: req.body,
      error: problems.join(' '),
    });
  }

  const requestQuota = tenantPolicy.allowance('requests', 1);
  if (!requestQuota.allowed) {
    return res.status(402).render('errors/subscription', {
      license: tenantPolicy.license(), status: 'limit', expired: false, layout: false,
    });
  }

  let serviceLabel = null;
  if (serviceId) {
    const svc = db.prepare('SELECT title_ar, title_en FROM services WHERE id = ?').get(serviceId);
    if (svc) serviceLabel = `${svc.title_ar} / ${svc.title_en}`;
  }

  const info = db
    .prepare(
      `INSERT INTO requests (name, phone, email, client_id, service_id, service_label, message, is_custom)
       VALUES (?,?,?,?,?,?,?,?)`
    )
    .run(
      name, phone, email || null, clientId, serviceId, serviceLabel, message,
      picked.length ? 0 : 1
    );

  // Everything the client picked, in the order they picked it.
  const addService = db.prepare(
    `INSERT OR IGNORE INTO request_services (request_id, service_id, label, sort, added_by)
     VALUES (?,?,?,?,?)`
  );
  picked.forEach((svc, i) =>
    addService.run(
      Number(info.lastInsertRowid), svc.id, `${svc.title_ar} / ${svc.title_en}`, i, 'العميل'
    )
  );

  const ref = refLib.generate(
    (candidate) => !!db.prepare('SELECT 1 FROM requests WHERE ref = ?').get(candidate)
  );

  // A long random token, not the reference number, is what unlocks the upload
  // page. It goes in the confirmation email so the client can come back later.
  const uploadToken = crypto.randomBytes(24).toString('hex');
  // No staff member is acting here — a client submitting from the public
  // site has no branch of their own to inherit, so this lands on the
  // office's main branch until someone triages it internally.
  db.prepare('UPDATE requests SET ref = ?, upload_token = ?, office_branch_id = ? WHERE id = ?').run(
    ref,
    uploadToken,
    require('../lib/office-branches').mainBranchId(),
    info.lastInsertRowid
  );

  const saved = db.prepare('SELECT * FROM requests WHERE id = ?').get(info.lastInsertRowid);

  // Queued, not awaited: the client should land on the confirmation page
  // immediately rather than waiting on an email API.
  if (saved.email) {
    mailer.send(emails.requestReceived(saved, { lang: res.locals.lang }));

    /*
     * And a notification in the panel.
     *
     * The office was told about a new request by email only — so an office with
     * no mail provider configured, or one whose messages went to spam, simply
     * did not learn that work had arrived. The panel is the one place staff are
     * certain to look.
     */
    notify.notify(saved.id, {
      type: 'new_request',
      text: `📥 طلب جديد ${saved.ref} — ${saved.name}` +
        (saved.is_custom ? ' (وصف بكلامه، محتاج مراجعة)' : ''),
      priority: saved.is_custom ? 'high' : 'normal',
      includeLawyers: false,
    });
  }

  devlinks.record(
    `رفع مستندات — ${saved.ref} (${saved.name})`,
    `${mailer.baseUrl()}/upload/${saved.id}?t=${uploadToken}`
  );

  const officeList = getSetting('office_emails', '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  officeList.forEach((to) =>
    mailer.send(emails.officeNewRequest(saved, to, res.locals.adminPath))
  );

  res.redirect(`/request/success/${ref}?t=${uploadToken}`);
});

router.get('/request/success/:ref', (req, res) => {
  const reqRow = db.prepare('SELECT * FROM requests WHERE ref = ?').get(req.params.ref);
  if (!reqRow) return res.redirect('/');

  // The upload link is only offered to whoever arrived with the right token or
  // is signed in as the owner.
  const token = (req.query.t || '').trim();
  const owns =
    (token && token === reqRow.upload_token) ||
    (req.session.client && req.session.client.id === reqRow.client_id);

  res.render('public/success', { reqRow, uploadToken: owns ? reqRow.upload_token : null });
});

module.exports = router;
