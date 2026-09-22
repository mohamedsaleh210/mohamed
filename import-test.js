#!/usr/bin/env node
const fs=require('fs');
const os=require('os');
const path=require('path');
const ExcelJS=require('exceljs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sanad-import-test-'));
process.env.DATA_DIR=temp;
const {migrate}=require('./db/migrate');
migrate({quiet:true});
require('./db/seed')();
const {db}=require('./db');
const imports=require('./lib/data-import');
const admin=db.prepare("SELECT * FROM users WHERE role='admin' ORDER BY id LIMIT 1").get();
const companyId=Number(db.prepare("INSERT INTO companies(name,active,created_by) VALUES('شركة اختبار القوائم',1,?)").run(admin.id).lastInsertRowid);
db.prepare("INSERT INTO company_branches(company_id,name,active) VALUES(?,'الفرع الرئيسي',1)").run(companyId);
db.prepare("INSERT INTO clients(email,full_name,phone) VALUES('linked@example.com','عميل مرتبط','0501111111')").run();
db.prepare("INSERT INTO requests(ref,name,phone,email,status,upload_token) VALUES('SND-26-TEST1','عميل مرتبط','0501111111','linked@example.com','new','token')").run();
let passed=0;
const check=(name,value)=>{if(!value)throw new Error(name);passed++;console.log(`  ✓ ${name}`)};

async function workbook(entity,rows){
  const source=await imports.templateBuffer(entity);const wb=new ExcelJS.Workbook();await wb.xlsx.load(source);const ws=wb.getWorksheet('البيانات');
  const def=imports.DEFINITIONS[entity];rows.forEach(row=>ws.addRow(def.fields.map(f=>row[f[0]]??'')));return wb.xlsx.writeBuffer();
}

(async()=>{
  try{
    for(const entity of Object.keys(imports.DEFINITIONS)){
      const out=await imports.templateBuffer(entity);const wb=new ExcelJS.Workbook();await wb.xlsx.load(out);
      check(`نموذج ${entity} سليم`,!!wb.getWorksheet('البيانات')&&!!wb.getWorksheet('التعليمات'));
    }
    const requestTemplate=new ExcelJS.Workbook();await requestTemplate.xlsx.load(await imports.templateBuffer('requests'));
    const requestSheet=requestTemplate.getWorksheet('البيانات'),listSheet=requestTemplate.getWorksheet('قوائم النظام');
    const requestFields=imports.DEFINITIONS.requests.fields;
    const col=key=>requestFields.findIndex(f=>f[0]===key)+1;
    check('ورقة القوائم مخفية عن المستخدم',listSheet&&listSheet.state==='veryHidden');
    check('الخدمة قائمة منسدلة من النظام',requestSheet.getCell(2,col('service')).dataValidation.type==='list'&&String(requestSheet.getCell(2,col('service')).dataValidation.formulae[0]).includes('list_requests_service'));
    check('الشركة قائمة منسدلة من النظام',requestSheet.getCell(2,col('company')).dataValidation.type==='list');
    check('الفرع قائمة منسدلة من النظام',requestSheet.getCell(2,col('branch')).dataValidation.type==='list');
    check('الموظف قائمة منسدلة من النظام',requestSheet.getCell(2,col('assignees')).dataValidation.type==='list');
    check('مرجع الطلب مميز كحقل يولده النظام',requestSheet.getColumn(col('ref')).fill?.fgColor?.argb==='FFE9ECEC');
    check('الخانات المتغيرة قابلة للكتابة',!requestSheet.protection?.sheet);
    const clientFile=await workbook('clients',[{full_name:'عميل اختبار',email:{text:'import@example.com\u200B',hyperlink:'mailto:import@example.com'},phone:'0500000000',lang:'العربية'}]);
    const clientRows=await imports.parseWorkbook(clientFile,'clients');check('فحص العميل الصحيح',clientRows.length===1&&clientRows[0].errors.length===0);
    const officeBranch=db.prepare('SELECT id FROM office_branches WHERE is_main=1').get();
    const token=imports.saveBatch(admin.id,'clients','clients.xlsx',clientRows,officeBranch.id);const batch=imports.loadBatch(token,admin.id);
    const req={user:admin,session:{user:admin}};const result=imports.commitBatch(batch,req);
    check('حفظ العميل بعد الاعتماد فقط',result.ok&&!!db.prepare("SELECT 1 FROM clients WHERE email='import@example.com'").get());
    const duplicateRows=await imports.parseWorkbook(await workbook('clients',[{full_name:'أ',email:'same@example.com'},{full_name:'ب',email:'same@example.com'}]),'clients');
    check('كشف التكرار داخل الملف',duplicateRows[1].errors.some(x=>x.includes('مكرر داخل الملف')));
    const invalidRows=await imports.parseWorkbook(await workbook('employees',[{username:'اسم عربي',display_name:'موظف',role:'محامي'}]),'employees');
    check('كشف اسم مستخدم غير صالح',invalidRows[0].errors.length>0);
    const service=db.prepare('SELECT title_ar FROM services WHERE active=1 ORDER BY id LIMIT 1').get();
    const requestRows=await imports.parseWorkbook(await workbook('requests',[{ref:'SND-USER-999',name:'عميل استيراد طلب',phone:'0502222222',service:service.title_ar,status:'جديد',company:'شركة اختبار القوائم',branch:'الفرع الرئيسي',assignees:admin.display_name,total_amount:2500,paid_amount:500}]),'requests');
    check('اختيارات القوائم ترتبط ببيانات النظام',requestRows[0].errors.length===0&&requestRows[0].data.company_id===companyId&&requestRows[0].data.assignee_ids.includes(admin.id));
    check('يتجاهل رقم الطلب المكتوب ويترك الترقيم للنظام',requestRows[0].data.ref==='');
    const requestToken=imports.saveBatch(admin.id,'requests','requests.xlsx',requestRows,officeBranch.id),requestResult=imports.commitBatch(imports.loadBatch(requestToken,admin.id),req);
    check('رقم الطلب يولد تلقائياً بنفس نظام الموقع',requestResult.ok&&/^SND-\d{2}-[A-Z0-9]{5,}$/.test(requestResult.result.refs[0]));

    // --------------------------------------------------------------------
    // RC1.1 P2-01: partial import success — valid rows must commit even
    // when other rows in the same batch are invalid, and every rejected row
    // must be reported back (row number + reason), never silently dropped.
    // --------------------------------------------------------------------

    // A. 100% valid file: imported === total, rejected === 0.
    const allValidRows=await imports.parseWorkbook(await workbook('clients',[
      {full_name:'صافي الأولى',email:'rc11-allvalid-1@example.com'},
      {full_name:'صافي الثانية',email:'rc11-allvalid-2@example.com'},
    ]),'clients');
    const allValidToken=imports.saveBatch(admin.id,'clients','all-valid.xlsx',allValidRows,officeBranch.id);
    const allValidOutcome=imports.commitBatch(imports.loadBatch(allValidToken,admin.id),req);
    check('أ. ملف صحيح بالكامل: يستورد كل الصفوف',allValidOutcome.ok&&allValidOutcome.result.total===2&&allValidOutcome.result.imported===2&&allValidOutcome.result.rejected===0);

    // Seed one existing client so a later row can collide with the database
    // (test D), distinct from an in-file collision (test C).
    db.prepare("INSERT INTO clients(email,full_name,phone) VALUES('rc11-existing@example.com','عميل موجود مسبقًا',null)").run();

    // B/C/D/E/F/H combined into one mixed batch on purpose — this is exactly
    // the real-world shape the defect was found with: some rows valid, some
    // invalid for different independent reasons, one in-file duplicate, one
    // database duplicate, one row with two simultaneous errors.
    const mixedInput=[
      {full_name:'صف صحيح واحد',email:'rc11-mixed-valid@example.com'},                       // valid
      {full_name:'',email:'rc11-mixed-missing-name@example.com'},                             // E. missing required field
      {full_name:'صف بريد فاسد',email:'not-an-email'},                                        // F. malformed value
      {full_name:'مكرر بالملف أ',email:'rc11-mixed-dupe@example.com'},                        // C. duplicate-in-file (first copy — this one is the one that stays valid)
      {full_name:'مكرر بالملف ب',email:'rc11-mixed-dupe@example.com'},                        // C. duplicate-in-file (second copy — this one is rejected)
      {full_name:'موجود بقاعدة البيانات',email:'rc11-existing@example.com'},                  // D. duplicate-against-database
      {full_name:'',email:'also-not-an-email'},                                               // H. two independent errors on the same row
    ];
    const mixedRows=await imports.parseWorkbook(await workbook('clients',mixedInput),'clients');
    const mixedToken=imports.saveBatch(admin.id,'clients','mixed.xlsx',mixedRows,officeBranch.id);
    const mixedOutcome=imports.commitBatch(imports.loadBatch(mixedToken,admin.id),req);
    const mr=mixedOutcome.result;
    check('ب. الاستيراد المختلط: العدد الكلي صحيح',mr.total===7);
    check('ب. الاستيراد المختلط: يستورد الصفوف الصحيحة فقط (2)',mr.imported===2);
    check('ب. الاستيراد المختلط: يرفض باقي الصفوف (5) دون فقد أي صف بصمت',mr.rejected===5&&mr.rejectedRows.length===5);
    check('صف صحيح واحد محفوظ فعليًا',!!db.prepare("SELECT 1 FROM clients WHERE email='rc11-mixed-valid@example.com'").get());
    check('أول نسخة من التكرار داخل الملف محفوظة (السطر الأول يفوز)',!!db.prepare("SELECT 1 FROM clients WHERE full_name='مكرر بالملف أ'").get());
    check('النسخة الثانية من التكرار داخل الملف لم تُحفظ',!db.prepare("SELECT 1 FROM clients WHERE full_name='مكرر بالملف ب'").get());
    check('الصف الذي يخصّ عميلًا موجودًا لم يُضَف كعميل ثانٍ',db.prepare("SELECT COUNT(*) n FROM clients WHERE email='rc11-existing@example.com'").get().n===1);
    check('E. رسالة الحقل المطلوب المفقود واضحة في نتيجة الرفض',mr.rejectedRows.some(rr=>rr.errors.some(e=>e.includes('الاسم الكامل مطلوب'))));
    check('F. رسالة صيغة البريد الفاسدة واضحة في نتيجة الرفض',mr.rejectedRows.some(rr=>rr.errors.some(e=>e.includes('صيغة غير صحيحة'))));
    check('C. رسالة التكرار داخل الملف واضحة في نتيجة الرفض',mr.rejectedRows.some(rr=>rr.errors.some(e=>e.includes('مكرر داخل الملف'))));
    check('D. رسالة التكرار في قاعدة البيانات واضحة في نتيجة الرفض',mr.rejectedRows.some(rr=>rr.errors.some(e=>e.includes('موجود مسبقًا في النظام'))));
    check('H. صف واحد يحمل أكثر من سبب رفض مستقل في نفس الوقت',mr.rejectedRows.some(rr=>rr.errors.length>=2));
    check('كل صف مرفوض يذكر رقم صفه الأصلي في ملف Excel',mr.rejectedRows.every(rr=>Number.isInteger(rr.rowNumber)&&rr.rowNumber>=2));
    check('عدد النتيجة يطابق عدد سجلات العملاء الجدد المضافة فعليًا',db.prepare("SELECT COUNT(*) n FROM clients WHERE email LIKE 'rc11-mixed-%'").get().n===mr.imported);
    check('لا يمكن اعتماد نفس الدفعة مرتين (لا يستورد الصفوف الصحيحة مرتين)',(()=>{try{imports.commitBatch(imports.loadBatch(mixedToken,admin.id),req);return false}catch(e){return e.message.includes('تم تنفيذ عملية الاستيراد من قبل')}})());

    // G. zero valid rows: every row rejected, nothing written, still a clean
    // result rather than a crash or a silent no-op with no explanation.
    const zeroValidRows=await imports.parseWorkbook(await workbook('clients',[
      {full_name:'',email:'bad-1'},
      {full_name:'',email:'bad-2'},
    ]),'clients');
    const zeroValidToken=imports.saveBatch(admin.id,'clients','zero-valid.xlsx',zeroValidRows,officeBranch.id);
    const zeroValidOutcome=imports.commitBatch(imports.loadBatch(zeroValidToken,admin.id),req);
    check('G. صفر صفوف صحيحة: النتيجة صريحة (0 مستورد، الكل مرفوض) دون خطأ',zeroValidOutcome.ok&&zeroValidOutcome.result.imported===0&&zeroValidOutcome.result.rejected===2&&zeroValidOutcome.result.rejectedRows.length===2);
    check('G. لا يُحفظ أي سجل عند صفر صفوف صحيحة',!db.prepare("SELECT 1 FROM clients WHERE email IN ('bad-1','bad-2')").get());

    console.log(`\nData import tests passed: ${passed}.`);
  }finally{try{db.close()}catch(_){}fs.rmSync(temp,{recursive:true,force:true})}
})().catch(err=>{console.error(err);process.exitCode=1});
