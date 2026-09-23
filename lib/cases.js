const { db } = require('../db');

const STATUS = {
  preparation: 'تجهيز الملف', filed: 'مقيدة', active: 'متداولة',
  judgment: 'صدر حكم', enforcement: 'تنفيذ', suspended: 'موقوفة', closed: 'مغلقة',
};

// No hardcoded role check here — `user.abilities` is already the fully
// resolved permission set (a Super Admin's is unconditionally everything, a
// regular admin's can be trimmed by a Super Admin same as any other role's),
// so checking the role directly would silently re-grant an ability a Super
// Admin had deliberately taken away from a specific admin account.
function visibleFilter(user, alias = 'c') {
  if (user.abilities && user.abilities.has('cases.view_all')) {
    return { sql: '', params: [] };
  }
  return {
    sql: ` AND EXISTS (SELECT 1 FROM case_assignees ca WHERE ca.case_id = ${alias}.id AND ca.user_id = ?)`,
    params: [user.id],
  };
}

function canSee(user, caseId) {
  if (user.abilities && user.abilities.has('cases.view_all')) return true;
  return !!db.prepare('SELECT 1 FROM case_assignees WHERE case_id = ? AND user_id = ?').get(caseId, user.id);
}

function nextFileNo() {
  const year = new Date().getFullYear();
  const row = db.prepare("SELECT COUNT(*) c FROM legal_cases WHERE file_no LIKE ?").get(`CASE-${year}-%`);
  return `CASE-${year}-${String(row.c + 1).padStart(5, '0')}`;
}

module.exports = { STATUS, visibleFilter, canSee, nextFileNo };
