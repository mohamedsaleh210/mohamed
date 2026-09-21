const {db,getSetting}=require('../db');
const crypto=require('crypto');
const entitlements=require('./entitlements');
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e;};
function enabled(){return getSetting('booking_enabled','0')==='1';}
function stamp(value){const s=String(value||'').replace('T',' ');if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)||!Number.isFinite(Date.parse(s.replace(' ','T')+'Z')))fail('تاريخ غير صحيح');if(new Date(s.replace(' ','T')+'Z').toISOString().slice(0,16).replace('T',' ')!==s)fail('تاريخ غير صحيح');return s;}
function slot(id){const s=db.prepare('SELECT * FROM booking_slots WHERE id=? AND active=1').get(Number(id));if(!s||Date.parse(s.starts_at.replace(' ','T')+'Z')<=Date.now())fail('الموعد غير متاح',409);return s;}
function available(userId,s,ignore=null){
 const u=db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(userId);
 if(!u||u.assign_locked && (!u.assign_lock_until || Date.parse(u.assign_lock_until)>Date.now()))fail('الموظف غير متاح للتعيين',409);
 const clash=db.prepare(`SELECT e.id FROM agenda_events e WHERE e.status NOT IN ('cancelled','completed') AND e.id!=? AND (e.assigned_user_id=? OR EXISTS(SELECT 1 FROM agenda_assignees a WHERE a.agenda_event_id=e.id AND a.user_id=?)) AND e.starts_at<? AND COALESCE(e.ends_at,datetime(e.starts_at,'+1 hour'))>?`).get(ignore||-1,userId,userId,s.ends_at,s.starts_at);
 if(clash)fail('الموظف لديه موعد متعارض',409);
}
function history(req,before,after,action,reason){
 const actor=req.user||req.session?.client;
 const type=req.user?'staff':'client';
 db.prepare('INSERT INTO booking_history(booking_id,action,before_json,after_json,actor_id,actor_type,reason) VALUES(?,?,?,?,?,?,?)').run(after.id,action,before?JSON.stringify(before):null,JSON.stringify(after),actor?.id||null,type,reason);
 db.prepare(`INSERT INTO audit_log(user_id,user_label,action,entity_type,entity_id,entity_label,details,ip) VALUES(?,?,?,'booking',?,?,?,?)`).run(req.user?.id||null,req.user?.display_name||'العميل',`booking.${action}`,after.id,after.ref,JSON.stringify({before,after,reason}),req.ip||null);
 db.prepare('INSERT INTO booking_client_notifications(client_id,booking_id,text) VALUES(?,?,?)').run(after.client_id,after.id,`${after.ref}: ${reason}`);
 const audience=new Set([before?.assigned_user_id,after.assigned_user_id].filter(Boolean));
 if(action==='created') db.prepare("SELECT id FROM users WHERE active=1 AND role IN ('admin','supervisor')").all().forEach(u=>audience.add(u.id));
 const ins=db.prepare("INSERT INTO notifications(user_id,type,text,priority,booking_id) VALUES(?,'booking',?,'normal',?)");
 for(const id of audience)ins.run(id,`${after.ref}: ${reason}`,after.id);
}
const row=id=>db.prepare('SELECT * FROM bookings WHERE id=?').get(Number(id));
function bookingClient(req,input){
 if(req.bookingClientId){const c=db.prepare('SELECT * FROM clients WHERE id=?').get(req.bookingClientId);if(!c)fail('العميل غير موجود');return c;}
 if(req.session?.client){const c=db.prepare('SELECT * FROM clients WHERE id=?').get(req.session.client.id);if(!c)fail('سجل الدخول مجددًا',401);return c;}
 const name=String(input.full_name||'').trim().slice(0,150),phone=String(input.phone||'').replace(/[^0-9+]/g,'').slice(0,30),email=String(input.email||'').trim().toLowerCase().slice(0,200);
 if(name.length<2||phone.length<7||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('أدخل الاسم ورقم الموبايل والبريد الإلكتروني بشكل صحيح');
 let c=db.prepare('SELECT * FROM clients WHERE lower(email)=? OR phone=? ORDER BY CASE WHEN lower(email)=? THEN 0 ELSE 1 END LIMIT 1').get(email,phone,email);
 if(!c){const bcrypt=require('bcryptjs');const x=db.prepare('INSERT INTO clients(email,password_hash,full_name,phone,email_verified) VALUES(?,?,?,?,0)').run(email,bcrypt.hashSync(crypto.randomBytes(32).toString('hex'),10),name,phone);c=db.prepare('SELECT * FROM clients WHERE id=?').get(x.lastInsertRowid);}
 return c;
}
function create(req,input,options={}){return db.transaction(()=>{
 if(!options.internal&&!enabled())fail('استقبال المواعيد غير متاح',403);
 const client=bookingClient(req,input),guest=!req.session?.client&&!req.bookingClientId;
 const s=slot(input.slot_id);const kind=input.kind==='consultation'?'consultation':'appointment';
 let service=null,mode=null;
 if(input.service_id){service=db.prepare('SELECT * FROM services WHERE id=? AND active=1').get(Number(input.service_id));if(!service)fail('الخدمة غير متاحة');const e=entitlements.current();if(e.serviceIds!=='*'&&!e.serviceIds.includes(service.id))fail('الخدمة غير مسموحة',403);}
 if(kind==='consultation'){mode=db.prepare('SELECT * FROM consultation_modes WHERE id=? AND active=1').get(Number(input.mode_id));if(!mode||!service?.is_consultation)fail('اختر نوع الاستشارة وخدمتها');}
 if(db.prepare("SELECT 1 FROM bookings b JOIN booking_slots s ON s.id=b.slot_id WHERE b.status IN ('unassigned','confirmed') AND b.client_id=? AND s.starts_at<? AND s.ends_at>?").get(client.id,s.ends_at,s.starts_at))fail('لديك حجز متعارض',409);
 if(!require('./tenant-policy').allowance('requests',1).allowed)fail('تم الوصول لحد الطلبات',402);
 const notes=String(input.notes||'').trim().slice(0,2000),ref='APT-'+crypto.randomBytes(8).toString('hex').toUpperCase();
 const r=db.prepare('INSERT INTO requests(name,phone,email,client_id,service_id,service_label,message,is_custom,ref,upload_token) VALUES(?,?,?,?,?,?,?,?,?,?)').run(client.full_name,client.phone,client.email,client.id,service?.id||null,service?.title_ar||'حجز موعد',notes,service?0:1,require('./ref').generate(c=>!!db.prepare('SELECT 1 FROM requests WHERE ref=?').get(c)),crypto.randomBytes(24).toString('hex'));
 const rid=Number(r.lastInsertRowid);
 if(service)db.prepare('INSERT INTO request_services(request_id,service_id,label,sort,added_by) VALUES(?,?,?,0,?)').run(rid,service.id,service.title_ar,'العميل');
 const a=db.prepare("INSERT INTO agenda_events(title,event_type,starts_at,ends_at,request_id,client_id,client_visible,location,notes) VALUES(?,'booking',?,?,?,?,1,?,?)").run(ref,s.starts_at,s.ends_at,rid,client.id,s.location,notes);
 const token=guest?crypto.randomBytes(32).toString('hex'):null;
 const b=db.prepare('INSERT INTO bookings(ref,client_id,slot_id,mode_id,kind,service_id,request_id,agenda_event_id,notes,public_token,guest_booking) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(ref,client.id,s.id,mode?.id||null,kind,service?.id||null,rid,Number(a.lastInsertRowid),notes,token,guest?1:0);
 const saved=row(b.lastInsertRowid);history(req,null,saved,'created','حجز جديد يحتاج تعيين موظف');return saved;
 }).immediate();}
function change(req,id,input,asClient=false){return db.transaction(()=>{
 const b=row(id);if(!b||asClient&&b.client_id!==req.session.client.id)fail('الموعد غير موجود',404);
 if(Number(input.version)!==b.version)fail('تم تحديث الموعد، أعد تحميل الصفحة',409);
 if(['completed','cancelled'].includes(b.status))fail('الموعد مغلق',409);
 const reason=String(input.reason||'').trim().slice(0,500);if(!reason)fail('اكتب سبب التعديل');
 const action=input.action;
 if(asClient&&!['reschedule','cancel'].includes(action))fail('غير مصرح',403);
 if(action==='assign'){
  const uid=Number(input.user_id);available(uid,slot(b.slot_id),b.agenda_event_id);
  db.prepare("UPDATE bookings SET assigned_user_id=?,status='confirmed' WHERE id=?").run(uid,b.id);
  db.prepare('UPDATE agenda_events SET assigned_user_id=? WHERE id=?').run(uid,b.agenda_event_id);
  db.prepare('DELETE FROM agenda_assignees WHERE agenda_event_id=?').run(b.agenda_event_id);
  db.prepare('INSERT INTO agenda_assignees(agenda_event_id,user_id) VALUES(?,?)').run(b.agenda_event_id,uid);
  if(b.assigned_user_id)db.prepare('DELETE FROM request_assignees WHERE request_id=? AND user_id=?').run(b.request_id,b.assigned_user_id);
  db.prepare('INSERT OR IGNORE INTO request_assignees(request_id,user_id,assigned_by) VALUES(?,?,?)').run(b.request_id,uid,req.user.display_name);
 }else if(action==='reschedule'){
  const s=slot(input.slot_id);
  if(b.assigned_user_id)available(b.assigned_user_id,s,b.agenda_event_id);
  if(db.prepare("SELECT 1 FROM bookings b JOIN booking_slots s ON s.id=b.slot_id WHERE b.status IN ('unassigned','confirmed') AND b.id!=? AND b.client_id=? AND s.starts_at<? AND s.ends_at>?").get(b.id,b.client_id,s.ends_at,s.starts_at))fail('لديك موعد متعارض',409);
  db.prepare('UPDATE bookings SET slot_id=? WHERE id=?').run(s.id,b.id);
  db.prepare('UPDATE agenda_events SET starts_at=?,ends_at=?,location=? WHERE id=?').run(s.starts_at,s.ends_at,s.location,b.agenda_event_id);
 }else if(['cancel','complete'].includes(action)){
  if(action==='complete'&&!b.assigned_user_id)fail('يجب تعيين الموظف أولًا');
  const status=action==='cancel'?'cancelled':'completed';
  db.prepare('UPDATE bookings SET status=? WHERE id=?').run(status,b.id);
  db.prepare("UPDATE agenda_events SET status=?,completed_at=CASE WHEN ?='completed' THEN datetime('now') ELSE NULL END WHERE id=?").run(status,status,b.agenda_event_id);
 }else if(action==='edit'&&!asClient){db.prepare('UPDATE bookings SET notes=? WHERE id=?').run(String(input.notes||'').trim().slice(0,2000),b.id);db.prepare('UPDATE agenda_events SET notes=? WHERE id=?').run(String(input.notes||'').trim().slice(0,2000),b.agenda_event_id);}
 else fail('إجراء غير صحيح');
 db.prepare('UPDATE bookings SET version=version+1 WHERE id=?').run(b.id);
 const after=row(b.id);history(req,b,after,action,reason);return after;
 }).immediate();}
function slots(){return db.prepare("SELECT s.* FROM booking_slots s WHERE s.active=1 AND s.starts_at>strftime('%Y-%m-%d %H:%M','now') AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.slot_id=s.id AND b.status IN ('unassigned','confirmed')) ORDER BY s.starts_at LIMIT 200").all();}
function publicRow(token){return db.prepare('SELECT * FROM bookings WHERE public_token=?').get(String(token||''));}
function changePublic(req,token,input){const item=publicRow(token);if(!item)fail('الرابط غير صالح',404);return change(Object.assign({},req,{session:Object.assign({},req.session,{client:{id:item.client_id}})}),item.id,input,true);}
module.exports={create,change,changePublic,row,publicRow,available,slots,enabled,stamp,fail};
