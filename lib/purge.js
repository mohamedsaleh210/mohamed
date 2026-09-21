const fs = require('fs');
const path = require('path');
const { db, UPLOAD_DIR } = require('../db');

/**
 * Purging old client documents.
 *
 * Scanned ID cards and property deeds are the most sensitive thing the office
 * holds, and keeping them forever is a liability rather than an asset. Once a
 * file has been closed long enough that nobody will reopen it, the images stop
 * earning their storage.
 *
 * The record of what existed is never removed — only the image or PDF. The
 * document row stays, with its name, who uploaded it and when, so the file's
 * history still reads correctly years later.
 */
const MIN_DAYS = 180;

/**
 * Everything eligible, with sizes, so the office can see what it is agreeing
 * to before agreeing to it.
 */
function candidates(days = MIN_DAYS) {
  const window = Math.max(MIN_DAYS, parseInt(days, 10) || MIN_DAYS);

  const rows = db
    .prepare(
      `SELECT r.id AS request_id, r.ref, r.name, r.status, r.created_at,
              d.id AS document_id, d.name AS document_name,
              f.id AS file_id, f.stored_name, f.size,
              COALESCE(
                (SELECT MAX(a.created_at) FROM audit_log a
                  WHERE a.entity_type = 'request' AND a.entity_id = r.id
                    AND a.action = 'request.update'
                    AND a.details LIKE '%مكتمل%'),
                r.created_at
              ) AS closed_at
       FROM requests r
       JOIN documents d ON d.request_id = r.id
       JOIN document_files f ON f.document_id = d.id
       WHERE r.status IN ('completed', 'cancelled')
         AND f.purged_at IS NULL
       ORDER BY closed_at`
    )
    .all()
    .filter((row) => {
      const closed = new Date(String(row.closed_at).replace(' ', 'T') + 'Z');
      const ageDays = (Date.now() - closed.getTime()) / 86400000;
      return ageDays >= window;
    });

  const byRequest = {};
  rows.forEach((row) => {
    const entry = (byRequest[row.request_id] = byRequest[row.request_id] || {
      request_id: row.request_id,
      ref: row.ref,
      name: row.name,
      status: row.status,
      closed_at: String(row.closed_at).slice(0, 10),
      files: 0,
      bytes: 0,
      documents: new Set(),
    });
    entry.files += 1;
    entry.bytes += row.size || 0;
    entry.documents.add(row.document_name);
  });

  const requests = Object.values(byRequest).map((r) => ({
    ...r,
    documents: [...r.documents],
  }));

  return {
    rows,
    requests,
    totalFiles: rows.length,
    totalBytes: rows.reduce((n, r) => n + (r.size || 0), 0),
    window,
  };
}

/**
 * Deletes the files themselves and marks the rows.
 *
 * `requestIds` limits the purge to an explicit selection — an office should be
 * able to clear one old file without being forced into clearing all of them.
 */
function purge({ days = MIN_DAYS, requestIds = null, by = 'النظام' } = {}) {
  const found = candidates(days);
  const targets = requestIds
    ? found.rows.filter((r) => requestIds.includes(String(r.request_id)))
    : found.rows;

  let removed = 0;
  let freed = 0;
  const touched = new Set();

  const mark = db.prepare(
    "UPDATE document_files SET purged_at = datetime('now'), purged_by = ? WHERE id = ?"
  );

  targets.forEach((row) => {
    const full = path.join(UPLOAD_DIR, row.stored_name);

    if (full.startsWith(UPLOAD_DIR) && fs.existsSync(full)) {
      try {
        fs.unlinkSync(full);
        freed += row.size || 0;
      } catch (err) {
        console.error('purge failed for', row.stored_name, err.message);
        return;
      }
    }

    mark.run(by, row.file_id);
    removed += 1;
    touched.add(row.request_id);
  });

  return { removed, freed, requests: touched.size };
}

const humanSize = (bytes) => {
  if (!bytes) return '0';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
};

/** How much space the uploads folder is using right now. */
function storageUsage() {
  const live = db
    .prepare('SELECT COALESCE(SUM(size),0) s, COUNT(*) c FROM document_files WHERE purged_at IS NULL')
    .get();
  const purged = db
    .prepare('SELECT COUNT(*) c FROM document_files WHERE purged_at IS NOT NULL')
    .get();

  return { bytes: live.s, files: live.c, purgedFiles: purged.c };
}

module.exports = { MIN_DAYS, candidates, purge, humanSize, storageUsage };
