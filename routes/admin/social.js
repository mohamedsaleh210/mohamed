const express = require('express');
const { db } = require('../../db');
const social = require('../../lib/social');
const audit = require('../../lib/audit');
const trash = require('../../lib/trash');
const { can } = require('../../middleware/auth');

const router = express.Router();
router.use(can('social.manage'));

/** Accepts "facebook.com/x" as readily as the full URL. */
function normaliseUrl(raw) {
  const url = (raw || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return 'https://' + url.replace(/^\/+/, '');
}

router.get('/', (req, res) => {
  const links = db
    .prepare('SELECT * FROM social_links ORDER BY sort, id')
    .all()
    .map((l) => ({ ...l, meta: social.get(l.platform) }));

  res.render('admin/social', {
    links,
    platforms: social.list(),
    msg: req.query.msg,
    err: req.query.err,
  });
});

router.post('/', (req, res) => {
  const platform = (req.body.platform || '').trim();
  const url = normaliseUrl(req.body.url);
  const label = (req.body.label || '').trim();

  if (!social.PLATFORMS[platform] || !url) return res.redirect(req.adminPath + '/social?err=fields');

  const sort =
    db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM social_links').get().n;

  const info = db
    .prepare('INSERT INTO social_links (platform, url, label, sort, active) VALUES (?,?,?,?,1)')
    .run(platform, url, label || null, sort);

  audit.log(req, 'social.create', {
    type: 'social',
    id: Number(info.lastInsertRowid),
    label: platform,
    details: `أضاف حساب ${social.get(platform).ar}`,
  });
  res.redirect(req.adminPath + '/social?msg=added');
});

router.post('/reorder', express.json(), (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ ok: false });

  const stmt = db.prepare('UPDATE social_links SET sort = ? WHERE id = ?');
  db.transaction(() => ids.forEach((id, i) => stmt.run(i + 1, id)))();

  audit.log(req, 'social.reorder', { type: 'social', details: 'أعاد ترتيب حسابات التواصل' });
  res.json({ ok: true });
});

router.post('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const link = db.prepare('SELECT * FROM social_links WHERE id = ?').get(id);
  if (!link) return res.redirect(req.adminPath + '/social');

  const url = normaliseUrl(req.body.url);
  if (!url) return res.redirect(req.adminPath + '/social?err=fields');

  db.prepare('UPDATE social_links SET url = ?, label = ? WHERE id = ?').run(
    url,
    (req.body.label || '').trim() || null,
    id
  );

  audit.log(req, 'social.update', {
    type: 'social',
    id,
    label: link.platform,
    details: `عدّل رابط ${social.get(link.platform).ar}`,
  });
  res.redirect(req.adminPath + '/social?msg=saved');
});

router.post('/:id/toggle', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const link = db.prepare('SELECT * FROM social_links WHERE id = ?').get(id);
  if (!link) return res.redirect(req.adminPath + '/social');

  const next = link.active ? 0 : 1;
  db.prepare('UPDATE social_links SET active = ? WHERE id = ?').run(next, id);

  audit.log(req, 'social.toggle', {
    type: 'social',
    id,
    label: link.platform,
    details: `${next ? 'أظهر' : 'أخفى'} حساب ${social.get(link.platform).ar}`,
  });
  res.redirect(req.adminPath + '/social?msg=' + (next ? 'shown' : 'hidden'));
});

router.post('/:id/delete', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const link = db.prepare('SELECT * FROM social_links WHERE id = ?').get(id);
  if (!link) return res.redirect(req.adminPath + '/social');

  const trashId = trash.remove({
    entity: 'social',
    id,
    label: social.get(link.platform).ar,
    row: link,
    by: req.session.user.display_name || req.session.user.username,
    deleteFn: () => db.prepare('DELETE FROM social_links WHERE id = ?').run(id),
  });

  audit.log(req, 'social.delete', {
    type: 'social',
    id,
    label: link.platform,
    details: `حذف حساب ${social.get(link.platform).ar}`,
  });
  res.redirect(`${req.adminPath}/social?msg=deleted&undo=${trashId}`);
});

module.exports = router;
