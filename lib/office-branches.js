const { db } = require('../db');

/** The office's own default branch — every install has exactly one. */
function mainBranchId() {
  const row = db.prepare('SELECT id FROM office_branches WHERE is_main = 1 ORDER BY id LIMIT 1').get();
  return row ? row.id : null;
}

/**
 * A submitted office_branch_id, made safe.
 *
 * Falls through, in order: the value itself if it names a real active
 * branch, the acting user's own branch, the office's main branch. A form
 * left blank or pointed at a stale id never produces a NULL — every new
 * record gets a real, valid branch, which is what keeps a branch archive
 * from silently missing things nobody meant to leave unassigned.
 */
function resolveBranchId(submitted, user) {
  const candidates = [parseInt(submitted, 10) || null, user && user.office_branch_id, mainBranchId()];
  for (const id of candidates) {
    if (!id) continue;
    if (db.prepare('SELECT 1 FROM office_branches WHERE id = ? AND active = 1').get(id)) return id;
  }
  return mainBranchId();
}

module.exports = { mainBranchId, resolveBranchId };
