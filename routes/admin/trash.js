const express = require('express');
const { db } = require('../../db');
const trash = require('../../lib/trash');
const audit = require('../../lib/audit');
const { can } = require('../../middleware/auth');

const router = express.Router();
router.use(can('trash.restore'));

const me = (req) => req.session.user.display_name || req.session.user.username;

/**
 * Puts a row back exactly as it was, original id included, so anything that
 * referenced it still lines up.
 */
const RESTORERS = {
  category(row) {
    db.prepare(
      `INSERT INTO categories (id, sort, name_ar, name_en, desc_ar, desc_en)
       VALUES (@id, @sort, @name_ar, @name_en, @desc_ar, @desc_en)`
    ).run(row);
    return `القسم «${row.name_ar}»`;
  },

  service(row, extra) {
    // The category may have been deleted in the meantime; park the service
    // in the first available one rather than failing.
    let categoryId = row.category_id;
    const catExists = db.prepare('SELECT 1 FROM categories WHERE id = ?').get(categoryId);
    if (!catExists) {
      const first = db.prepare('SELECT id FROM categories ORDER BY sort, id LIMIT 1').get();
      categoryId = first ? first.id : null;
    }

    db.prepare(
      `INSERT INTO services (id, category_id, sort, title_ar, title_en, body_ar, body_en,
                             is_consultation, active)
       VALUES (@id, @category_id, @sort, @title_ar, @title_en, @body_ar, @body_en,
               @is_consultation, @active)`
    ).run({ ...row, category_id: categoryId });

    // Older trash entries may carry checklist templates from a version of the
    // app that had them. The table is gone, so the data is ignored rather than
    // failing a restore that is otherwise fine.
    return `الخدمة «${row.title_ar}»`;
  },

  todo(row) {
    const stillThere = db.prepare('SELECT 1 FROM requests WHERE id = ?').get(row.request_id);
    if (!stillThere) throw new Error('الطلب نفسه اتمسح');

    db.prepare(
      `INSERT INTO todos (id, request_id, title, done, sort, created_by, done_by, done_at,
                          created_at, note, from_template)
       VALUES (@id, @request_id, @title, @done, @sort, @created_by, @done_by, @done_at,
               @created_at, @note, @from_template)`
    ).run(row);
    return `الخطوة «${row.title}»`;
  },

  social(row) {
    db.prepare(
      `INSERT INTO social_links (id, platform, url, label, sort, active, created_at)
       VALUES (@id, @platform, @url, @label, @sort, @active, @created_at)`
    ).run(row);
    return `حساب ${row.platform}`;
  },
};

const LABELS = {
  category: 'قسم',
  service: 'خدمة',
  todo: 'خطوة تنفيذ',
  social: 'حساب تواصل',
};

router.post('/:id/restore', (req, res) => {
  const item = trash.get(req.params.id);
  const back = req.body.next || req.adminPath + '/trash';

  if (!item) return res.redirect(back + '?undo_err=missing');
  if (item.restored_at) return res.redirect(back + '?undo_err=already');

  const restore = RESTORERS[item.entity];
  if (!restore) return res.redirect(back + '?undo_err=unsupported');

  const { row, extra } = JSON.parse(item.payload);

  try {
    let label = '';
    db.transaction(() => {
      label = restore(row, extra);
      trash.markRestored(item.id);
    })();

    audit.log(req, 'trash.restore', {
      type: item.entity,
      id: item.entity_id,
      label: item.label,
      details: `تراجع عن حذف: ${label}`,
    });
    res.redirect(back + '?undo_ok=1');
  } catch (err) {
    console.error('restore failed:', err.message);
    res.redirect(back + '?undo_err=failed');
  }
});

router.get('/', (req, res) => {
  trash.purgeExpired();
  const items = trash.listRecent(80).map((t) => ({
    ...t,
    typeLabel: LABELS[t.entity] || t.entity,
    canRestore: !!RESTORERS[t.entity],
  }));

  res.render('admin/trash', {
    items,
    windowDays: trash.UNDO_WINDOW_DAYS,
    undo_ok: req.query.undo_ok,
    undo_err: req.query.undo_err,
  });
});

module.exports = router;
