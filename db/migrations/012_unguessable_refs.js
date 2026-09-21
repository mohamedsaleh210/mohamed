const refLib = require('../../lib/ref');

// Sequential references (SND-1001, SND-1002…) revealed both how many requests
// existed and what the next one would be. Now that a reference plus a phone
// number opens a request, every existing one is regenerated.
exports.up = (db) => {
  const rows = db.prepare('SELECT id, ref, created_at FROM requests ORDER BY id').all();
  if (!rows.length) return;

  const taken = new Set();
  const exists = (ref) =>
    taken.has(ref) || !!db.prepare('SELECT 1 FROM requests WHERE ref = ?').get(ref);

  const update = db.prepare('UPDATE requests SET ref = ? WHERE id = ?');

  // The old reference is kept in the audit trail, so a client who still has
  // the number written down can be found by searching for it.
  const logIt = db.prepare(
    `INSERT INTO audit_log (user_label, action, entity_type, entity_id, entity_label, details)
     VALUES ('النظام', 'request.ref_changed', 'request', ?, ?, ?)`
  );

  db.transaction(() => {
    rows.forEach((r) => {
      const year = r.created_at ? new Date(r.created_at).getFullYear() : new Date().getFullYear();
      const next = refLib.generate(exists, isNaN(year) ? undefined : year);
      taken.add(next);
      update.run(next, r.id);
      logIt.run(r.id, next, `تغيّر رقم الطلب من ${r.ref} إلى ${next} (تحديث أمني)`);
    });
  })();
};
