const express=require('express'),{db,setSetting}=require('../../db'),{can}=require('../../middleware/auth'),b=require('../../lib/bookings');
const router=express.Router();
function handle(fn){return (req,res,next)=>{try{fn(req,res);}catch(e){if(e.status||e.code==='SQLITE_CONSTRAINT_UNIQUE')return res.status(e.status||409).render('public/booking_error',{message:e.status?e.message:'الموعد محجوز بالفعل.'});next(e);}};}
router.use(can('agenda.view'));
const manager=req=>req.userCan('bookings.manage');
router.get('/new',can('bookings.create'),(req,res)=>res.render('admin/booking_new',{
 clients:db.prepare('SELECT id,full_name,phone,email FROM clients ORDER BY full_name LIMIT 1000').all(),
 slots:b.slots(),modes:db.prepare('SELECT * FROM consultation_modes WHERE active=1 ORDER BY id').all(),
 services:db.prepare('SELECT id,title_ar,is_consultation FROM services WHERE active=1 ORDER BY is_consultation DESC,sort,id').all(),
 staff:manager(req)?db.prepare('SELECT id,display_name FROM users WHERE active=1 ORDER BY display_name').all():[],
 error:req.query.error||''
}));
router.post('/new',can('bookings.create'),handle((req,res)=>{
 const userId=Number(req.body.user_id)||null;
 if(userId&&!manager(req))b.fail('غير مصرح بتعيين الموظف',403);
 const selectedSlot=b.slots().find(s=>s.id===Number(req.body.slot_id));
 if(!selectedSlot)b.fail('الموعد غير متاح',409);
 if(userId)b.available(userId,selectedSlot);
 if(req.body.client_id)req.bookingClientId=Number(req.body.client_id);
 const saved=b.create(req,req.body,{internal:true});
 if(userId)b.change(req,saved.id,{action:'assign',user_id:userId,version:saved.version,reason:'إنشاء الموعد وتعيين الموظف من لوحة الإدارة'});
 res.redirect(req.adminPath+'/appointments/'+saved.id);
}));
router.post('/:id/invoice',can('bookings.manage'),can('money.fees'),handle((req,res)=>{require('../../lib/booking-invoices').issue(req,req.params.id);res.redirect(req.adminPath+'/appointments/'+Number(req.params.id)+'/invoice');}));
router.get('/:id/invoice',can('money.view'),(req,res)=>{const item=b.row(req.params.id);if(!item||!manager(req)&&item.assigned_user_id!==req.user.id)return res.sendStatus(404);const invoice=require('../../lib/booking-invoices').get(item.id);if(!invoice)return res.sendStatus(404);res.render('public/booking_invoice',{invoice});});
router.post('/:id/company',can('bookings.manage'),handle((req,res)=>{
 const item=b.row(req.params.id);if(!item)b.fail('الموعد غير موجود',404);
 const company=db.prepare('SELECT id FROM companies WHERE id=? AND active=1').get(Number(req.body.company_id));
 const branch=req.body.branch_id?db.prepare('SELECT id FROM company_branches WHERE id=? AND company_id=? AND active=1').get(Number(req.body.branch_id),company?.id||0):null;
 if(!company||req.body.branch_id&&!branch)b.fail('الشركة أو الفرع غير صحيح');
 db.transaction(()=>{db.prepare('UPDATE requests SET company_id=?,branch_id=? WHERE id=?').run(company.id,branch?.id||null,item.request_id);db.prepare('UPDATE agenda_events SET company_id=? WHERE id=?').run(company.id,item.agenda_event_id);require('../../lib/audit').log(req,'booking.company',{type:'booking',id:item.id,details:JSON.stringify({company:company.id,branch:branch?.id||null})});})();res.redirect(req.adminPath+'/appointments/'+item.id);
}));
function listing(req){const q=String(req.query.q||'').trim(),tab=String(req.query.tab||'');let status=req.query.status||'';if(tab==='unassigned')status='unassigned';return db.prepare(`SELECT b.*,s.starts_at,s.ends_at,c.full_name,c.phone,u.display_name FROM bookings b JOIN booking_slots s ON s.id=b.slot_id JOIN clients c ON c.id=b.client_id LEFT JOIN users u ON u.id=b.assigned_user_id WHERE (?=1 OR b.assigned_user_id=?) AND (?='' OR b.status=?) AND (?='' OR b.ref LIKE ? OR c.full_name LIKE ? OR c.phone LIKE ?) AND (?='' OR b.kind=?) ORDER BY s.starts_at DESC LIMIT 300`).all(manager(req)?1:0,req.user.id,status,status,q,`%${q}%`,`%${q}%`,`%${q}%`,req.query.kind||'',req.query.kind||'');}
router.get('/',(req,res)=>{const scope=manager(req)?'1=1':'assigned_user_id='+Number(req.user.id);const counts=Object.fromEntries(db.prepare(`SELECT status,COUNT(*) n FROM bookings WHERE ${scope} GROUP BY status`).all().map(x=>[x.status,x.n]));counts.today=db.prepare(`SELECT COUNT(*) n FROM bookings b JOIN booking_slots s ON s.id=b.slot_id WHERE ${scope.replace('assigned_user_id','b.assigned_user_id')} AND date(s.starts_at)=date('now')`).get().n;res.render('admin/bookings',{items:listing(req),slots:b.slots(),modes:db.prepare('SELECT * FROM consultation_modes').all(),staff:manager(req)?db.prepare('SELECT id,display_name FROM users WHERE active=1 ORDER BY display_name').all():[],counts,manage:manager(req),enabled:b.enabled(),tab:req.query.tab||'bookings'});});
router.post('/:id/assign',can('bookings.manage'),handle((req,res)=>{const item=b.row(req.params.id);if(!item)b.fail('الموعد غير موجود',404);b.change(req,item.id,{action:'assign',user_id:req.body.user_id,version:item.version,reason:req.body.reason||'تعيين الموظف من قائمة المواعيد'});res.redirect(req.adminPath+'/appointments?tab=unassigned');}));
router.get('/export.csv',can('agenda.export'),(req,res)=>require('../../lib/reporting').csv(res,'appointments',['المرجع','الموعد','العميل','الموظف','الحالة'],listing(req).map(x=>[x.ref,x.starts_at,x.full_name,x.display_name,x.status])));
router.post('/settings',can('bookings.manage'),(req,res)=>{setSetting('booking_enabled',req.body.enabled?'1':'0');require('../../lib/audit').log(req,'booking.settings',{details:req.body.enabled?'تفعيل الحجز':'إيقاف الحجز'});res.redirect(req.adminPath+'/appointments?tab=settings');});
router.post('/modes',can('bookings.manage'),handle((req,res)=>{const name=String(req.body.name||'').trim().slice(0,100);if(!name)b.fail('اكتب اسم النوع');if(req.body.id)db.prepare('UPDATE consultation_modes SET name=?,active=? WHERE id=?').run(name,req.body.active?1:0,Number(req.body.id));else db.prepare('INSERT INTO consultation_modes(name,active) VALUES(?,1)').run(name);require('../../lib/audit').log(req,'booking.mode',{details:name});res.redirect(req.adminPath+'/appointments');}));
router.post('/slots',can('bookings.manage'),handle((req,res)=>{const start=b.stamp(req.body.starts_at),end=b.stamp(req.body.ends_at);if(start>=end||Date.parse(start.replace(' ','T')+'Z')<=Date.now())b.fail('يجب أن يكون الموعد مستقبليًا ونهايته بعد بدايته');db.prepare('INSERT INTO booking_slots(starts_at,ends_at,location) VALUES(?,?,?)').run(start,end,String(req.body.location||'').trim().slice(0,200));require('../../lib/audit').log(req,'booking.slot',{details:start+' / '+end});res.redirect(req.adminPath+'/appointments?tab=slots&msg=opened');}));
router.post('/slots/:id/close',can('bookings.manage'),handle((req,res)=>{if(db.prepare("SELECT 1 FROM bookings WHERE slot_id=? AND status IN ('confirmed','unassigned')").get(Number(req.params.id)))b.fail('ألغ الحجز أو أعد جدولته أولًا',409);db.prepare('UPDATE booking_slots SET active=0 WHERE id=?').run(Number(req.params.id));res.redirect(req.adminPath+'/appointments?tab=slots');}));
router.get('/:id',(req,res)=>{const item=b.row(req.params.id);if(!item||!manager(req)&&item.assigned_user_id!==req.user.id)return res.sendStatus(404);res.render('admin/booking_detail',{item,slot:db.prepare('SELECT * FROM booking_slots WHERE id=?').get(item.slot_id),staff:manager(req)?db.prepare('SELECT id,display_name FROM users WHERE active=1 ORDER BY display_name').all():[],slots:b.slots(),history:db.prepare('SELECT * FROM booking_history WHERE booking_id=? ORDER BY id DESC').all(item.id),manage:manager(req),companies:db.prepare('SELECT id,name FROM companies WHERE active=1 ORDER BY name').all(),branches:db.prepare('SELECT id,name,company_id FROM company_branches WHERE active=1 ORDER BY name').all()});});
router.post('/:id',can('bookings.manage'),handle((req,res)=>{b.change(req,req.params.id,req.body);res.redirect(req.adminPath+'/appointments/'+Number(req.params.id));}));
module.exports=router;
