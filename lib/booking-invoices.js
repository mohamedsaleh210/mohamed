const {db}=require('../db');
exports.get=id=>db.prepare(`SELECT i.*,b.ref booking_ref,c.full_name,c.email,r.ref request_ref,r.paid_amount,r.total_amount,r.discount FROM booking_invoices i JOIN bookings b ON b.id=i.booking_id JOIN clients c ON c.id=b.client_id JOIN requests r ON r.id=b.request_id WHERE b.id=?`).get(Number(id));
exports.issue=(req,id)=>db.transaction(()=>{
 const b=db.prepare('SELECT * FROM bookings WHERE id=?').get(Number(id));if(!b)require('./bookings').fail('غير موجود',404);
 if(exports.get(id))return;
 const r=db.prepare('SELECT * FROM requests WHERE id=?').get(b.request_id);
 const amount=Number(r.total_amount)-Number(r.discount||0);
 if(!Number.isFinite(amount)||amount<=0)require('./bookings').fail('أضف بنود الأتعاب المعتمدة في الطلب أولًا');
 const number='INV-'+b.ref;
 db.prepare('INSERT INTO booking_invoices(booking_id,number,amount,issued_by) VALUES(?,?,?,?)').run(b.id,number,amount,req.user.id);
 db.prepare("INSERT INTO audit_log(user_id,user_label,action,entity_type,entity_id,entity_label,details) VALUES(?,?,'booking.invoice','booking',?,?,?)").run(req.user.id,req.user.display_name,b.id,b.ref,JSON.stringify({number,amount}));
}).immediate();
