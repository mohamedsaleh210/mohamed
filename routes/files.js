const express = require('express');
const path = require('path');
const fs = require('fs');
const { db, UPLOAD_DIR } = require('../db');
const { canSeeRequest } = require('../lib/access');

const router = express.Router();

/**
 * Client documents are legal paperwork, so they live outside /public and are
 * only ever reachable through this route. Every request is checked against the
 * viewer's permissions before a single byte is sent.
 */
router.get('/files/:fileId', (req, res) => {
  const file = db
    .prepare(
      `SELECT f.*, d.request_id, d.name AS doc_name
       FROM document_files f
       JOIN documents d ON d.id = f.document_id
       WHERE f.id = ?`
    )
    .get(req.params.fileId);

  if (!file) return res.status(404).render('errors/404');

  const staff = req.session.user;
  const client = req.session.client;

  let allowed = false;
  if (staff) {
    allowed = canSeeRequest(staff, file.request_id);
  } else if (client) {
    const owned = db
      .prepare('SELECT 1 FROM requests WHERE id = ? AND client_id = ?')
      .get(file.request_id, client.id);
    allowed = !!owned;
  }

  if (!allowed) return res.status(403).render('errors/403');

  const full = path.join(UPLOAD_DIR, file.stored_name);

  // Defence in depth: a stored_name must never escape the uploads folder.
  if (!full.startsWith(UPLOAD_DIR) || !fs.existsSync(full)) {
    return res.status(404).render('errors/404');
  }

  res.setHeader('Content-Type', file.mime || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.query.download) {
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.original_name || file.stored_name)}`
    );
  }
  fs.createReadStream(full).pipe(res);
});

module.exports = router;
