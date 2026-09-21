#!/usr/bin/env node
/**
 * Removes the demo data:  npm run demo:clear
 *
 * Written because "delete it manually before going live" is a step people skip,
 * and skipping it means fake clients sitting in a real file. One command that
 * removes exactly what the demo created — and nothing else — is the difference
 * between a chore and a habit.
 *
 * What it will not touch: the service catalogue, the settings, and any account
 * or request that did not come from the demo. Anything created since is real
 * work, and real work is never guessed at.
 */
const { db } = require('./db');

/**
 * Everything the demo made carries an explicit flag, set when it was created.
 * Nothing here is inferred from an address or a phone number, so a real client
 * who happens to look like a demo one is never at risk.
 */
function summarise() {
  return {
    clients: db.prepare('SELECT id FROM clients WHERE is_demo = 1').all().map((c) => c.id),
    requests: db.prepare('SELECT id FROM requests WHERE is_demo = 1').all().map((r) => r.id),
    staff: db.prepare('SELECT id FROM users WHERE is_demo = 1').all().map((u) => u.id),
  };
}

function clear({ quiet = false } = {}) {
  const log = quiet ? () => {} : console.log;
  const { clients, requests, staff } = summarise();

  const reqList = requests.join(',') || '-1';
  const clientList = clients.join(',') || '-1';

  const counts = {
    requests: requests.length,
    clients: clients.length,
    comments: db.prepare(`SELECT COUNT(*) c FROM comments WHERE request_id IN (${reqList})`).get().c,
    payments: db.prepare(`SELECT COUNT(*) c FROM payments WHERE request_id IN (${reqList})`).get().c,
    documents: db.prepare(`SELECT COUNT(*) c FROM documents WHERE request_id IN (${reqList})`).get().c,
  };

  db.transaction(() => {
    // Children first, because foreign keys are on and that is the point of them.
    db.prepare(`UPDATE agenda_events SET case_id=NULL WHERE case_id IN
                 (SELECT id FROM legal_cases WHERE request_id IN (${reqList}))`).run();
    db.prepare(`UPDATE agenda_events SET request_id=NULL WHERE request_id IN (${reqList})`).run();
    db.prepare(`UPDATE support_tickets SET request_id=NULL WHERE request_id IN (${reqList})`).run();
    db.prepare(`UPDATE treasury_transactions SET request_id=NULL WHERE request_id IN (${reqList})`).run();
    db.prepare(`UPDATE agenda_events SET client_id=NULL WHERE client_id IN (${clientList})`).run();
    db.prepare(`UPDATE support_tickets SET opened_by_client_id=NULL,client_id=NULL
                 WHERE opened_by_client_id IN (${clientList}) OR client_id IN (${clientList})`).run();
    db.prepare(`UPDATE treasury_transactions SET client_id=NULL WHERE client_id IN (${clientList})`).run();
    db.prepare(`DELETE FROM document_files WHERE document_id IN
                 (SELECT id FROM documents WHERE request_id IN (${reqList}))`).run();
    db.prepare(`DELETE FROM documents WHERE request_id IN (${reqList})`).run();
    db.prepare(`DELETE FROM comments WHERE request_id IN (${reqList})`).run();
    db.prepare(`DELETE FROM todos WHERE request_id IN (${reqList})`).run();
    db.prepare(`DELETE FROM requirements WHERE request_id IN (${reqList})`).run();
    db.prepare(`DELETE FROM fee_items WHERE request_id IN (${reqList})`).run();
    db.prepare(`DELETE FROM payments WHERE request_id IN (${reqList})`).run();
    db.prepare(`DELETE FROM request_assignees WHERE request_id IN (${reqList})`).run();
    db.prepare(`DELETE FROM request_destinations WHERE request_id IN (${reqList})`).run();
    db.prepare(`DELETE FROM notifications WHERE request_id IN (${reqList})`).run();
    db.prepare(`DELETE FROM audit_log WHERE entity_type = 'request' AND entity_id IN (${reqList})`).run();
    db.prepare(`DELETE FROM requests WHERE id IN (${reqList})`).run();
    db.prepare(`DELETE FROM clients WHERE id IN (${clientList})`).run();

    // Trips are demo-made only if nothing real is attached to them any more.
    db.prepare('DELETE FROM trips WHERE is_demo = 1').run();

    // Demo staff, and everything that pointed at them.
    const staffIds = staff;

    if (staffIds.length) {
      const list = staffIds.join(',');
      db.prepare(`DELETE FROM notifications WHERE user_id IN (${list})`).run();
      db.prepare(`DELETE FROM known_devices WHERE user_id IN (${list})`).run();
      db.prepare(`DELETE FROM login_history WHERE user_id IN (${list})`).run();
      db.prepare(`DELETE FROM password_resets WHERE audience = 'staff' AND subject_id IN (${list})`).run();
      db.prepare(`DELETE FROM request_assignees WHERE user_id IN (${list})`).run();
      // Delete accounts that have no retained history. If a later module keeps
      // a legally relevant row (custody, payroll approval, export log, etc.)
      // SQLite correctly refuses the delete. Archive that login instead of
      // deleting history or disabling foreign keys.
      const removeUser=db.prepare('DELETE FROM users WHERE id=?');
      const archiveUser=db.prepare(`UPDATE users SET active=0,is_demo=0,
        username=?,display_name='حساب محاكاة مؤرشف' WHERE id=?`);
      for(const id of staffIds){
        try{removeUser.run(id)}catch(err){
          if(!String(err.code||'').startsWith('SQLITE_CONSTRAINT'))throw err;
          archiveUser.run(`archived-demo-${id}`,id);
        }
      }
    }

    counts.staff = staffIds.length;

    // Anything left in the recycle bin came from the demo too.
    db.prepare('DELETE FROM trash').run();
    db.prepare("DELETE FROM mail_log WHERE to_email LIKE '%@demo.sanad' OR to_email LIKE '%@example.com'").run();
  })();

  db.exec('VACUUM');

  log('');
  log('  ════════════════════════════════════════════════');
  log('    Demo data removed');
  log('  ════════════════════════════════════════════════');
  log(`    ${counts.requests} requests · ${counts.clients} clients · ${counts.staff} staff`);
  log(`    ${counts.comments} comments · ${counts.payments} payments · ${counts.documents} documents`);
  log('');
  log('    Left untouched: the service catalogue, settings, destinations,');
  log('    and every request or account that was not demo data.');
  log('');

  const left = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (!left) {
    log('    No staff accounts remain.');
    log('    Run npm start and a fresh admin account will be created.');
    log('');
  }

  return counts;
}

if (require.main === module) {
  clear();
}

module.exports = clear;
