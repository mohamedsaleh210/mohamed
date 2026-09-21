/**
 * Fills the modules that the original walkthrough did not cover.
 * Every row is recognisably demo data and every insert is idempotent.
 */
function seedCompleteDemo(db, { admin, log = () => {} } = {}) {
  const today = new Date();
  const iso = (offset = 0) => new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
  const stamp = (offset = 0, hour = 10) => `${iso(offset)} ${String(hour).padStart(2, '0')}:00`;
  const adminId = admin && admin.id;
  const adminName = (admin && admin.display_name) || 'Adam';
  log('  Complete linked demo modules…');

  const companyRows = [
    ['شركة النيل للتطوير العقاري — تجريبية','شركة النيل للتطوير العقاري ش.م.م','CR-DEMO-1001','TAX-DEMO-1001','+201001110001','demo@nile.test','القاهرة الجديدة','سارة إبراهيم منصور'],
    ['مؤسسة أفق للاستشارات — تجريبية','مؤسسة أفق للاستشارات المهنية','CR-DEMO-1002','TAX-DEMO-1002','+966551110002','demo@horizon.test','الرياض','أحمد الراشد'],
    ['شركة بوابة الأعمال — تجريبية','شركة بوابة الأعمال للخدمات','CR-DEMO-1003','TAX-DEMO-1003','+201001110003','demo@gateway.test','الجيزة','مريم حسن'],
  ];
  const companies=[];
  const insertCompany=db.prepare(`INSERT INTO companies(name,legal_name,registration_no,tax_no,phone,email,address,contact_name,notes,active,created_by)
    VALUES(?,?,?,?,?,?,?,?,?,1,?)`);
  companyRows.forEach(row=>{
    let item=db.prepare('SELECT * FROM companies WHERE name=?').get(row[0]);
    if(!item){const id=insertCompany.run(...row,'بيانات تجريبية مترابطة',adminId).lastInsertRowid;item=db.prepare('SELECT * FROM companies WHERE id=?').get(id)}
    companies.push(item);
  });

  const branchRows=[
    [companies[0],'المقر الرئيسي','NILE-HQ','القاهرة الجديدة'],[companies[0],'فرع أكتوبر','NILE-OCT','السادس من أكتوبر'],
    [companies[1],'فرع الرياض','HOR-RUH','الرياض'],[companies[1],'فرع جدة','HOR-JED','جدة'],
    [companies[2],'فرع الجيزة','GW-GIZ','الجيزة'],
  ];
  const branches=[];
  branchRows.forEach(([company,name,code,address])=>{
    let row=db.prepare('SELECT * FROM company_branches WHERE company_id=? AND name=?').get(company.id,name);
    if(!row){const id=db.prepare(`INSERT INTO company_branches(company_id,name,code,address,manager,notes,active) VALUES(?,?,?,?,?,'بيانات تجريبية',1)`).run(company.id,name,code,address,company.contact_name).lastInsertRowid;row=db.prepare('SELECT * FROM company_branches WHERE id=?').get(id)}
    branches.push(row);
  });

  const clients=db.prepare("SELECT * FROM clients WHERE email LIKE '%@demo.sanad' ORDER BY id LIMIT 6").all();
  companies.forEach((company,i)=>{
    const client=clients[i%Math.max(1,clients.length)];
    if(client&&!db.prepare('SELECT 1 FROM company_contacts WHERE company_id=? AND client_id=?').get(company.id,client.id))
      db.prepare(`INSERT INTO company_contacts(company_id,branch_id,client_id,full_name,job_title,phone,email,notes) VALUES(?,?,?,?,?,?,?,'جهة اتصال تجريبية')`).run(company.id,branches.find(b=>b.company_id===company.id)?.id||null,client.id,client.full_name,'مسؤول معاملات',client.phone,client.email);
    const services=db.prepare('SELECT id FROM services WHERE active=1 ORDER BY id LIMIT 3').all();
    services.forEach(s=>db.prepare("INSERT OR IGNORE INTO company_services(company_id,service_id,notes) VALUES(?,?,'خدمة تجريبية مرتبطة')").run(company.id,s.id));
  });

  const demoRequests=db.prepare("SELECT * FROM requests WHERE email LIKE '%@demo.sanad' OR email IN ('hala@example.com','walid@example.com') ORDER BY id LIMIT 15").all();
  demoRequests.forEach((request,i)=>{
    const company=companies[i%companies.length],branch=branches.find(b=>b.company_id===company.id);
    db.prepare('UPDATE requests SET company_id=?,branch_id=? WHERE id=?').run(company.id,branch&&branch.id,request.id);
    if(request.service_id)db.prepare(`INSERT OR IGNORE INTO request_services(request_id,service_id,label,sort,added_by)
      VALUES(?,?,?,?,?)`).run(request.id,request.service_id,request.service_label||'الخدمة الأساسية',0,'بيانات تجريبية');
  });
  const extraServices=db.prepare('SELECT id,title_ar FROM services WHERE active=1 ORDER BY id LIMIT 5').all();
  demoRequests.slice(0,6).forEach((request,i)=>{
    const service=extraServices[(i+1)%Math.max(1,extraServices.length)];
    if(service&&service.id!==request.service_id)db.prepare(`INSERT OR IGNORE INTO request_services(request_id,service_id,label,sort,added_by)
      VALUES(?,?,?,?,?)`).run(request.id,service.id,service.title_ar,1,'بيانات تجريبية');
  });

  const staff=db.prepare("SELECT * FROM users WHERE active=1 AND role IN ('lawyer','supervisor','accountant') ORDER BY id LIMIT 8").all();
  const lawyer=staff.find(x=>x.role==='lawyer')||staff[0];
  staff.slice(0,6).forEach((user,i)=>db.prepare(`INSERT INTO performance_rules(user_id,target_percent,bonus_amount,deduction_per_overdue,notes,updated_by)
    VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET target_percent=excluded.target_percent,bonus_amount=excluded.bonus_amount,
    deduction_per_overdue=excluded.deduction_per_overdue,notes=excluded.notes,updated_by=excluded.updated_by,updated_at=datetime('now')`)
    .run(user.id,88+i,400+i*100,75+i*25,'قاعدة تقييم تجريبية',adminId));

  demoRequests.slice(0,8).forEach((request,i)=>{
    const assigned=db.prepare('SELECT user_id FROM request_assignees WHERE request_id=? ORDER BY user_id LIMIT 2').all(request.id);
    assigned.forEach((row,j)=>db.prepare(`INSERT INTO request_assignee_shares(request_id,user_id,contribution_percent)
      VALUES(?,?,?) ON CONFLICT(request_id,user_id) DO UPDATE SET contribution_percent=excluded.contribution_percent`)
      .run(request.id,row.user_id,assigned.length===1?100:(j===0?60:40)));
  });

  const pauseRows=[
    [demoRequests[3],'انتظار مستندات العميل','تم إيقاف المدة لحين استلام أصل المستند.','pending'],
    [demoRequests[5],'جهة حكومية','تأخر الرد من الجهة وتم اعتماد الإيقاف.','approved'],
    [demoRequests[7],'طلب العميل','تمت إعادة تشغيل المدة بعد استكمال البيانات.','resumed'],
  ];
  pauseRows.forEach((row,i)=>{if(!row[0]||db.prepare("SELECT 1 FROM request_time_pauses WHERE request_id=? AND note LIKE '%تجريبي%'").get(row[0].id))return;
    db.prepare(`INSERT INTO request_time_pauses(request_id,reason,note,status,started_at,approved_at,approved_by,resumed_at,resumed_by,created_by)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(row[0].id,row[1],`${row[2]} — تجريبي`,row[3],stamp(-8+i*2),row[3]!=='pending'?stamp(-7+i*2):null,row[3]!=='pending'?adminId:null,row[3]==='resumed'?stamp(-2):null,row[3]==='resumed'?adminId:null,adminId);
  });
  const categories=db.prepare('SELECT * FROM case_categories WHERE active=1 ORDER BY sort LIMIT 3').all();
  demoRequests.slice(0,3).forEach((request,i)=>{
    if(db.prepare('SELECT 1 FROM legal_cases WHERE request_id=?').get(request.id))return;
    const fileNo=`CASE-DEMO-${String(i+1).padStart(4,'0')}`;
    const info=db.prepare(`INSERT INTO legal_cases(request_id,client_id,category_id,file_no,title,case_number,judicial_year,court,circuit,opposing_party,status,priority,opened_on,next_hearing,summary,client_summary,created_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(request.id,request.client_id,categories[i%categories.length]?.id||null,fileNo,`قضية تجريبية مرتبطة بـ ${request.ref}`,`DEMO/${2026}/${i+1}`,'2026','محكمة القاهرة الاقتصادية',`الدائرة ${i+1}`,'طرف خصم تجريبي',i===2?'judgment':'active',i===1?'urgent':'normal',iso(-40+i*7),iso(5+i*8),'ملخص داخلي تجريبي للقضية','القضية تحت المتابعة وسيظهر الموعد القادم هنا.',adminId);
    const caseId=Number(info.lastInsertRowid);
    if(lawyer)db.prepare('INSERT OR IGNORE INTO case_assignees(case_id,user_id,lead,assigned_by) VALUES(?,?,1,?)').run(caseId,lawyer.id,adminId);
    db.prepare(`INSERT INTO case_hearings(case_id,hearing_on,court,circuit,purpose,decision,next_hearing,status,client_visible,created_by) VALUES(?,?,?,?,?,?,?,?,1,?)`).run(caseId,iso(-7),'محكمة القاهرة الاقتصادية',`الدائرة ${i+1}`,'نظر المستندات','تأجيل للاطلاع',iso(5+i*8),'completed',adminId);
    db.prepare(`INSERT INTO case_tasks(case_id,title,details,due_on,assigned_user_id,status,priority,client_visible,created_by) VALUES(?,?,?,?,?,'pending',?,1,?)`).run(caseId,'إعداد مذكرة الجلسة','مراجعة المستندات وصياغة الدفوع',iso(3+i*5),lawyer&&lawyer.id,i===1?'urgent':'normal',adminId);
    db.prepare(`INSERT INTO case_events(case_id,event_type,title,details,event_on,client_visible,created_by,created_by_label) VALUES(?,'hearing','تمت إضافة جلسة تجريبية','قرار الجلسة محفوظ في الملف',?,1,?,?)`).run(caseId,stamp(-7),adminId,adminName);
    db.prepare(`INSERT INTO case_parties(case_id,party_type,name,capacity,phone,notes) VALUES(?,'opponent',?,'مدعى عليه','+20100000000','طرف تجريبي')`).run(caseId,`الخصم التجريبي ${i+1}`);
  });

  const cases=db.prepare("SELECT * FROM legal_cases WHERE file_no LIKE 'CASE-DEMO-%' ORDER BY id").all();
  const agendaRows=[
    ['اجتماع مراجعة ملف الشركة','meeting',2,3,'high','pending'],['جلسة قضية قادمة','deadline',5,5,'urgent','pending'],
    ['تجديد سجل تجاري','renewal',12,12,'normal','pending'],['متابعة دفعة عميل','payment',-2,-2,'high','completed'],
    ['تسليم مستندات للعميل','task',1,1,'normal','in_progress'],['اجتماع فريق العمل','meeting',-5,-5,'normal','completed'],
  ];
  agendaRows.forEach((row,i)=>{
    const existing=db.prepare('SELECT * FROM agenda_events WHERE title=?').get(`${row[0]} — تجريبي`);
    const request=demoRequests[i%demoRequests.length],company=companies[i%companies.length],assignee=staff[i%staff.length];
    if(existing){db.prepare('UPDATE agenda_events SET request_id=?,client_id=?,company_id=?,case_id=? WHERE id=?').run(request&&request.id,request&&request.client_id,company.id,cases[i%Math.max(1,cases.length)]?.id||null,existing.id);return}
    const info=db.prepare(`INSERT INTO agenda_events(title,event_type,starts_at,ends_at,priority,status,assigned_user_id,request_id,case_id,client_id,company_id,client_visible,location,notes,reminder_minutes,created_by,completed_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(`${row[0]} — تجريبي`,row[1],stamp(row[2],10+i),stamp(row[3],11+i),row[4],row[5],assignee&&assignee.id,request&&request.id,cases[i%Math.max(1,cases.length)]?.id||null,request&&request.client_id,company.id,1,i%2?'عن بُعد':'مقر المكتب','موعد تجريبي مرتبط بالطلب والشركة',60,adminId,row[5]==='completed'?stamp(row[3],12):null);
    if(assignee)db.prepare('INSERT OR IGNORE INTO agenda_assignees(agenda_event_id,user_id) VALUES(?,?)').run(info.lastInsertRowid,assignee.id);
  });

  const treasury=db.prepare('SELECT * FROM treasuries WHERE active=1 ORDER BY id LIMIT 1').get();
  if(treasury){
    const txRows=[
      ['in',180000,'bank','دفعة عميل شركة','تحصيل أتعاب ورسوم','DEMO-TREASURY-001'],
      ['in',65000,'cash','عميل فرد','دفعة مقدمة','DEMO-TREASURY-002'],
      ['in',42000,'instapay','عميل فرد','تحصيل طلب','DEMO-TREASURY-003'],
      ['out',12500,'bank','مورد خدمات','رسوم حكومية','DEMO-TREASURY-004'],
      ['out',4800,'cash','مصروفات تشغيل','انتقالات وطباعة','DEMO-TREASURY-005'],
    ];
    txRows.forEach((x,i)=>{if(!db.prepare('SELECT 1 FROM treasury_transactions WHERE reference=?').get(x[5]))db.prepare(`INSERT INTO treasury_transactions(treasury_id,direction,amount,transaction_date,transaction_time,method,source_name,purpose,reference,recorded_by_id,recorded_by,client_id,request_id,notes,approval_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'approved')`).run(treasury.id,x[0],x[1],iso(-12+i*2),'10:30',x[2],x[3],x[4],x[5],adminId,adminName,clients[i%Math.max(1,clients.length)]?.id||null,demoRequests[i%demoRequests.length]?.id||null,'حركة خزنة تجريبية');});
    staff.filter(x=>x.role==='lawyer').slice(0,2).forEach((user,i)=>{
      const reference=`DEMO-CUST-${i+1}`;let custody=db.prepare('SELECT * FROM staff_custodies WHERE reference=?').get(reference);
      if(!custody){const id=db.prepare(`INSERT INTO staff_custodies(user_id,amount,issued_on,purpose,reference,issued_by_id,issued_by,treasury_id,custody_type) VALUES(?,?,?,?,?,?,?,?,?)`).run(user.id,3000+i*1500,iso(-10+i),'مصاريف انتقالات وجهات',reference,adminId,adminName,treasury.id,'operational').lastInsertRowid;custody=db.prepare('SELECT * FROM staff_custodies WHERE id=?').get(id);db.prepare(`INSERT INTO treasury_transactions(treasury_id,direction,amount,transaction_date,method,source_name,purpose,reference,custody_id,recorded_by_id,recorded_by,approval_status) VALUES(?,'out',?,?,?,?,?,?,?,?,?,'approved')`).run(treasury.id,custody.amount,custody.issued_on,'cash',user.display_name,'صرف عهدة',reference,custody.id,adminId,adminName)}
      if(i===0&&!db.prepare('SELECT 1 FROM custody_returns WHERE custody_id=?').get(custody.id))db.prepare('INSERT INTO custody_returns(custody_id,amount,returned_on,note,received_by_id,received_by) VALUES(?,?,?,?,?,?)').run(custody.id,500,iso(-2),'رد باقي العهدة',adminId,adminName);
    });
  }

  const payrollStaff=staff.slice(0,6),period=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()-1,1)).toISOString().slice(0,7);
  payrollStaff.forEach((user,i)=>db.prepare(`INSERT INTO salary_profiles(user_id,basic_salary,housing_allowance,transport_allowance,fixed_allowance,insurance_default,tax_default,bank_name,iban,payment_method,notes,updated_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET basic_salary=excluded.basic_salary,housing_allowance=excluded.housing_allowance,transport_allowance=excluded.transport_allowance,fixed_allowance=excluded.fixed_allowance,insurance_default=excluded.insurance_default,tax_default=excluded.tax_default,notes=excluded.notes,updated_at=datetime('now')`).run(user.id,9000+i*750,1500,750,500,600,350,'بنك تجريبي',`EG-DEMO-${String(i+1).padStart(4,'0')}`,i%3===0?'cash':'bank','تعريف راتب تجريبي',adminId));
  let run=db.prepare('SELECT * FROM payroll_runs WHERE period=?').get(period);
  if(!run){const id=db.prepare(`INSERT INTO payroll_runs(period,title,status,notes,created_by,created_by_label,approved_by,approved_by_label,approved_at) VALUES(?,?,'approved','سند صرف مرتب تجريبي للتحقق من الربط',?,?,?,?,datetime('now'))`).run(period,`سند صرف مرتب تجريبي ${period}`,adminId,adminName,adminId,adminName).lastInsertRowid;run=db.prepare('SELECT * FROM payroll_runs WHERE id=?').get(id)}
  payrollStaff.forEach((user,i)=>{if(db.prepare('SELECT 1 FROM payroll_items WHERE payroll_run_id=? AND user_id=?').get(run.id,user.id))return;const basic=9000+i*750,housing=1500,transport=750,fixed=500,bonus=i%2?500:0,deductions=950,gross=basic+housing+transport+fixed+bonus;db.prepare(`INSERT INTO payroll_items(payroll_run_id,user_id,employee_name,job_title,national_id,basic_salary,housing_allowance,transport_allowance,fixed_allowance,performance_bonus,insurance_deduction,tax_deduction,gross_amount,total_deductions,net_amount,status,treasury_id,payment_method,payment_reference,paid_at,paid_by,paid_by_label)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'approved',?,?,?,?,?,?)`).run(run.id,user.id,user.legal_name||user.display_name,user.job_title,user.national_id,basic,housing,transport,fixed,bonus,600,350,gross,deductions,gross-deductions,treasury&&treasury.id,i%3===0?'cash':'bank',`DEMO-PAY-${i+1}`,null,null,null)});

  const from=`${period}-01`,to=new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5,7)),0)).toISOString().slice(0,10);
  payrollStaff.slice(0,4).forEach((user,i)=>db.prepare(`INSERT INTO performance_reviews(user_id,period_from,period_to,assigned_count,completed_count,on_time_count,late_count,overdue_count,score,electronic_score,administrative_score,recommended_bonus,recommended_deduction,approved_bonus,approved_deduction,decision,notes,reviewed_by,reviewed_by_label)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,period_from,period_to) DO UPDATE SET assigned_count=excluded.assigned_count,completed_count=excluded.completed_count,on_time_count=excluded.on_time_count,late_count=excluded.late_count,overdue_count=excluded.overdue_count,score=excluded.score,electronic_score=excluded.electronic_score,administrative_score=excluded.administrative_score,recommended_bonus=excluded.recommended_bonus,recommended_deduction=excluded.recommended_deduction,approved_bonus=excluded.approved_bonus,approved_deduction=excluded.approved_deduction,decision=excluded.decision,notes=excluded.notes`).run(user.id,from,to,12+i,10+i,8,2,1,86+i*2,84+i*2,18,500,0,500,0,'approved','تقييم أداء تجريبي',adminId,adminName));

  const ticketRows=[['SUP-DEMO-0001','استفسار عن متابعة طلب','high','in_progress'],['SUP-DEMO-0002','مشكلة في رفع مستند','medium','new'],['SUP-DEMO-0003','طلب تعديل بيانات شركة','low','resolved']];
  ticketRows.forEach((x,i)=>{if(db.prepare('SELECT 1 FROM support_tickets WHERE ref=?').get(x[0]))return;const request=demoRequests[i%demoRequests.length],client=clients[i%Math.max(1,clients.length)],company=companies[i%companies.length],branch=branches.find(b=>b.company_id===company.id);const id=Number(db.prepare(`INSERT INTO support_tickets(ref,opened_by_type,opened_by_client_id,requester_name,requester_email,requester_phone,client_id,company_id,branch_id,request_id,issue_type,title,description,priority,status,due_at,first_response_at,resolved_at,rating,rating_note) VALUES(?,'client',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(x[0],client&&client.id,client?.full_name||'عميل تجريبي',client?.email||'demo@sanad.test',client?.phone||'+201000000000',client&&client.id,company.id,branch&&branch.id,request&&request.id,'دعم تشغيلي',x[1],'وصف تذكرة دعم تجريبية لاختبار دورة المعالجة.',x[2],x[3],stamp(2),i!==1?stamp(-1):null,x[3]==='resolved'?stamp(0):null,x[3]==='resolved'?5:null,x[3]==='resolved'?'تم الحل بسرعة':null).lastInsertRowid);if(lawyer)db.prepare('INSERT OR IGNORE INTO support_ticket_assignees(ticket_id,user_id) VALUES(?,?)').run(id,lawyer.id);db.prepare(`INSERT INTO support_ticket_messages(ticket_id,author_type,author_id,author_name,body,internal) VALUES(?,?,?,?,?,0)`).run(id,'client',client&&client.id,client?.full_name||'عميل تجريبي','هذه رسالة تجريبية من العميل مرتبطة بالتذكرة.');db.prepare(`INSERT INTO support_ticket_messages(ticket_id,author_type,author_id,author_name,body,internal) VALUES(?,?,?,?,?,0)`).run(id,'staff',lawyer&&lawyer.id,lawyer?.display_name||adminName,'تم استلام التذكرة وجارٍ متابعتها.');db.prepare(`INSERT INTO support_ticket_events(ticket_id,action,details,actor_id,actor_name) VALUES(?,?,?,?,?)`).run(id,'created','تم فتح التذكرة التجريبية',client&&client.id,client?.full_name||'عميل تجريبي');db.prepare(`INSERT INTO support_ticket_events(ticket_id,action,details,actor_id,actor_name) VALUES(?,?,?,?,?)`).run(id,x[3]==='resolved'?'resolved':'assigned','تم تحديث حالة التذكرة وإسنادها',lawyer&&lawyer.id,lawyer?.display_name||adminName);});

  let reportProfile=db.prepare("SELECT * FROM report_profiles WHERE name='هوية سند التجريبية'").get();
  if(!reportProfile){const id=db.prepare(`INSERT INTO report_profiles(name,company_name_ar,company_name_en,legal_name,registration_no,tax_no,address,phone,email,website,header_text,intro_text,footer_text,signatory_name,signatory_title,watermark_text,is_default,active,created_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1,?)`).run('هوية سند التجريبية','مكتب سند للخدمات القانونية','Sanad Legal Services','شركة سند للخدمات القانونية','CR-DEMO-SANAD','TAX-DEMO-SANAD','القاهرة — عنوان تجريبي','+201001234567','reports@demo.sanad','https://example.test','تقرير صادر من منصة سند','بيانات تجريبية للتحقق من شكل التقرير وربطه بالسجلات.','هذا التقرير للتجربة فقط.','محمد صالح','مدير المكتب','نسخة تجريبية',adminId).lastInsertRowid;reportProfile=db.prepare('SELECT * FROM report_profiles WHERE id=?').get(id)}
  if(!db.prepare("SELECT 1 FROM report_exports WHERE profile_id=? AND filters_json LIKE '%demo_seed%'").get(reportProfile.id)){
    [['requests','request',demoRequests[0]?.id,'pdf',1],['clients','client',clients[0]?.id,'xlsx',0],['treasury','treasury',treasury?.id,'csv',1]].forEach(x=>db.prepare(`INSERT INTO report_exports(report_type,entity_type,entity_id,profile_id,profile_name,format,filters_json,include_money,language,exported_by,exported_by_name)
      VALUES(?,?,?,?,?,?,?,?,'ar',?,?)`).run(x[0],x[1],x[2]||null,reportProfile.id,reportProfile.name,x[3],JSON.stringify({demo_seed:true,period:'month'}),x[4],adminId,adminName));
  }

  const importSamples=[
    ['DEMO-IMPORT-CLIENTS','clients','عملاء-تجريبي.xlsx',8,8,0,'imported'],
    ['DEMO-IMPORT-REQUESTS','requests','طلبات-تجريبية.xlsx',12,10,2,'review'],
    ['DEMO-IMPORT-COMPANIES','companies','شركات-تجريبية.xlsx',3,3,0,'imported'],
  ];
  importSamples.forEach(x=>db.prepare(`INSERT OR IGNORE INTO data_import_batches(token,entity,file_name,total_rows,valid_rows,error_rows,payload_json,errors_json,result_json,status,created_by,imported_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(x[0],x[1],x[2],x[3],x[4],x[5],JSON.stringify([{demo:true}]),x[5]?JSON.stringify([{row:3,message:'قيمة تجريبية غير مطابقة'}]):'[]',x[6]==='imported'?JSON.stringify({inserted:x[4],updated:0}):null,x[6],adminId,x[6]==='imported'?stamp(-2):null));

  const mailSamples=[
    ['request_received','client@demo.sanad','تم استلام طلبك التجريبي','sent',demoRequests[0]?.id],
    ['payment_received','sara@demo.sanad','تأكيد استلام دفعة تجريبية','sent',demoRequests[1]?.id],
    ['deadline_reminder','john@demo.sanad','تذكير بموعد الطلب','outbox',demoRequests[2]?.id],
  ];
  mailSamples.forEach(x=>{if(!db.prepare("SELECT 1 FROM mail_log WHERE provider='demo' AND template=? AND to_email=?").get(x[0],x[1]))db.prepare(`INSERT INTO mail_log(template,to_email,subject,lang,request_id,provider,status,attempts,sent_at)
    VALUES(?,?,?,'ar',?,'demo',?,1,?)`).run(x[0],x[1],x[2],x[4]||null,x[3],x[3]==='sent'?stamp(-1):null)});

  const defaultPage=db.prepare('SELECT id FROM pages WHERE is_default=1 ORDER BY id LIMIT 1').get()
    || db.prepare('SELECT id FROM pages ORDER BY id LIMIT 1').get();
  let consultationCat=db.prepare("SELECT id,page_id FROM categories WHERE name_ar='الاستشارات'").get();
  if(!consultationCat){consultationCat={id:Number(db.prepare("INSERT INTO categories(page_id,sort,name_ar,name_en,desc_ar,desc_en) VALUES(?,999,'الاستشارات','Consultations','استشارات قانونية','Legal consultations')").run(defaultPage&&defaultPage.id).lastInsertRowid)}}
  else if(!consultationCat.page_id&&defaultPage)db.prepare('UPDATE categories SET page_id=? WHERE id=?').run(defaultPage.id,consultationCat.id);
  [['استشارة قانونية مكتوبة','Written legal consultation'],['استشارة فيديو','Video consultation'],['استشارة عاجلة','Urgent consultation'],['رأي قانوني رسمي','Formal legal opinion']].forEach((x,i)=>{if(!db.prepare('SELECT 1 FROM services WHERE title_ar=?').get(x[0]))db.prepare(`INSERT INTO services(category_id,sort,title_ar,title_en,body_ar,body_en,is_consultation,active) VALUES(?,?,?,?,?,?,1,1)`).run(consultationCat.id,i+1,x[0],x[1],'خدمة استشارية تجريبية قابلة للطلب والمتابعة.','Demo consultation service.')});

  return {
    companies: companies.length, branches: branches.length, cases: cases.length,
    agenda: db.prepare("SELECT COUNT(*) c FROM agenda_events WHERE title LIKE '%— تجريبي'").get().c,
    treasury: db.prepare("SELECT COUNT(*) c FROM treasury_transactions WHERE reference LIKE 'DEMO-%'").get().c,
    payroll: db.prepare('SELECT COUNT(*) c FROM payroll_items WHERE payroll_run_id=?').get(run.id).c,
    support: db.prepare("SELECT COUNT(*) c FROM support_tickets WHERE ref LIKE 'SUP-DEMO-%'").get().c,
  };
}

function clearCompleteDemo(db) {
  db.prepare("DELETE FROM data_import_batches WHERE token LIKE 'DEMO-IMPORT-%'").run();
  db.prepare("DELETE FROM mail_log WHERE provider='demo'").run();
  db.prepare("DELETE FROM report_exports WHERE filters_json LIKE '%demo_seed%'").run();
  db.prepare("DELETE FROM report_profiles WHERE name='هوية سند التجريبية'").run();
  db.prepare("DELETE FROM support_tickets WHERE ref LIKE 'SUP-DEMO-%'").run();
  db.prepare("DELETE FROM agenda_events WHERE title LIKE '%— تجريبي'").run();
  db.prepare("DELETE FROM legal_cases WHERE file_no LIKE 'CASE-DEMO-%'").run();
  db.prepare("DELETE FROM treasury_transactions WHERE reference LIKE 'DEMO-%'").run();
  db.prepare("DELETE FROM custody_returns WHERE custody_id IN (SELECT id FROM staff_custodies WHERE reference LIKE 'DEMO-CUST-%')").run();
  db.prepare("DELETE FROM staff_custodies WHERE reference LIKE 'DEMO-CUST-%'").run();
  db.prepare("DELETE FROM payroll_runs WHERE title LIKE 'سند صرف مرتب تجريبي%'").run();
  db.prepare("DELETE FROM performance_reviews WHERE notes='تقييم أداء تجريبي'").run();
  db.prepare("DELETE FROM salary_profiles WHERE notes='تعريف راتب تجريبي'").run();
}

module.exports={seedCompleteDemo,clearCompleteDemo};
