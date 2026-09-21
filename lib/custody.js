const { db } = require('../db');

function balanceFor(custodyId) {
  return db.prepare(`
    SELECT c.id,c.user_id,c.amount,
      COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.custody_id=c.id AND e.voided_at IS NULL AND COALESCE(e.custody_status,'approved')!='rejected'),0) spent,
      COALESCE((SELECT SUM(cr.amount) FROM custody_returns cr WHERE cr.custody_id=c.id AND cr.voided_at IS NULL),0) returned
    FROM staff_custodies c WHERE c.id=? AND c.voided_at IS NULL AND c.status IN ('active','pending_receipt','approved')
  `).get(custodyId);
}

function availableFor(userId) {
  return db.prepare(`
    SELECT c.*,
      COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.custody_id=c.id AND e.voided_at IS NULL AND COALESCE(e.custody_status,'approved')!='rejected'),0) spent,
      COALESCE((SELECT SUM(cr.amount) FROM custody_returns cr WHERE cr.custody_id=c.id AND cr.voided_at IS NULL),0) returned
    FROM staff_custodies c
    WHERE c.user_id=? AND c.voided_at IS NULL AND c.status='active'
      AND c.amount > COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.custody_id=c.id AND e.voided_at IS NULL AND COALESCE(e.custody_status,'approved')!='rejected'),0)
                   + COALESCE((SELECT SUM(cr.amount) FROM custody_returns cr WHERE cr.custody_id=c.id AND cr.voided_at IS NULL),0)
    ORDER BY c.issued_on,c.id
  `).all(userId).map(c => ({...c, remaining: c.amount-c.spent-c.returned}));
}

function employeeStatement(userId) {
  const custodies = db.prepare(`
    SELECT c.*,
      COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.custody_id=c.id AND e.voided_at IS NULL AND COALESCE(e.custody_status,'approved')!='rejected'),0) spent,
      COALESCE((SELECT SUM(cr.amount) FROM custody_returns cr WHERE cr.custody_id=c.id AND cr.voided_at IS NULL),0) returned
    FROM staff_custodies c WHERE c.user_id=? AND c.voided_at IS NULL ORDER BY c.issued_on DESC,c.id DESC
  `).all(userId).map(c => ({...c, remaining:c.amount-c.spent-c.returned}));
  const expenses = db.prepare(`SELECT e.*,r.ref,r.name client_name,c.purpose custody_purpose
    FROM expenses e JOIN requests r ON r.id=e.request_id LEFT JOIN staff_custodies c ON c.id=e.custody_id
    WHERE e.paid_by_id=? AND e.voided_at IS NULL ORDER BY e.spent_on DESC,e.id DESC LIMIT 300`).all(userId);
  const returns = db.prepare(`SELECT cr.*,c.purpose FROM custody_returns cr JOIN staff_custodies c ON c.id=cr.custody_id
    WHERE c.user_id=? AND cr.voided_at IS NULL ORDER BY cr.returned_on DESC,cr.id DESC`).all(userId);
  const total = custodies.reduce((n,c)=>n+c.amount,0);
  const spent = custodies.reduce((n,c)=>n+c.spent,0);
  const returned = custodies.reduce((n,c)=>n+c.returned,0);
  return { custodies, expenses, returns, totals:{received:total,spent,returned,remaining:total-spent-returned} };
}

function overview() {
  return db.prepare(`SELECT u.id,u.display_name,u.role,
    COALESCE(SUM(CASE WHEN c.voided_at IS NULL AND c.status IN ('pending_receipt','active','settled') THEN c.amount ELSE 0 END),0) received,
    COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.paid_by_id=u.id AND e.custody_id IS NOT NULL AND e.voided_at IS NULL),0) spent,
    COALESCE((SELECT SUM(cr.amount) FROM custody_returns cr JOIN staff_custodies c2 ON c2.id=cr.custody_id WHERE c2.user_id=u.id AND cr.voided_at IS NULL),0) returned
    FROM users u LEFT JOIN staff_custodies c ON c.user_id=u.id
    WHERE u.active=1 GROUP BY u.id HAVING received>0 OR spent>0 OR returned>0 ORDER BY u.display_name`).all()
    .map(r=>({...r,remaining:r.received-r.spent-r.returned}));
}

module.exports = { balanceFor, availableFor, employeeStatement, overview };
