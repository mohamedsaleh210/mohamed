/** Additive test fixtures. Run only against the separate Pilot copy. Never resets users. */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert');
if(process.env.SANAD_PILOT_FIXTURES!=='1')throw Error('Set SANAD_PILOT_FIXTURES=1 on a separate Pilot copy.');
const {db,setSetting,DATA_DIR}=require('./db');require('./db/migrate').migrate({quiet:true});
const identity=()=>JSON.stringify(db.prepare('SELECT id,username,display_name,legal_name,password_hash FROM users ORDER BY id').all());
const before=identity();const admin=db.prepare("SELECT * FROM users WHERE role='admin' AND active=1 ORDER BY id LIMIT 1").get();
const result=db.transaction(()=>{
 const modules=require('./db/demo-complete').seedCompleteDemo(db,{admin});
 let client=db.prepare("SELECT * FROM clients WHERE email='pilot.bookings@example.test'").get();
 if(!client){const id=db.prepare("INSERT INTO clients(email,password_hash,full_name,phone,email_verified,is_demo) VALUES(?,?,?,?,1,1)").run('pilot.bookings@example.test',require('bcryptjs').hashSync('Pilot@Test2026',10),'عميل تجربة المواعيد','+201000009999').lastInsertRowid;client=db.prepare('SELECT * FROM clients WHERE id=?').get(id);}
 const company=db.prepare("SELECT * FROM companies WHERE name LIKE '%تجريبية%' ORDER BY id LIMIT 1").get();
 let added=0;
 for(const s of db.prepare('SELECT * FROM services WHERE active=1').all()){
  const ref='PILOT-SVC-'+s.id;
  if(db.prepare('SELECT 1 FROM requests WHERE ref=?').get(ref))continue;
  const id=db.prepare("INSERT INTO requests(ref,name,phone,email,client_id,service_id,service_label,message,is_demo,upload_token,company_id) VALUES(?,?,?,?,?,?,?,'طلب تجريبي للخدمة — ليس طلبًا حقيقيًا',1,?,?)").run(ref,client.full_name,client.phone,client.email,client.id,s.id,s.title_ar,crypto.randomBytes(24).toString('hex'),company?.id||null).lastInsertRowid;
  db.prepare("INSERT INTO request_services(request_id,service_id,label,sort,added_by) VALUES(?,?,?,0,'Pilot')").run(id,s.id,s.title_ar);added++;
 }
 setSetting('booking_enabled','1');
 const old=db.prepare("SELECT value FROM settings WHERE key='platform_entitlements'").get();
 if(old){const e=JSON.parse(old.value);e.modules=[...new Set([...(e.modules||[]),'consultations','agenda'])];e.publicElements=[...new Set([...(e.publicElements||[]),'consultations'])];e.serviceIds='*';setSetting('platform_entitlements',JSON.stringify(e));}
 assert.strictEqual(identity(),before,'Employee identities must be preserved');
 return {...modules,service_requests_added:added,employees_preserved:db.prepare('SELECT count(*) n FROM users').get().n};
}).immediate();
// Appointment examples exercise the actual business service.
if(process.env.TENANT_ID){
 const b=require('./lib/bookings'),client=db.prepare("SELECT * FROM clients WHERE email='pilot.bookings@example.test'").get();
 const svc=db.prepare('SELECT id FROM services WHERE active=1 AND is_consultation=1 LIMIT 1').get();
 const req={user:admin,session:{client},ip:'127.0.0.1'};
 const staff=db.prepare("SELECT * FROM users WHERE active=1 AND role='lawyer' AND assign_locked=0 ORDER BY id LIMIT 1").get()||admin;
 if(b.enabled()&&!db.prepare("SELECT 1 FROM booking_slots WHERE location='تجربة Pilot'").get()){
  for(let i=1;i<=14;i++){
   const day=new Date(Date.now()+i*86400000).toISOString().slice(0,10);
   const sid=db.prepare("INSERT INTO booking_slots(starts_at,ends_at,location) VALUES(?,?,'تجربة Pilot')").run(day+' 14:00',day+' 15:00').lastInsertRowid;
   if(i>5)continue;
   const booking=b.create(req,{slot_id:sid,kind:i<5?'consultation':'appointment',service_id:svc.id,mode_id:((i-1)%5)+1,notes:'بيانات تجربة Pilot'});
   db.prepare('UPDATE requests SET is_demo=1 WHERE id=?').run(booking.request_id);
   if(i===2||i===3){let v=b.change(req,booking.id,{version:1,action:'assign',user_id:staff.id,reason:'تعيين تجريبي'});if(i===3)b.change(req,v.id,{version:v.version,action:'complete',reason:'إغلاق تجريبي'});}
   if(i===4)b.change(req,booking.id,{version:1,action:'cancel',reason:'إلغاء تجريبي'});
  }
 }
 result.appointments=db.prepare('SELECT COUNT(*) n FROM bookings').get().n;
}
// Finance and actual attachment examples on the newly added bookings only.
for(const booking of db.prepare("SELECT b.* FROM bookings b JOIN requests r ON r.id=b.request_id WHERE r.is_demo=1 AND b.notes='بيانات تجربة Pilot'").all()){
 db.transaction(()=>{
  if(!db.prepare('SELECT 1 FROM fee_items WHERE request_id=?').get(booking.request_id)){
   db.prepare("INSERT INTO fee_items(request_id,label,amount,created_by) VALUES(?,'أتعاب استشارة تجريبية',300,'Pilot')").run(booking.request_id);
   db.prepare('UPDATE requests SET total_amount=300 WHERE id=?').run(booking.request_id);
  }
  if(booking.status==='completed'&&!db.prepare("SELECT 1 FROM payments WHERE request_id=? AND reference='PILOT-PAYMENT'").get(booking.request_id)){
   db.prepare("INSERT INTO payments(request_id,amount,method,paid_on,reference,note,recorded_by,recorded_by_id) VALUES(?,300,'cash',date('now'),'PILOT-PAYMENT','دفعة تجريبية وليست تحصيلًا حقيقيًا',?,?)").run(booking.request_id,admin.display_name,admin.id);
   db.prepare('UPDATE requests SET paid_amount=300 WHERE id=?').run(booking.request_id);
  }
 })();
 require('./lib/booking-invoices').issue({user:admin},booking.id);
 if(!db.prepare("SELECT 1 FROM documents WHERE request_id=? AND name='مرفق اختبار Pilot'").get(booking.request_id)){
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBc0AAAAASUVORK5CYII=','base64');
  const name='pilot-attachment-'+booking.id+'.png';const dir=require('./db').UPLOAD_DIR;fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name),bytes);
  db.transaction(()=>{const did=db.prepare("INSERT INTO documents(request_id,name,note,uploaded_by,source) VALUES(?,'مرفق اختبار Pilot','صورة صغيرة لاختبار الرفع والتنزيل فقط','Pilot','client')").run(booking.request_id).lastInsertRowid;db.prepare("INSERT INTO document_files(document_id,stored_name,original_name,mime,size) VALUES(?,?,'pilot.png','image/png',?)").run(did,name,bytes.length);})();
 }
}
assert.strictEqual(identity(),before);assert.strictEqual(db.pragma('foreign_key_check').length,0);
result.integrity=db.pragma('integrity_check',{simple:true});
fs.writeFileSync(path.join(DATA_DIR,'pilot-fixtures-report.json'),JSON.stringify(result,null,2));
db.pragma('wal_checkpoint(TRUNCATE)');console.log(JSON.stringify(result));db.close();
