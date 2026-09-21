const express=require('express');
const {db}=require('../../db');
const audit=require('../../lib/audit');
const {can}=require('../../middleware/auth');
const router=express.Router();
router.use(can('agenda.view'));
router.use((req,res,next)=>{const m=req.path.match(/^\/(\d+)\/status$/);if(req.method==='POST'&&m&&db.prepare('SELECT 1 FROM bookings WHERE agenda_event_id=?').get(Number(m[1])))return res.status(409).render('public/booking_error',{message:'عدّل حالة الحجز من صفحة المواعيد للحفاظ على تزامن السجل.'});next();});
const dt=(v,time='09:00')=>{v=String(v||'').trim();if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v))return v.replace('T',' ');if(/^\d{4}-\d{2}-\d{2}$/.test(v))return `${v} ${time}`;return null};
const ids=v=>(Array.isArray(v)?v:[v]).map(Number).filter(n=>Number.isInteger(n)&&n>0);
const filt=req=>({month:/^\d{4}-\d{2}$/.test(req.query.month||'')?req.query.month:new Date().toISOString().slice(0,7),userId:Number(req.query.user_id)||null});

function load(req){
 const {month,userId}=filt(req),isAdmin=['admin','supervisor'].includes(req.user.role);
 const manualScope=isAdmin?(userId?'AND EXISTS(SELECT 1 FROM agenda_assignees ax WHERE ax.agenda_event_id=e.id AND ax.user_id=?)':''):'AND (e.created_by=? OR EXISTS(SELECT 1 FROM agenda_assignees ax WHERE ax.agenda_event_id=e.id AND ax.user_id=?))';
 const manualParams=isAdmin?(userId?[userId]:[]):[req.user.id,req.user.id];
 const manual=db.prepare(`SELECT e.*,(SELECT GROUP_CONCAT(u.display_name,'، ') FROM agenda_assignees aa JOIN users u ON u.id=aa.user_id WHERE aa.agenda_event_id=e.id) assignee,r.ref request_ref,c.full_name client_name,co.name company_name FROM agenda_events e LEFT JOIN requests r ON r.id=e.request_id LEFT JOIN clients c ON c.id=e.client_id LEFT JOIN companies co ON co.id=e.company_id WHERE substr(e.starts_at,1,7)=? ${manualScope} ORDER BY e.starts_at`).all(month,...manualParams).map(x=>({...x,source:'manual'}));
 const assignedClause=isAdmin?(userId?'AND EXISTS(SELECT 1 FROM request_assignees ra WHERE ra.request_id=r.id AND ra.user_id=?)':''):'AND EXISTS(SELECT 1 FROM request_assignees ra WHERE ra.request_id=r.id AND ra.user_id=?)';
 const filterParams=userId||!isAdmin?[userId||req.user.id]:[];
 const requests=db.prepare(`SELECT r.id,('تسليم الطلب '||r.ref) title,'deadline' event_type,(r.deadline||' 09:00') starts_at,NULL ends_at,r.is_critical priority,r.status,(SELECT GROUP_CONCAT(u.display_name,'، ') FROM request_assignees ra JOIN users u ON u.id=ra.user_id WHERE ra.request_id=r.id) assignee,r.ref request_ref,r.name client_name,co.name company_name FROM requests r LEFT JOIN companies co ON co.id=r.company_id WHERE r.archived_at IS NULL AND substr(r.deadline,1,7)=? ${assignedClause} ORDER BY r.deadline`).all(month,...filterParams).map(x=>({...x,source:'request'}));
 const taskClause=isAdmin?(userId?'AND t.assigned_user_id=?':''):'AND t.assigned_user_id=?';
 const tasks=db.prepare(`SELECT t.id,t.title,'case_task' event_type,(t.due_on||' 09:00') starts_at,NULL ends_at,t.priority,t.status,u.display_name assignee,NULL request_ref,NULL client_name,NULL company_name FROM case_tasks t LEFT JOIN users u ON u.id=t.assigned_user_id WHERE substr(t.due_on,1,7)=? ${taskClause} ORDER BY t.due_on`).all(month,...filterParams).map(x=>({...x,source:'case'}));
 const tripClause=isAdmin?(userId?'AND t.assignee_id=?':''):'AND t.assignee_id=?';
 const trips=db.prepare(`SELECT t.id,('مشوار: '||COALESCE(d.name,'جهة خارجية')) title,'trip' event_type,(t.trip_date||' 09:00') starts_at,NULL ends_at,'normal' priority,t.status,t.assignee_name assignee,NULL request_ref,NULL client_name,NULL company_name FROM trips t LEFT JOIN destinations d ON d.id=t.destination_id WHERE substr(t.trip_date,1,7)=? ${tripClause} ORDER BY t.trip_date`).all(month,...filterParams).map(x=>({...x,source:'trip'}));
 return {events:[...manual,...requests,...tasks,...trips].sort((a,b)=>String(a.starts_at).localeCompare(String(b.starts_at))),month,userId,isAdmin};
}

router.get('/',(req,res)=>res.render('admin/agenda',{...load(req),staff:db.prepare('SELECT id,display_name FROM users WHERE active=1 ORDER BY display_name').all(),clients:db.prepare('SELECT id,full_name,phone FROM clients ORDER BY full_name LIMIT 500').all(),companies:db.prepare('SELECT id,name FROM companies WHERE active=1 ORDER BY name').all(),requestsList:db.prepare('SELECT id,ref,name FROM requests WHERE archived_at IS NULL ORDER BY id DESC LIMIT 500').all(),msg:req.query.msg}));

router.post('/new',can('agenda.manage'),(req,res)=>{
 const start=dt(req.body.starts_at,req.body.start_time||'09:00'),end=req.body.ends_at?dt(req.body.ends_at,req.body.end_time||'17:00'):null,title=String(req.body.title||'').trim();
 if(!start||!title)return res.redirect(`${req.adminPath}/agenda?msg=invalid`);
 const selected=[...new Set(ids(req.body.assigned_user_ids))];
 const users=selected.length?db.prepare(`SELECT id FROM users WHERE active=1 AND id IN (${selected.map(()=>'?').join(',')})`).all(...selected).map(x=>x.id):[];
 const requestId=Number(req.body.request_id)||null;let clientId=Number(req.body.client_id)||null,companyId=Number(req.body.company_id)||null;
 try{for(const uid of users)require('../../lib/bookings').available(uid,{starts_at:start,ends_at:end||start.slice(0,10)+' 23:59'});}catch(e){return res.status(409).render('public/booking_error',{message:e.message});}
 if(requestId){const link=db.prepare('SELECT client_id,company_id FROM requests WHERE id=?').get(requestId);if(link){clientId=clientId||link.client_id;companyId=companyId||link.company_id}}
 const info=db.prepare(`INSERT INTO agenda_events(title,event_type,starts_at,ends_at,priority,assigned_user_id,request_id,client_id,company_id,client_visible,location,notes,reminder_minutes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(title.slice(0,180),req.body.event_type||'task',start,end,req.body.priority||'normal',users[0]||null,requestId,clientId,companyId,req.body.client_visible?1:0,String(req.body.location||'').trim()||null,String(req.body.notes||'').trim()||null,Number(req.body.reminder_minutes)||1440,req.user.id);
 const add=db.prepare('INSERT OR IGNORE INTO agenda_assignees(agenda_event_id,user_id) VALUES(?,?)');db.transaction(()=>users.forEach(id=>add.run(info.lastInsertRowid,id)))();
 audit.log(req,'agenda.create',{type:'agenda',id:Number(info.lastInsertRowid),label:title,details:`إضافة موعد لعدد ${users.length} مسؤول`});res.redirect(`${req.adminPath}/agenda?msg=created`);
});
router.post('/:id/status',can('agenda.manage'),(req,res)=>{const status=['pending','in_progress','waiting','completed','cancelled'].includes(req.body.status)?req.body.status:'pending';db.prepare("UPDATE agenda_events SET status=?,completed_at=CASE WHEN ?='completed' THEN datetime('now') ELSE NULL END WHERE id=?").run(status,status,req.params.id);res.redirect(`${req.adminPath}/agenda?msg=updated`)});
router.get('/export.csv',can('agenda.export'),(req,res)=>{const {events,month}=load(req),esc=v=>`"${String(v??'').replace(/"/g,'""')}"`,lines=[['الموعد','النهاية','العمل','النوع','المسؤولون','العميل','الشركة','الطلب','الحالة'],...events.map(e=>[e.starts_at,e.ends_at,e.title,e.event_type,e.assignee,e.client_name,e.company_name,e.request_ref,e.status])];res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="sanad-agenda-${month}.csv"`);res.end(Buffer.from('\uFEFF'+lines.map(r=>r.map(esc).join(',')).join('\r\n'),'utf8'))});
router.get('/print',can('agenda.export'),(req,res)=>{const {events,month}=load(req);res.render('admin/report_print',{title:`أجندة الأعمال — ${month}`,columns:['الموعد','العمل','النوع','المسؤولون','الارتباط','الحالة'],rows:events.map(e=>[e.starts_at,e.title,e.event_type,e.assignee||'—',[e.client_name,e.company_name,e.request_ref].filter(Boolean).join(' · ')||'—',e.status]),generatedAt:new Date()})});
module.exports=router;
