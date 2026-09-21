const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db } = require('../../db');
const { can } = require('../../middleware/auth');
const audit = require('../../lib/audit');
const reporting = require('../../lib/reporting');
const csrf = require('../../lib/csrf');
const mailer = require('../../lib/mailer');

const router = express.Router();
const uploadDir = path.join(process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data'), 'support');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.mimetype)),
});

const STATUSES = {
  new: 'جديدة', review: 'تحت المراجعة', assigned: 'محالة إلى مسؤول', working: 'جارٍ العمل عليها',
  waiting_client: 'بانتظار رد العميل', resolved: 'تم الحل', closed: 'مغلقة', reopened: 'معاد فتحها',
};
const PRIORITIES = { low: 'منخفضة', medium: 'متوسطة', high: 'عالية', urgent: 'عاجلة' };
const allowedStatus = (v) => Object.hasOwn(STATUSES, v) ? v : 'new';
const allowedPriority = (v) => Object.hasOwn(PRIORITIES, v) ? v : 'medium';
const clean = (v, n = 1000) => String(v || '').trim().slice(0, n);
const nextRef = () => `SUP-${new Date().getFullYear()}-${String((db.prepare('SELECT COALESCE(MAX(id),0)+1 n FROM support_tickets').get().n)).padStart(5, '0')}`;

function scope(req) {
  return req.userCan('support.view_all') ? { sql: '', params: [] } : {
    sql: 'AND EXISTS(SELECT 1 FROM support_ticket_assignees sa WHERE sa.ticket_id=t.id AND sa.user_id=?)', params: [req.user.id],
  };
}
function list(req) {
  const sc = scope(req), statuses = [].concat(req.query.status || []).filter((x) => STATUSES[x]);
  const q = clean(req.query.q, 120), priority = PRIORITIES[req.query.priority] ? req.query.priority : '';
  const where = [sc.sql], params = [...sc.params];
  if (statuses.length) { where.push(`AND t.status IN (${statuses.map(() => '?').join(',')})`); params.push(...statuses); }
  if (priority) { where.push('AND t.priority=?'); params.push(priority); }
  if (q) { where.push('AND (t.ref LIKE ? OR t.title LIKE ? OR t.requester_name LIKE ? OR t.requester_phone LIKE ?)'); params.push(...Array(4).fill(`%${q}%`)); }
  return db.prepare(`SELECT t.*,GROUP_CONCAT(u.display_name, '، ') assignees FROM support_tickets t LEFT JOIN support_ticket_assignees a ON a.ticket_id=t.id LEFT JOIN users u ON u.id=a.user_id WHERE 1=1 ${where.join(' ')} GROUP BY t.id ORDER BY CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,t.id DESC LIMIT 500`).all(...params);
}

router.use(can('support.view'));
router.get('/', (req, res) => {
  const rows = list(req), stats = db.prepare(`SELECT COUNT(*) total,SUM(status NOT IN ('resolved','closed')) open_count,SUM(status='closed') closed_count,SUM(due_at IS NOT NULL AND due_at<datetime('now') AND status NOT IN ('resolved','closed')) overdue_count,ROUND(AVG(CASE WHEN resolved_at IS NOT NULL THEN (julianday(resolved_at)-julianday(created_at))*24 END),1) avg_hours FROM support_tickets`).get();
  res.render('admin/support', { rows, stats, STATUSES, PRIORITIES, staff: db.prepare("SELECT id,display_name FROM users WHERE active=1 ORDER BY display_name").all(), filters: req.query });
});
router.post('/new', can('support.create'), upload.single('attachment'), csrf.verifyDeferred, (req, res) => {
  const b=req.body, ref=nextRef(), info=db.prepare(`INSERT INTO support_tickets(ref,opened_by_type,opened_by_user_id,requester_name,requester_email,requester_phone,request_id,issue_type,title,description,priority,due_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(ref,'staff',req.user.id,clean(b.requester_name,120),clean(b.requester_email,160)||null,clean(b.requester_phone,40)||null,Number(b.request_id)||null,clean(b.issue_type,80),clean(b.title,180),clean(b.description,5000),allowedPriority(b.priority),clean(b.due_at,25)||null);
  const id=Number(info.lastInsertRowid);
  db.prepare(`INSERT INTO support_ticket_messages(ticket_id,author_type,author_id,author_name,body,attachment_path) VALUES(?,?,?,?,?,?)`).run(id,'staff',req.user.id,req.user.display_name,clean(b.description,5000),req.file?req.file.filename:null);
  audit.log(req,'support.create',{type:'support_ticket',id,label:ref,details:`فتح تذكرة ${ref}`});
  res.redirect(`${req.adminPath}/support/${id}`);
});
router.get('/export.csv', can('support.reports'), (req,res)=>{const rows=list(req);reporting.csv(res,'sanad-support',['الرقم','العنوان','مقدم الطلب','الأولوية','الحالة','المسؤولون','الإنشاء','الموعد'],rows.map(t=>[t.ref,t.title,t.requester_name,PRIORITIES[t.priority],STATUSES[t.status],t.assignees,t.created_at,t.due_at]))});
router.get('/print', can('support.reports'), (req,res)=>{const rows=list(req);reporting.print(res,'تقرير الدعم الفني',['الرقم','العنوان','العميل','الأولوية','الحالة','المسؤولون'],rows.map(t=>[t.ref,t.title,t.requester_name,PRIORITIES[t.priority],STATUSES[t.status],t.assignees||'—']))});
router.get('/:id', (req,res)=>{const t=db.prepare('SELECT * FROM support_tickets WHERE id=?').get(req.params.id);if(!t)return res.sendStatus(404);const sc=scope(req);if(sc.sql&&!db.prepare(`SELECT 1 FROM support_tickets t WHERE t.id=? ${sc.sql}`).get(t.id,...sc.params))return res.status(403).render('admin/denied');res.render('admin/support_detail',{t,STATUSES,PRIORITIES,messages:db.prepare('SELECT * FROM support_ticket_messages WHERE ticket_id=? AND (internal=0 OR ?=1) ORDER BY id').all(t.id,req.userCan('support.internal')?1:0),assignees:db.prepare('SELECT u.* FROM users u JOIN support_ticket_assignees a ON a.user_id=u.id WHERE a.ticket_id=?').all(t.id),staff:db.prepare('SELECT id,display_name FROM users WHERE active=1 ORDER BY display_name').all()})});
router.post('/:id/reply', can('support.reply'), upload.single('attachment'), csrf.verifyDeferred, (req,res)=>{const t=db.prepare('SELECT * FROM support_tickets WHERE id=?').get(req.params.id);if(!t)return res.sendStatus(404);const internal=req.body.internal&&req.userCan('support.internal')?1:0,body=clean(req.body.body,5000);db.prepare('INSERT INTO support_ticket_messages(ticket_id,author_type,author_id,author_name,body,internal,attachment_path) VALUES(?,?,?,?,?,?,?)').run(t.id,'staff',req.user.id,req.user.display_name,body,internal,req.file?req.file.filename:null);if(!t.first_response_at&&!internal)db.prepare("UPDATE support_tickets SET first_response_at=datetime('now'),updated_at=datetime('now') WHERE id=?").run(t.id);if(!internal&&t.requester_email)mailer.send({to:t.requester_email,subject:`رد جديد على تذكرة ${t.ref}`,template:'support_reply',html:`<div dir="rtl" style="font-family:Arial;padding:24px"><h2>${t.ref}</h2><p>${body.replace(/[<>&]/g,'')}</p><p><a href="${mailer.baseUrl()}/support/my/${t.id}">فتح التذكرة ومتابعتها</a></p></div>`});res.redirect(`${req.adminPath}/support/${t.id}`)});
router.post('/:id/manage', can('support.manage'), (req,res)=>{const id=Number(req.params.id),status=allowedStatus(req.body.status),priority=allowedPriority(req.body.priority);db.prepare(`UPDATE support_tickets SET status=?,priority=?,due_at=?,resolved_at=CASE WHEN ?='resolved' THEN COALESCE(resolved_at,datetime('now')) ELSE resolved_at END,closed_at=CASE WHEN ?='closed' THEN datetime('now') ELSE closed_at END,reopened_until=CASE WHEN ?='closed' THEN datetime('now','+7 days') ELSE reopened_until END,updated_at=datetime('now') WHERE id=?`).run(status,priority,clean(req.body.due_at,25)||null,status,status,status,id);audit.log(req,'support.manage',{type:'support_ticket',id,label:'دعم',details:`الحالة ${STATUSES[status]}، الأولوية ${PRIORITIES[priority]}`});res.redirect(`${req.adminPath}/support/${id}`)});
router.post('/:id/assign', can('support.assign'), (req,res)=>{const id=Number(req.params.id),ids=[...new Set([].concat(req.body.user_ids||[]).map(Number).filter(Boolean))];db.transaction(()=>{db.prepare('DELETE FROM support_ticket_assignees WHERE ticket_id=?').run(id);const add=db.prepare('INSERT INTO support_ticket_assignees(ticket_id,user_id) VALUES(?,?)');ids.forEach(uid=>add.run(id,uid));db.prepare("UPDATE support_tickets SET status=CASE WHEN status='new' THEN 'assigned' ELSE status END,updated_at=datetime('now') WHERE id=?").run(id)})();res.redirect(`${req.adminPath}/support/${id}`)});

module.exports = router;
