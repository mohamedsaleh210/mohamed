const express = require('express');
const { db } = require('../../db');
const audit = require('../../lib/audit');
const { can } = require('../../middleware/auth');

const router = express.Router();
router.use(can('content.manage'));

router.get('/', (req, res) => {
  res.render('admin/homepage', {
    sections: db.prepare('SELECT * FROM homepage_sections ORDER BY sort,id').all(),
    metrics: db.prepare('SELECT * FROM homepage_metrics ORDER BY sort,id').all(),
    testimonials: db.prepare('SELECT * FROM testimonials ORDER BY sort,id').all(),
    faqs: db.prepare('SELECT * FROM homepage_faqs ORDER BY sort,id').all(),
    content: db.prepare('SELECT * FROM homepage_content ORDER BY group_key,sort,content_key').all(),
    services: db.prepare(`SELECT s.id,s.title_ar,s.home_pinned,s.home_pinned_sort,c.name_ar category_name
      FROM services s LEFT JOIN categories c ON c.id=s.category_id
      WHERE s.active=1 ORDER BY s.home_pinned DESC,s.home_pinned_sort,s.title_ar`).all(),
    msg: req.query.msg,
  });
});

router.post('/content', (req, res) => {
  const rows = db.prepare('SELECT content_key,input_type FROM homepage_content').all();
  const update = db.prepare(`UPDATE homepage_content
    SET value_ar=?,value_en=?,updated_at=datetime('now') WHERE content_key=?`);
  const safeUrl = (value, fallback) => {
    const text = String(value || '').trim();
    if (!text) return fallback;
    if (text.startsWith('/') && !text.startsWith('//')) return text.slice(0, 500);
    try {
      const url = new URL(text);
      return ['http:', 'https:'].includes(url.protocol) ? text.slice(0, 500) : fallback;
    } catch (_) {
      return fallback;
    }
  };
  const tx = db.transaction(() => {
    rows.forEach((row) => {
      const arKey = `ar_${row.content_key}`;
      const enKey = `en_${row.content_key}`;
      const current = db.prepare('SELECT value_ar,value_en FROM homepage_content WHERE content_key=?').get(row.content_key);
      let ar = String(req.body[arKey] ?? current.value_ar ?? '').trim().slice(0, 1200);
      let en = String(req.body[enKey] ?? current.value_en ?? '').trim().slice(0, 1200);
      if (row.input_type === 'url') {
        ar = safeUrl(ar, current.value_ar);
        en = safeUrl(en, ar || current.value_en);
      }
      update.run(ar, en, row.content_key);
    });
  });
  tx();
  audit.log(req, 'homepage.content.update', { type: 'homepage_content', details: 'تحديث نصوص وروابط وصورة الصفحة الرئيسية' });
  res.redirect(req.adminPath + '/homepage?msg=saved');
});

router.post('/popular/:id', (req, res) => {
  db.prepare('UPDATE services SET home_pinned=?,home_pinned_sort=? WHERE id=?').run(
    req.body.home_pinned ? 1 : 0, Number(req.body.home_pinned_sort) || 0, Number(req.params.id)
  );
  audit.log(req, 'homepage.popular.update', { type: 'service', id: Number(req.params.id) });
  res.redirect(req.adminPath + '/homepage?msg=saved');
});

router.post('/sections/:id', (req, res) => {
  db.prepare(`UPDATE homepage_sections SET visible=?,sort=?,updated_at=datetime('now') WHERE id=?`).run(
    req.body.visible ? 1 : 0,
    Math.max(0, Number(req.body.sort) || 0),
    Number(req.params.id)
  );
  audit.log(req, 'homepage.section.update', { type: 'homepage_section', id: Number(req.params.id) });
  res.redirect(req.adminPath + '/homepage?msg=saved');
});

router.post('/metrics/:id', (req, res) => {
  db.prepare(`UPDATE homepage_metrics SET label_ar=?,label_en=?,value=?,icon=?,visible=?,sort=?,updated_at=datetime('now') WHERE id=?`).run(
    String(req.body.label_ar || '').trim(),
    String(req.body.label_en || '').trim(),
    String(req.body.value || '').trim(),
    String(req.body.icon || '').trim(),
    req.body.visible ? 1 : 0,
    Math.max(0, Number(req.body.sort) || 0),
    Number(req.params.id)
  );
  audit.log(req, 'homepage.metric.update', { type: 'homepage_metric', id: Number(req.params.id) });
  res.redirect(req.adminPath + '/homepage?msg=saved');
});

router.post('/testimonials', (req, res) => {
  const quote = String(req.body.quote_ar || '').trim();
  if (quote) {
    db.prepare(`INSERT INTO testimonials(customer_name,quote_ar,quote_en,rating,office_name,service_name,country_code,anonymous,approved,visible,sort)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
      String(req.body.customer_name || '').trim(), quote, String(req.body.quote_en || '').trim(),
      Math.min(5, Math.max(1, Number(req.body.rating) || 5)), String(req.body.office_name || '').trim(),
      String(req.body.service_name || '').trim(), String(req.body.country_code || '').trim().toUpperCase(),
      req.body.anonymous ? 1 : 0, req.body.approved ? 1 : 0, req.body.visible ? 1 : 0,
      Number(req.body.sort) || 0
    );
    audit.log(req, 'homepage.testimonial.create', { type: 'testimonial' });
  }
  res.redirect(req.adminPath + '/homepage?msg=saved');
});

router.post('/testimonials/:id', (req, res) => {
  db.prepare('UPDATE testimonials SET approved=?,visible=?,anonymous=?,sort=? WHERE id=?').run(
    req.body.approved ? 1 : 0, req.body.visible ? 1 : 0, req.body.anonymous ? 1 : 0,
    Number(req.body.sort) || 0, Number(req.params.id)
  );
  audit.log(req, 'homepage.testimonial.update', { type: 'testimonial', id: Number(req.params.id) });
  res.redirect(req.adminPath + '/homepage?msg=saved');
});

router.post('/faqs', (req, res) => {
  const question = String(req.body.question_ar || '').trim();
  const answer = String(req.body.answer_ar || '').trim();
  if (question && answer) {
    db.prepare(`INSERT INTO homepage_faqs(question_ar,answer_ar,question_en,answer_en,approved,visible,sort)
      VALUES(?,?,?,?,?,?,?)`).run(
      question, answer, String(req.body.question_en || '').trim(), String(req.body.answer_en || '').trim(),
      req.body.approved ? 1 : 0, req.body.visible ? 1 : 0, Number(req.body.sort) || 0
    );
    audit.log(req, 'homepage.faq.create', { type: 'homepage_faq' });
  }
  res.redirect(req.adminPath + '/homepage?msg=saved');
});

router.post('/faqs/:id', (req, res) => {
  db.prepare('UPDATE homepage_faqs SET approved=?,visible=?,sort=? WHERE id=?').run(
    req.body.approved ? 1 : 0, req.body.visible ? 1 : 0,
    Number(req.body.sort) || 0, Number(req.params.id)
  );
  audit.log(req, 'homepage.faq.update', { type: 'homepage_faq', id: Number(req.params.id) });
  res.redirect(req.adminPath + '/homepage?msg=saved');
});

module.exports = router;
