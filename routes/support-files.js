const express = require('express');
const path = require('path');
const fs = require('fs');
const { db } = require('../db');

const router = express.Router();
const SUPPORT_DIR = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'support');

/*
 * Support ticket attachments used to be served by a plain express.static
 * mount at /support-files — no session check at all. The filename is a
 * random 32-hex-character token, which makes it unguessable, but that is
 * obscurity, not access control: anyone who ever sees the link (a shared
 * screenshot, a proxy log, a browser history sync) could open it forever,
 * including attachments on **internal** staff replies that the client the
 * ticket belongs to is deliberately never shown a link to.
 *
 * This route keeps the same URL (every existing link in support_detail.ejs
 * and portal/support_detail.ejs still works) but now checks who is asking:
 * a signed-in staff member may see any support attachment, exactly as the
 * admin ticket page already does; a signed-in client may see an attachment
 * only on a non-internal message on one of their own tickets. Nobody else —
 * including an unauthenticated request — gets the file.
 */
router.get('/:filename', (req, res) => {
  const filename = String(req.params.filename || '');
  const full = path.join(SUPPORT_DIR, filename);

  // Defence in depth: a filename must never escape the support folder.
  if (!full.startsWith(SUPPORT_DIR) || !fs.existsSync(full)) {
    return res.status(404).render('errors/404');
  }

  const message = db
    .prepare(
      `SELECT m.internal, t.opened_by_client_id
       FROM support_ticket_messages m
       JOIN support_tickets t ON t.id = m.ticket_id
       WHERE m.attachment_path = ?`
    )
    .get(filename);

  if (!message) return res.status(404).render('errors/404');

  const staff = req.session.user;
  const client = req.session.client;

  let allowed = false;
  if (staff) {
    allowed = true;
  } else if (client && message.opened_by_client_id === client.id && !message.internal) {
    allowed = true;
  }

  if (!allowed) return res.status(403).render('errors/403');

  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(full).pipe(res);
});

module.exports = router;
