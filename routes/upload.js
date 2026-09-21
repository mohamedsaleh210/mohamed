const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { db, UPLOAD_DIR } = require('../db');
const csrf = require('../lib/csrf');
const audit = require('../lib/audit');
const notify = require('../lib/notify');
const images = require('../lib/images');
const tenantPolicy = require('../lib/tenant-policy');

const router = express.Router();

const MAX_FILE_MB = 15;
const MAX_FILES_PER_REQUEST = 40;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

// Files are written straight to the private uploads folder under a random name.
// The original filename is kept in the database only, so nothing a client types
// can influence a path on disk.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext =
      file.mimetype === 'application/pdf'
        ? '.pdf'
        : path.extname(file.originalname || '').toLowerCase().slice(0, 6) || '.jpg';
    cb(null, `u${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 12 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) {
      return cb(new Error('نوع الملف غير مدعوم'));
    }
    cb(null, true);
  },
});

/**
 * Access to a request's upload page comes from one of two places: the signed-in
 * client who owns it, or the long random token emailed with the confirmation.
 * The reference number alone is never enough — it is short and guessable.
 */
function loadRequestForUpload(req, res, next) {
  const token = (req.query.t || req.body.t || '').trim();
  let request = null;

  if (token && token.length >= 20) {
    request = db.prepare('SELECT * FROM requests WHERE upload_token = ?').get(token);
  }

  if (!request && req.session.client) {
    request = db
      .prepare('SELECT * FROM requests WHERE id = ? AND client_id = ?')
      .get(req.params.id, req.session.client.id);
  }

  if (!request || String(request.id) !== String(req.params.id)) {
    return res.status(403).render('errors/403');
  }

  req.uploadRequest = request;
  req.uploadToken = token || null;
  next();
}

const backLink = (req) =>
  req.uploadToken
    ? `/upload/${req.uploadRequest.id}?t=${encodeURIComponent(req.uploadToken)}`
    : `/upload/${req.uploadRequest.id}`;

// ---------------------------------------------------------------- page
router.get('/:id', loadRequestForUpload, (req, res) => {
  const r = req.uploadRequest;

  const pendingCount = db
    .prepare("SELECT COUNT(*) c FROM requirements WHERE request_id = ? AND status = 'pending'")
    .get(r.id).c;

  /**
   * When the office has asked for specific documents, an account stops being
   * optional. Papers arriving under a link nobody owns are hard to chase, and
   * the client needs somewhere to see what is still outstanding. The link is
   * carried through the sign-up so the request attaches itself afterwards.
   */
  if (pendingCount > 0 && !req.session.client) {
    return res.render('public/upload_gate', {
      r,
      pendingCount,
      token: req.uploadToken,
      requirements: db
        .prepare("SELECT * FROM requirements WHERE request_id = ? AND status = 'pending' ORDER BY id")
        .all(r.id),
    });
  }

  const documents = db
    .prepare('SELECT * FROM documents WHERE request_id = ? ORDER BY id DESC')
    .all(r.id)
    .map((d) => ({
      ...d,
      files: db
        .prepare('SELECT * FROM document_files WHERE document_id = ? ORDER BY page_no, side DESC')
        .all(d.id),
    }));

  const fileCount = documents.reduce((n, d) => n + d.files.length, 0);

  const requirements = db
    .prepare("SELECT * FROM requirements WHERE request_id = ? AND status = 'pending' ORDER BY id")
    .all(r.id);

  res.render('public/upload', {
    r,
    documents,
    fileCount,
    requirements,
    token: req.uploadToken,
    maxFileMb: MAX_FILE_MB,
    maxFiles: MAX_FILES_PER_REQUEST,
    remaining: MAX_FILES_PER_REQUEST - fileCount,
    msg: req.query.msg,
    err: req.query.err,
    prefill: req.query.name || '',
  });
});

// ---------------------------------------------------------------- upload
router.post(
  '/:id',
  loadRequestForUpload,
  (req, res, next) => {
    upload.fields([
      { name: 'front', maxCount: 10 },
      { name: 'back', maxCount: 10 },
      { name: 'pdf', maxCount: 1 },
    ])(req, res, (err) => {
      if (err) {
        const code =
          err.code === 'LIMIT_FILE_SIZE' ? 'too_big' : err.message ? 'bad_type' : 'failed';
        return res.redirect(backLink(req) + (req.uploadToken ? '&' : '?') + 'err=' + code);
      }
      next();
    });
  },
  // The token travelled inside the multipart body, so it could only be read
  // once multer parsed it. This is where that check actually happens.
  csrf.verifyDeferred,
  async (req, res) => {
    const r = req.uploadRequest;
    const name = (req.body.name || '').trim();
    const note = (req.body.note || '').trim();

    const fronts = (req.files && req.files.front) || [];
    const backs = (req.files && req.files.back) || [];
    const pdfs = (req.files && req.files.pdf) || [];

    const cleanup = () =>
      [...fronts, ...backs, ...pdfs].forEach((f) => {
        try {
          fs.unlinkSync(f.path);
        } catch (_) {
          /* nothing useful to do if it is already gone */
        }
      });

    if (!name) {
      cleanup();
      return res.redirect(backLink(req) + (req.uploadToken ? '&' : '?') + 'err=no_name');
    }
    if (!fronts.length && !pdfs.length) {
      cleanup();
      return res.redirect(backLink(req) + (req.uploadToken ? '&' : '?') + 'err=no_file');
    }
    const quota = tenantPolicy.storageAllowance([...fronts, ...backs, ...pdfs]);
    if (!quota.allowed) {
      cleanup();
      return res.status(402).render('errors/subscription', {
        license: tenantPolicy.license(), status: 'limit', expired: false, layout: false,
      });
    }

    // Enforce the per-request cap after the fact, since multer counts per POST.
    const existing = db
      .prepare(
        `SELECT COUNT(*) c FROM document_files f
         JOIN documents d ON d.id = f.document_id WHERE d.request_id = ?`
      )
      .get(r.id).c;

    if (existing + fronts.length + backs.length + pdfs.length > MAX_FILES_PER_REQUEST) {
      cleanup();
      return res.redirect(backLink(req) + (req.uploadToken ? '&' : '?') + 'err=too_many');
    }

    const uploader = req.session.client ? req.session.client.full_name : r.name;
    const kind = pdfs.length ? 'pdf' : 'images';

    // HEIC becomes JPEG and oversized photos are scaled down here, on the
    // server, so the result is guaranteed regardless of what the browser did.
    const processed = await images.normaliseAll([...pdfs, ...fronts, ...backs]);
    const statsFor = new Map(processed.files.map((o) => [o.file.filename, o.result]));

    const docId = Number(
      db
        .prepare(
          `INSERT INTO documents (request_id, name, kind, note, uploaded_by, source)
           VALUES (?,?,?,?,?,'client')`
        )
        .run(r.id, name, kind, note || null, uploader).lastInsertRowid
    );

    const insFile = db.prepare(
      `INSERT INTO document_files
         (document_id, stored_name, original_name, mime, size, page_no, side,
          original_size, was_converted, width, height)
       VALUES (@document_id, @stored_name, @original_name, @mime, @size, @page_no, @side,
               @original_size, @was_converted, @width, @height)`
    );

    const row = (f, page, side) => {
      const st = statsFor.get(f.filename);
      return {
        document_id: docId,
        stored_name: st ? st.storedName : f.filename,
        original_name: f.originalname,
        mime: st ? st.mime : f.mimetype,
        size: st ? st.after : f.size,
        page_no: page,
        side,
        original_size: st ? st.before : f.size,
        was_converted: st && st.converted ? 1 : 0,
        width: st ? st.width : null,
        height: st ? st.height : null,
      };
    };

    db.transaction(() => {
      pdfs.forEach((f) => insFile.run(row(f, 1, 'front')));
      // Front and back of the same page share a page number, so the admin view
      // can pair them up.
      fronts.forEach((f, i) => insFile.run(row(f, i + 1, 'front')));
      backs.forEach((f, i) => insFile.run(row(f, i + 1, 'back')));
    })();

    const count = pdfs.length + fronts.length + backs.length;

    // If the office had asked for something, say so in the record. "Uploaded a
    // document" and "uploaded the document we asked for" are different events,
    // and only the second one tells the case worker they can move on.
    const outstanding = db
      .prepare("SELECT title FROM requirements WHERE request_id = ? AND status = 'pending'")
      .all(r.id)
      .map((q) => q.title);

    const answering = outstanding.find(
      (title) =>
        name.includes(title) || title.includes(name) ||
        title.split(/\s+/).filter((w) => w.length > 3).some((w) => name.includes(w))
    );
    const savedNote =
      processed.savedBytes > 50 * 1024
        ? ` — وفّرنا ${(processed.savedBytes / 1048576).toFixed(1)} ميجا بالضغط`
        : '';
    const convertedNote = processed.convertedCount
      ? ` — حوّلنا ${processed.convertedCount} صورة من HEIC`
      : '';

    audit.log(
      { session: {} },
      'request.upload',
      {
        type: 'request',
        id: r.id,
        label: r.ref,
        details: answering
          ? `العميل رفع «${name}» رداً على المطلوب: ${answering} (${count} ملف)${convertedNote}${savedNote}`
          : `العميل رفع مستند «${name}» (${count} ملف)${convertedNote}${savedNote}`,
      }
    );

    notify.notify(r.id, {
      type: 'upload',
      text: answering
        ? `${uploader} رفع «${name}» رداً على المطلوب منه في ${r.ref}`
        : `${uploader} رفع مستند «${name}» على ${r.ref}`,
    });

    res.redirect(backLink(req) + (req.uploadToken ? '&' : '?') + 'msg=uploaded');
  }
);

// ---------------------------------------------------------------- delete
router.post('/:id/documents/:docId/delete', loadRequestForUpload, (req, res) => {
  const r = req.uploadRequest;
  const doc = db
    .prepare('SELECT * FROM documents WHERE id = ? AND request_id = ?')
    .get(req.params.docId, r.id);

  if (!doc) return res.redirect(backLink(req));

  // A client may take back something they uploaded by mistake, but only for a
  // short window — after that the office may already have acted on it.
  const ageHours =
    (Date.now() - new Date(String(doc.created_at).replace(' ', 'T') + 'Z').getTime()) / 3600000;
  if (ageHours > 48 || doc.source !== 'client') {
    return res.redirect(backLink(req) + (req.uploadToken ? '&' : '?') + 'err=too_late');
  }

  const files = db.prepare('SELECT * FROM document_files WHERE document_id = ?').all(doc.id);
  files.forEach((f) => {
    const full = path.join(UPLOAD_DIR, f.stored_name);
    if (full.startsWith(UPLOAD_DIR) && fs.existsSync(full)) {
      try {
        fs.unlinkSync(full);
      } catch (_) {
        /* the database row goes either way */
      }
    }
  });

  db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);

  // The office still sees that something was removed — deletions are never silent.
  audit.log(
    { session: {} },
    'request.upload_delete',
    {
      type: 'request',
      id: r.id,
      label: r.ref,
      details: `العميل حذف مستند «${doc.name}» (${files.length} ملف)`,
    }
  );

  res.redirect(backLink(req) + (req.uploadToken ? '&' : '?') + 'msg=deleted');
});

module.exports = router;
