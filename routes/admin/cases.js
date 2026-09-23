const express = require('express');
const { db } = require('../../db');
const { can } = require('../../middleware/auth');
const casesLib = require('../../lib/cases');
const notify = require('../../lib/notify');
const audit = require('../../lib/audit');

const router = express.Router();
const label = (req) => req.user.display_name || req.user.username;
const validDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null;
const text = (v, max = 1000) => String(v || '').trim().slice(0, max);
const STATUSES = Object.keys(casesLib.STATUS);

function notifyTeam(caseRow, req, type, message, priority = 'normal') {
  const ids = db.prepare('SELECT user_id FROM case_assignees WHERE case_id=?').all(caseRow.id)
    .map(x => x.user_id).filter(id => id !== req.user.id);
  if (ids.length) notify.notifyUsers([...new Set(ids)], caseRow.request_id, { type, text: message, priority });
}

function loadCase(req, res, next) {
  const row = db.prepare(`SELECT c.*, r.ref request_ref, r.name client_name, r.phone, r.email,
      cc.name category_name, cc.color category_color
      FROM legal_cases c JOIN requests r ON r.id=c.request_id
      LEFT JOIN case_categories cc ON cc.id=c.category_id WHERE c.id=?`).get(req.params.id);
  if (!row) return res.redirect(req.adminPath + '/cases');
  if (!casesLib.canSee(req.user, row.id)) return res.status(403).render('admin/denied');
  req.caseRow = row;
  next();
}

router.get('/', (req, res) => {
  const q = text(req.query.q, 120);
  const status = STATUSES.includes(req.query.status) ? req.query.status : '';
  const vis = casesLib.visibleFilter(req.user);
  let where = ' WHERE 1=1';
  const params = [];
  if (q) {
    where += ' AND (c.file_no LIKE ? OR c.case_number LIKE ? OR c.title LIKE ? OR r.name LIKE ?)';
    params.push(...Array(4).fill(`%${q}%`));
  }
  if (status) { where += ' AND c.status=?'; params.push(status); }
  where += vis.sql; params.push(...vis.params);
  const rows = db.prepare(`SELECT c.*,r.ref request_ref,r.name client_name,cc.name category_name,
      (SELECT COUNT(*) FROM case_tasks t WHERE t.case_id=c.id AND t.status='pending') pending_tasks
      FROM legal_cases c JOIN requests r ON r.id=c.request_id
      LEFT JOIN case_categories cc ON cc.id=c.category_id ${where}
      ORDER BY CASE WHEN c.next_hearing IS NULL THEN 1 ELSE 0 END,c.next_hearing,c.id DESC`).all(...params);
  const counts = db.prepare('SELECT status,COUNT(*) c FROM legal_cases GROUP BY status').all();
  const categories = db.prepare('SELECT * FROM case_categories WHERE active=1 ORDER BY sort,name').all();
  res.render('admin/cases', { rows, counts, q, status, STATUS: casesLib.STATUS, categories, msg: req.query.msg });
});

router.post('/categories', can('cases.view_all'), (req, res) => {
  const name = text(req.body.name, 80);
  if (name) db.prepare('INSERT OR IGNORE INTO case_categories(name,color) VALUES (?,?)')
    .run(name, /^#[0-9a-f]{6}$/i.test(req.body.color || '') ? req.body.color : '#b78b32');
  res.redirect(req.adminPath + '/cases');
});

router.post('/from-request/:requestId', can('cases.create'), (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id=?').get(req.params.requestId);
  if (!request) return res.redirect(req.adminPath + '/requests');
  const existing = db.prepare('SELECT id FROM legal_cases WHERE request_id=?').get(request.id);
  if (existing) return res.redirect(req.adminPath + '/cases/' + existing.id);
  const info = db.prepare(`INSERT INTO legal_cases
    (request_id,client_id,category_id,file_no,title,summary,created_by,office_branch_id)
    VALUES (?,?,?,?,?,?,?,?)`).run(request.id, request.client_id || null,
      Number(req.body.category_id) || null, casesLib.nextFileNo(),
      text(req.body.title, 180) || request.title || request.service_label || request.ref,
      request.message || null, req.user.id, request.office_branch_id || null);
  const caseId = Number(info.lastInsertRowid);
  const requestAssignees = db.prepare('SELECT user_id FROM request_assignees WHERE request_id=?').all(request.id);
  const add = db.prepare('INSERT OR IGNORE INTO case_assignees(case_id,user_id,assigned_by) VALUES (?,?,?)');
  requestAssignees.forEach((u) => add.run(caseId, u.user_id, req.user.id));
  audit.log(req, 'case.create', { type: 'case', id: caseId, label: casesLib.nextFileNo(), details: `تحويل الطلب ${request.ref} إلى ملف قضية` });
  res.redirect(req.adminPath + '/cases/' + caseId + '?msg=created');
});

router.get('/:id/report', can('cases.report'), loadCase, (req, res) => {
  const c = req.caseRow;
  const client = c.client_id ? db.prepare('SELECT * FROM clients WHERE id=?').get(c.client_id) : null;
  const hearings = db.prepare('SELECT * FROM case_hearings WHERE case_id=? ORDER BY hearing_on,id').all(c.id);
  const events = db.prepare('SELECT * FROM case_events WHERE case_id=? ORDER BY event_on,id').all(c.id);
  const tasks = db.prepare(`SELECT t.*,u.display_name assignee FROM case_tasks t LEFT JOIN users u ON u.id=t.assigned_user_id WHERE t.case_id=? ORDER BY due_on,id`).all(c.id);
  const parties = db.prepare('SELECT * FROM case_parties WHERE case_id=? ORDER BY id').all(c.id);
  const assignees = db.prepare(`SELECT ca.*,u.display_name FROM case_assignees ca JOIN users u ON u.id=ca.user_id WHERE ca.case_id=? ORDER BY ca.lead DESC,u.display_name`).all(c.id);
  res.render('admin/case_report',{c,client,hearings,events,tasks,parties,assignees,STATUS:casesLib.STATUS});
});

router.get('/:id', loadCase, (req, res) => {
  const c = req.caseRow;
  const hearings = db.prepare(`SELECT h.*,u.display_name creator FROM case_hearings h
    LEFT JOIN users u ON u.id=h.created_by WHERE h.case_id=? ORDER BY h.hearing_on DESC,h.id DESC`).all(c.id);
  const tasks = db.prepare(`SELECT t.*,u.display_name assignee FROM case_tasks t
    LEFT JOIN users u ON u.id=t.assigned_user_id WHERE t.case_id=? ORDER BY t.status,t.due_on,t.id DESC`).all(c.id);
  const events = db.prepare(`SELECT * FROM case_events WHERE case_id=? ORDER BY event_on DESC,id DESC LIMIT 100`).all(c.id);
  const parties = db.prepare('SELECT * FROM case_parties WHERE case_id=? ORDER BY id').all(c.id);
  const assignees = db.prepare(`SELECT ca.*,u.display_name,u.role FROM case_assignees ca
    JOIN users u ON u.id=ca.user_id WHERE ca.case_id=? ORDER BY ca.lead DESC,u.display_name`).all(c.id);
  const staff = db.prepare("SELECT id,display_name,role FROM users WHERE active=1 ORDER BY display_name").all();
  const categories = db.prepare('SELECT * FROM case_categories WHERE active=1 ORDER BY sort,name').all();
  res.render('admin/case_detail', { c, hearings, tasks, events, parties, assignees, staff, categories,
    STATUS: casesLib.STATUS, msg: req.query.msg });
});

router.post('/:id/update', can('cases.edit'), loadCase, (req, res) => {
  const old = req.caseRow;
  const status = STATUSES.includes(req.body.status) ? req.body.status : old.status;
  const priority = ['normal','high','urgent'].includes(req.body.priority) ? req.body.priority : 'normal';
  db.prepare(`UPDATE legal_cases SET title=?,category_id=?,case_number=?,judicial_year=?,court=?,circuit=?,
    opposing_party=?,status=?,priority=?,summary=?,client_summary=?,closed_on=?,updated_at=datetime('now') WHERE id=?`)
    .run(text(req.body.title,180)||old.title,Number(req.body.category_id)||null,text(req.body.case_number,80)||null,
      text(req.body.judicial_year,20)||null,text(req.body.court,120)||null,text(req.body.circuit,80)||null,
      text(req.body.opposing_party,180)||null,status,priority,text(req.body.summary,3000)||null,
      text(req.body.client_summary,1500)||null,status==='closed'?(old.closed_on||new Date().toISOString().slice(0,10)):null,old.id);
  if (status !== old.status) {
    db.prepare(`INSERT INTO case_events(case_id,event_type,title,details,client_visible,created_by,created_by_label)
      VALUES (?,'status','تغيير حالة القضية',?,1,?,?)`).run(old.id,`${casesLib.STATUS[old.status]} ← ${casesLib.STATUS[status]}`,req.user.id,label(req));
    notifyTeam(old,req,'case_status',`${old.file_no}: الحالة ${casesLib.STATUS[status]}`,'high');
  }
  audit.log(req,'case.update',{type:'case',id:old.id,label:old.file_no,details:'تحديث بيانات القضية'});
  res.redirect(req.adminPath + '/cases/' + old.id + '?msg=saved');
});

router.post('/:id/assign', can('cases.assign'), loadCase, (req, res) => {
  const uid = Number(req.body.user_id);
  const person = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(uid);
  if (person) {
    db.prepare('INSERT OR IGNORE INTO case_assignees(case_id,user_id,assignment_role,lead,assigned_by) VALUES (?,?,?,?,?)')
      .run(req.caseRow.id,uid,text(req.body.assignment_role,40)||'lawyer',req.body.lead==='1'?1:0,req.user.id);
    notify.notifyUsers([uid],req.caseRow.request_id,{type:'case_assigned',text:`تم تعيينك على القضية ${req.caseRow.file_no}`,priority:'high'});
    audit.log(req,'case.assign',{type:'case',id:req.caseRow.id,label:req.caseRow.file_no,details:`تعيين ${person.display_name}`});
  }
  res.redirect(req.adminPath + '/cases/' + req.caseRow.id + '?msg=assigned');
});

router.post('/:id/unassign/:userId', can('cases.assign'), loadCase, (req, res) => {
  db.prepare('DELETE FROM case_assignees WHERE case_id=? AND user_id=?').run(req.caseRow.id,req.params.userId);
  audit.log(req,'case.unassign',{type:'case',id:req.caseRow.id,label:req.caseRow.file_no,details:'إلغاء تعيين عضو من فريق القضية'});
  res.redirect(req.adminPath + '/cases/' + req.caseRow.id + '?msg=unassigned');
});

router.post('/:id/hearings', can('cases.hearings'), loadCase, (req, res) => {
  const on = validDate(req.body.hearing_on); const purpose = text(req.body.purpose,300);
  if (on && purpose) {
    db.prepare(`INSERT INTO case_hearings(case_id,hearing_on,court,circuit,purpose,client_visible,created_by)
      VALUES (?,?,?,?,?,?,?)`).run(req.caseRow.id,on,text(req.body.court,120)||req.caseRow.court,
      text(req.body.circuit,80)||req.caseRow.circuit,purpose,req.body.client_visible==='1'?1:0,req.user.id);
    db.prepare("UPDATE legal_cases SET next_hearing=?,updated_at=datetime('now') WHERE id=?").run(on,req.caseRow.id);
    notifyTeam(req.caseRow,req,'case_hearing',`جلسة ${req.caseRow.file_no} بتاريخ ${on}`,'high');
  }
  res.redirect(req.adminPath + '/cases/' + req.caseRow.id + '?msg=hearing');
});

router.post('/:id/hearings/:hearingId/result', can('cases.hearings'), loadCase, (req, res) => {
  const next = validDate(req.body.next_hearing);
  db.prepare(`UPDATE case_hearings SET status='completed',decision=?,next_hearing=? WHERE id=? AND case_id=?`)
    .run(text(req.body.decision,2000)||null,next,req.params.hearingId,req.caseRow.id);
  db.prepare("UPDATE legal_cases SET next_hearing=?,updated_at=datetime('now') WHERE id=?").run(next,req.caseRow.id);
  notifyTeam(req.caseRow,req,'case_hearing_result',`تم تسجيل قرار جلسة ${req.caseRow.file_no}`,'high');
  res.redirect(req.adminPath + '/cases/' + req.caseRow.id + '?msg=hearing_saved');
});

router.post('/:id/tasks', can('cases.tasks'), loadCase, (req, res) => {
  const title = text(req.body.title,240); const uid = Number(req.body.assigned_user_id)||null;
  if (title) {
    db.prepare(`INSERT INTO case_tasks(case_id,title,details,due_on,assigned_user_id,priority,client_visible,created_by)
      VALUES (?,?,?,?,?,?,?,?)`).run(req.caseRow.id,title,text(req.body.details,1500)||null,validDate(req.body.due_on),uid,
      ['normal','high','urgent'].includes(req.body.priority)?req.body.priority:'normal',req.body.client_visible==='1'?1:0,req.user.id);
    if (uid) notify.notifyUsers([uid],req.caseRow.request_id,{type:'case_task',text:`مهمة جديدة في ${req.caseRow.file_no}: ${title}`,priority:'high'});
    notifyTeam(req.caseRow,req,'case_activity',`عمل جديد في ${req.caseRow.file_no}: ${title}`);
  }
  res.redirect(req.adminPath + '/cases/' + req.caseRow.id + '?msg=task');
});

router.post('/:id/tasks/:taskId/toggle', can('cases.tasks'), loadCase, (req, res) => {
  const task = db.prepare('SELECT * FROM case_tasks WHERE id=? AND case_id=?').get(req.params.taskId,req.caseRow.id);
  if (task && (req.userCan('cases.view_all') || !task.assigned_user_id || task.assigned_user_id===req.user.id)) {
    const done = task.status !== 'completed';
    db.prepare("UPDATE case_tasks SET status=?,completed_at=?,completed_by=? WHERE id=?")
      .run(done?'completed':'pending',done?new Date().toISOString():null,done?req.user.id:null,task.id);
  }
  res.redirect(req.adminPath + '/cases/' + req.caseRow.id);
});

router.post('/:id/events', can('cases.edit'), loadCase, (req, res) => {
  const title = text(req.body.title,240);
  if (title) {
    db.prepare(`INSERT INTO case_events(case_id,event_type,title,details,event_on,client_visible,created_by,created_by_label)
    VALUES (?,?,?,?,?,?,?,?)`).run(req.caseRow.id,text(req.body.event_type,40)||'note',title,text(req.body.details,2000)||null,
    validDate(req.body.event_on)||new Date().toISOString(),req.body.client_visible==='1'?1:0,req.user.id,label(req));
    notifyTeam(req.caseRow,req,'case_activity',`إجراء جديد في ${req.caseRow.file_no}: ${title}`);
  }
  res.redirect(req.adminPath + '/cases/' + req.caseRow.id + '?msg=event');
});

router.post('/:id/parties', can('cases.parties'), loadCase, (req, res) => {
  const name = text(req.body.name,180);
  if (name) db.prepare('INSERT INTO case_parties(case_id,party_type,name,capacity,phone,notes) VALUES (?,?,?,?,?,?)')
    .run(req.caseRow.id,text(req.body.party_type,40)||'opponent',name,text(req.body.capacity,100)||null,
      text(req.body.phone,50)||null,text(req.body.notes,500)||null);
  res.redirect(req.adminPath + '/cases/' + req.caseRow.id + '?msg=party');
});

module.exports = router;
