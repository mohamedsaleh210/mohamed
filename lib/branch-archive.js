const fs = require('fs');
const os = require('os');
const path = require('path');
const archiver = require('archiver');
const { db, UPLOAD_DIR } = require('../db');

/**
 * A branch's own data, exported — not restored.
 *
 * office_branches share one database with every other branch in the office:
 * requests, staff, clients and payments all sit in the same tables, tied
 * together by foreign keys that do not stop at a branch boundary (a payment
 * references a request; a request's assignee is a user; neither carries its
 * own copy of the branch's data). Swapping in a "branch-only" database on
 * restore would mean deleting and re-inserting rows across a dozen linked
 * tables while somehow not breaking whatever the other branches still point
 * at — there is no safe way to do that, so this deliberately does not try.
 *
 * What is safe, and what this builds instead, is a read-only export: every
 * row tagged with this branch's office_branch_id, as JSON, plus the actual
 * uploaded files those requests reference. Useful for handing a branch its
 * own records or auditing what it holds — never for restoring a branch by
 * itself.
 */
const BRANCH_TABLES = ['clients', 'companies', 'company_branches', 'requests', 'legal_cases', 'agenda_events', 'users'];

function safeStamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }

async function createBranchArchive(officeBranchId, options = {}) {
  const branch = db.prepare('SELECT * FROM office_branches WHERE id = ?').get(officeBranchId);
  if (!branch) throw new Error('branch_not_found');

  const data = {};
  BRANCH_TABLES.forEach((t) => {
    data[t] = db.prepare(`SELECT * FROM ${t} WHERE office_branch_id = ?`).all(officeBranchId);
  });
  // A staff list without password hashes — the archive is a business-data
  // export, not a credential dump, even scoped to the branch's own people.
  data.users = data.users.map(({ password_hash, ...rest }) => rest);

  const requestIds = data.requests.map((r) => r.id);
  let documents = [];
  let documentFiles = [];
  if (requestIds.length) {
    const inR = requestIds.map(() => '?').join(',');
    documents = db.prepare(`SELECT * FROM documents WHERE request_id IN (${inR})`).all(...requestIds);
    const docIds = documents.map((d) => d.id);
    if (docIds.length) {
      const inD = docIds.map(() => '?').join(',');
      documentFiles = db.prepare(`SELECT * FROM document_files WHERE document_id IN (${inD})`).all(...docIds);
    }
  }

  const manifest = {
    format: 'sanad-branch-archive-v1',
    kind: 'export',
    branch: { id: branch.id, name: branch.name, code: branch.code },
    created_at: new Date().toISOString(),
    counts: {
      ...Object.fromEntries(BRANCH_TABLES.map((t) => [t, data[t].length])),
      documents: documents.length,
      document_files: documentFiles.length,
    },
    note:
      'أرشيف بيانات فرع للاطلاع والتوثيق — ليس نسخة يمكن استعادتها من تلقاء نفسها. ' +
      'لا يشمل القيود المالية المشتركة بين الفروع، سجل النشاط العام، ولا تعليقات موظفين من فروع أخرى.',
  };

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sanad-branch-archive-'));
  const outputPath = options.outputPath || path.join(temp, `sanad-branch-${branch.code || branch.id}-${safeStamp()}.zip`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);

    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    BRANCH_TABLES.forEach((t) => archive.append(JSON.stringify(data[t], null, 2), { name: `data/${t}.json` }));
    archive.append(JSON.stringify(documents, null, 2), { name: 'data/documents.json' });
    archive.append(JSON.stringify(documentFiles, null, 2), { name: 'data/document_files.json' });

    documentFiles.forEach((f) => {
      const full = path.join(UPLOAD_DIR, f.stored_name);
      if (fs.existsSync(full)) archive.file(full, { name: `files/${f.stored_name}` });
    });

    archive.finalize();
  });

  return { path: outputPath, manifest, cleanup: () => fs.rmSync(temp, { recursive: true, force: true }) };
}

module.exports = { createBranchArchive, BRANCH_TABLES };
