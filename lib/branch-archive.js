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
 * What is safe, and what this builds instead, is a read-only export.
 *
 * requests, legal_cases, agenda_events and users each carry their own real
 * office_branch_id (set at creation — see routes/admin/requests.js,
 * routes/admin/cases.js, routes/admin/agenda.js, routes/admin/users.js) and
 * are queried directly on it.
 *
 * clients, companies and company_branches do NOT carry their own branch —
 * deliberately. A client or a company can have requests across more than
 * one branch, so a single static "owning branch" column on those tables
 * would either be wrong the moment that happens or would need constant
 * upkeep for no real benefit. Instead "this branch's clients" means
 * whoever this branch's requests are actually for, computed at export
 * time via a join — always correct, and it can never drift out of sync
 * with the requests themselves.
 *
 * Payments are scoped the same way, through the request they were
 * recorded against — this is the "shared financial ledger" an earlier
 * version of this export left out entirely; it is now included, still
 * correctly isolated per branch via that join, and still excludes payment
 * methods/receipts that belong to a different branch's requests.
 */
const DIRECT_BRANCH_TABLES = ['requests', 'legal_cases', 'agenda_events'];

function safeStamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }

async function createBranchArchive(officeBranchId, options = {}) {
  const branch = db.prepare('SELECT * FROM office_branches WHERE id = ?').get(officeBranchId);
  if (!branch) throw new Error('branch_not_found');

  const data = {};
  DIRECT_BRANCH_TABLES.forEach((t) => {
    data[t] = db.prepare(`SELECT * FROM ${t} WHERE office_branch_id = ?`).all(officeBranchId);
  });

  const staff = db.prepare('SELECT * FROM users WHERE office_branch_id = ?').all(officeBranchId);
  // A staff list without password hashes — the archive is a business-data
  // export, not a credential dump, even scoped to the branch's own people.
  data.users = staff.map(({ password_hash, ...rest }) => rest);

  const requestIds = data.requests.map((r) => r.id);
  const inR = requestIds.length ? requestIds.map(() => '?').join(',') : null;

  data.clients = inR
    ? db.prepare(`SELECT DISTINCT c.* FROM clients c JOIN requests r ON r.client_id = c.id WHERE r.id IN (${inR})`).all(...requestIds)
    : [];
  data.companies = inR
    ? db.prepare(`SELECT DISTINCT co.* FROM companies co JOIN requests r ON r.company_id = co.id WHERE r.id IN (${inR})`).all(...requestIds)
    : [];
  data.company_branches = inR
    ? db.prepare(`SELECT DISTINCT cb.* FROM company_branches cb JOIN requests r ON r.branch_id = cb.id WHERE r.id IN (${inR})`).all(...requestIds)
    : [];
  data.payments = inR
    ? db.prepare(`SELECT p.* FROM payments p WHERE p.request_id IN (${inR}) ORDER BY p.created_at`).all(...requestIds)
    : [];

  const tableOrder = ['requests', 'legal_cases', 'agenda_events', 'users', 'clients', 'companies', 'company_branches', 'payments'];

  let documents = [];
  let documentFiles = [];
  if (requestIds.length) {
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
      ...Object.fromEntries(tableOrder.map((t) => [t, data[t].length])),
      documents: documents.length,
      document_files: documentFiles.length,
    },
    note:
      'أرشيف بيانات فرع للاطلاع والتوثيق — ليس نسخة يمكن استعادتها من تلقاء نفسها. ' +
      'العملاء والشركات وفروع الشركات هنا هم فقط من له طلب في هذا الفرع — نفس العميل ' +
      'ممكن يظهر في أرشيف فرع تاني لو له طلب هناك كمان. لا يشمل سجل النشاط العام ولا ' +
      'تعليقات موظفين من فروع أخرى.',
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
    tableOrder.forEach((t) => archive.append(JSON.stringify(data[t], null, 2), { name: `data/${t}.json` }));
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

module.exports = { createBranchArchive };
