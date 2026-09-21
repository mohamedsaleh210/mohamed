const express=require('express'),{db}=require('../db'),b=require('../lib/bookings');
const router=express.Router();
router.use((req,res,next)=>{if(!b.enabled())return res.sendStatus(403);next();});
const login=(req,res,next)=>{if(!req.session.client||!db.prepare('SELECT 1 FROM clients WHERE id=?').get(req.session.client.id)){return res.redirect('/portal/login');}next();};
const handle=fn=>(req,res,next)=>{try{fn(req,res);}catch(e){if(e.status||e.code==='SQLITE_CONSTRAINT_UNIQUE')return res.status(e.status||409).render('public/booking_error',{message:e.status?e.message:'تم حجز هذا الموعد، اختر موعدًا آخر.'});next(e);}};
router.get('/',handle((req,res)=>{
 const ent=require('../lib/entitlements').current();
 const services=db.prepare('SELECT id,title_ar,is_consultation FROM services WHERE active=1 ORDER BY sort,id').all().filter(s=>ent.serviceIds==='*'||ent.serviceIds.includes(s.id));
 res.render('public/booking_new',{slots:b.slots(),modes:db.prepare('SELECT * FROM consultation_modes WHERE active=1').all(),services,kind:req.query.kind==='consultation'?'consultation':'appointment'});
}));
router.post('/',handle((req,res)=>{const saved=b.create(req,req.body);res.redirect(saved.public_token?'/appointments/booking/'+saved.public_token:'/appointments/mine/'+saved.id);}));
router.get('/booking/:token',(req,res)=>{const item=b.publicRow(req.params.token);if(!item)return res.sendStatus(404);const slot=db.prepare('SELECT * FROM booking_slots WHERE id=?').get(item.slot_id),request=db.prepare('SELECT * FROM requests WHERE id=?').get(item.request_id);res.render('public/booking_detail',{item,slot,request,invoice:require('../lib/booking-invoices').get(item.id),slots:b.slots(),updates:db.prepare('SELECT text,created_at FROM booking_client_notifications WHERE booking_id=? AND client_id=? ORDER BY id DESC').all(item.id,item.client_id),guest:true});});
router.post('/booking/:token',handle((req,res)=>{b.changePublic(req,req.params.token,req.body);res.redirect('/appointments/booking/'+req.params.token);}));
router.get('/mine',login,(req,res)=>res.render('public/booking_list',{items:db.prepare('SELECT b.*,s.starts_at FROM bookings b JOIN booking_slots s ON s.id=b.slot_id WHERE b.client_id=? ORDER BY b.id DESC LIMIT 200').all(req.session.client.id)}));
router.get('/mine/:id/invoice',login,(req,res)=>{const item=b.row(req.params.id);if(!item||item.client_id!==req.session.client.id)return res.sendStatus(404);const invoice=require('../lib/booking-invoices').get(item.id);if(!invoice)return res.sendStatus(404);res.render('public/booking_invoice',{invoice});});
router.get('/mine/:id',login,(req,res)=>{const item=b.row(req.params.id);if(!item||item.client_id!==req.session.client.id)return res.sendStatus(404);const slot=db.prepare('SELECT * FROM booking_slots WHERE id=?').get(item.slot_id);const request=db.prepare('SELECT * FROM requests WHERE id=?').get(item.request_id);res.render('public/booking_detail',{item,slot,request,invoice:require('../lib/booking-invoices').get(item.id),slots:b.slots(),updates:db.prepare('SELECT text,created_at FROM booking_client_notifications WHERE booking_id=? AND client_id=? ORDER BY id DESC').all(item.id,item.client_id),guest:false});});
router.post('/mine/:id',login,handle((req,res)=>{b.change(req,req.params.id,req.body,true);res.redirect('/appointments/mine/'+Number(req.params.id));}));
module.exports=router;
