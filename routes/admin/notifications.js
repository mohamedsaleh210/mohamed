const express = require('express');
const notify = require('../../lib/notify');

const router = express.Router();

router.get('/', (req, res) => {
  const onlyUnseen = req.query.filter !== 'all';
  res.render('admin/notifications', {
    // Capped: an account that has not cleared its inbox for a year would
    // otherwise render thousands of rows on every visit.
    items: notify.listFor(req.session.user.id, { onlyUnseen, limit: 100 }),
    onlyUnseen,
    unseen: notify.unseenCount(req.session.user.id),
  });
});

/**
 * Marks one item as seen and continues to the request.
 * Nothing is ever cleared automatically — an unread notification stays until
 * the person explicitly says they have seen it.
 */
router.post('/:id/seen', (req, res) => {
  notify.markSeen(req.params.id, req.session.user.id);
  const to = req.body.next || req.get('referer') || req.adminPath + '/notifications';
  res.redirect(to);
});

router.post('/seen-all', (req, res) => {
  notify.markAllSeen(req.session.user.id);
  res.redirect(req.adminPath + '/notifications');
});

module.exports = router;
