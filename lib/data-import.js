const crypto = require('crypto');
const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const refLib = require('./ref');
const casesLib = require('./cases');
const password = require('./password');
const tenantPolicy = require('./tenant-policy');
const excelCell = require('./excel-cell');

const MAX_ROWS = 2000;
const yesNo = ['نعم', 'لا'];
const SYSTEM_FIELDS = {
  requests: new Set(['ref']),
  cases: new Set(['file_no']),
};

const DEFINITIONS = {
  requests: {
    label: 'الطلبات', icon: '▤', note: 'العميل والخدمة والشركة والفرع والمسؤولون والحالة والمواعيد.',
    fields: [
      ['ref','مرجع الطلب',false,'اتركه فارغًا ليولده النظام'],['name','اسم العميل',true],['phone','رقم الموبايل',true],
      ['email','البريد الإلكتروني'],['service','الخدمة'],['title','عنوان الطلب'],['message','تفاصيل الطلب'],
      ['status','الحالة',false,'جديد، قيد المراجعة، جاري التنفيذ، بانتظار مستندات، بانتظار الدفع، مكتمل، ملغى'],
      ['company','الشركة'],['branch','الفرع',false,'يلزم كتابة الشركة عند تحديد الفرع'],
      ['assignees','المسؤولون',false,'أسماء المستخدمين مفصولة بفاصلة'],['deadline','موعد التسليم'],
      ['issued_on','تاريخ الإصدار'],['expires_on','تاريخ الانتهاء'],['renewal_on','تاريخ التجديد'],
      ['total_amount','الإجمالي'],['paid_amount','المدفوع']
    ]
  },
  cases: {
    label: 'القضايا', icon: '▣', note: 'تنشأ القضية على طلب قائم باستخدام مرجع الطلب.',
    fields: [
      ['request_ref','مرجع الطلب',true],['file_no','رقم الملف',false,'اتركه فارغًا ليولده النظام'],
      ['title','عنوان القضية',true],['category','التصنيف'],['case_number','رقم القضية'],['judicial_year','السنة القضائية'],
      ['court','المحكمة'],['circuit','الدائرة'],['opposing_party','الخصم'],['status','الحالة'],['priority','الأولوية'],
      ['opened_on','تاريخ الفتح'],['next_hearing','الجلسة القادمة'],['summary','الملخص'],['client_summary','ملخص العميل'],
      ['assignees','فريق القضية',false,'أسماء المستخدمين مفصولة بفاصلة']
    ]
  },
  agenda: {
    label: 'أجندة الأعمال', icon: '□', note: 'المهام والمواعيد مع ربط اختياري بطلب أو عميل أو شركة.',
    fields: [
      ['title','عنوان العمل',true],['event_type','النوع',true,'مهمة، اجتماع، موعد تسليم، تجديد، دفعة'],
      ['starts_at','البداية',true,'YYYY-MM-DD HH:MM'],['ends_at','النهاية'],['priority','الأولوية'],['status','الحالة'],
      ['assignees','المسؤولون',false,'أسماء المستخدمين مفصولة بفاصلة'],['request_ref','مرجع الطلب'],
      ['client_email','بريد العميل'],['company','الشركة'],['client_visible','يظهر للعميل'],['location','الموقع'],
      ['notes','ملاحظات'],['reminder_minutes','التذكير بالدقائق']
    ]
  },
  clients: {
    label: 'العملاء', icon: '♙', note: 'سجل العميل الأساسي. البريد الإلكتروني لا يتكرر.',
    fields: [
      ['full_name','الاسم الكامل',true],['email','البريد الإلكتروني',true],['phone','رقم الموبايل'],
      ['relation','الصفة',false,'نفسه، ولي، وكيل، قريب، أخرى'],['beneficiary_name','اسم المستفيد'],['lang','اللغة',false,'العربية أو الإنجليزية']
    ]
  },
  companies: {
    label: 'الشركات', icon: '▦', note: 'بيانات المنشآت الأساسية. استورد الشركات قبل فروعها.',
    fields: [
      ['name','اسم الشركة',true],['legal_name','الاسم القانوني'],['registration_no','رقم السجل'],['tax_no','الرقم الضريبي'],
      ['phone','رقم الموبايل'],['email','البريد الإلكتروني'],['address','العنوان'],['contact_name','مسؤول التواصل'],['notes','ملاحظات'],['active','نشطة']
    ]
  },
  branches: {
    label: 'فروع الشركات', icon: '⌖', note: 'كل فرع يرتبط باسم شركة موجودة بالنظام.',
    fields: [
      ['company','اسم الشركة',true],['name','اسم الفرع',true],['code','كود الفرع'],['phone','رقم الموبايل'],['email','البريد الإلكتروني'],
      ['address','العنوان'],['manager','مدير الفرع'],['notes','ملاحظات'],['active','نشط']
    ]
  },
  employees: {
    label: 'الموظفون', icon: '♙', note: 'ينشئ النظام كلمة مرور مؤقتة آمنة ويعرضها مرة واحدة بعد الحفظ.',
    fields: [
      ['username','اسم المستخدم',true,'حروف إنجليزية وأرقام و . _ - فقط'],['display_name','اسم العرض',true],['legal_name','الاسم الرسمي'],
      ['role','الدور',true,'أدمن، مشرف، محامي، محاسب'],['job_title','المسمى الوظيفي'],['email','البريد الإلكتروني'],
      ['phone','رقم الموبايل'],['national_id','الرقم القومي'],['birth_date','تاريخ الميلاد'],['active','نشط']
    ]
  }
};

const MAPS = {
  requestStatus: {'جديد':'new','قيد المراجعة':'reviewing','جاري التنفيذ':'in_progress','جارٍ التنفيذ':'in_progress','بانتظار مستندات':'awaiting_docs','بانتظار مستندات من العميل':'awaiting_docs','بانتظار الدفع':'awaiting_payment','مكتمل':'completed','ملغى':'cancelled'},
  caseStatus: {'تجهيز الملف':'preparation','مقيدة':'filed','متداولة':'active','صدر حكم':'judgment','تنفيذ':'enforcement','موقوفة':'suspended','مغلقة':'closed'},
  priority: {'عادية':'normal','مرتفعة':'high','عاجلة':'urgent'},
  agendaType: {'مهمة':'task','اجتماع':'meeting','موعد تسليم':'deadline','تجديد':'renewal','دفعة':'payment'},
  agendaStatus: {'لم يبدأ':'pending','جاري':'in_progress','انتظار':'waiting','مكتمل':'completed','ملغي':'cancelled','ملغى':'cancelled'},
  role: {'أدمن':'admin','مشرف':'supervisor','محامي':'lawyer','محاسب':'accountant'},
  relation: {'نفسه':'self','ولي':'guardian','وكيل':'agent','قريب':'relative','أخرى':'other'},
  lang: {'العربية':'ar','عربي':'ar','الإنجليزية':'en','إنجليزي':'en'}
};

function plain(value) {
  return excelCell.text(value);
}

const norm = v => plain(v).replace(/\s+/g, ' ').toLowerCase();
const asDate = v => {
  const s = plain(v).replace('T',' ');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) return s.slice(0,16);
  return null;
};
const asNumber = v => {
  if (plain(v) === '') return null;
  const n = Number(String(plain(v)).replace(/,/g,''));
  return Number.isFinite(n) ? n : null;
};
const asBool = (v, fallback = 1) => {
  const s = norm(v);
  if (!s) return fallback;
  if (['نعم','yes','1','true','نشط','نشطة'].includes(s)) return 1;
  if (['لا','no','0','false','موقوف','موقوفة'].includes(s)) return 0;
  return null;
};
const mapped = (v, map, allowed, fallback) => {
  const s = plain(v); if (!s) return fallback;
  return map[s] || (allowed.includes(s) ? s : null);
};
const validEmail = s => !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const list = v => plain(v).split(/[,،;]+/).map(x=>x.trim()).filter(Boolean);

function lookupOne(sql, value, label, errors) {
  if (!plain(value)) return null;
  const rows = db.prepare(sql).all(plain(value), norm(value));
  if (!rows.length) errors.push(`${label}: غير موجود في النظام`);
  else if (rows.length > 1) errors.push(`${label}: الاسم غير مميز ويوجد أكثر من سجل مطابق`);
  return rows.length === 1 ? rows[0] : null;
}

function findUsers(value, errors) {
  const found=[];
  for (const name of list(value)) {
    const row=lookupOne('SELECT id,username,display_name FROM users WHERE active=1 AND (username=? OR lower(display_name)=?)',name,`الموظف ${name}`,errors);
    if(row) found.push(row.id);
  }
  return [...new Set(found)];
}

function prepareRow(entity, input, rowNumber, seen) {
  const r = {}; Object.entries(input).forEach(([k,v]) => { r[k]=plain(v); });
  const errors=[]; const add=(condition,msg)=>{if(condition)errors.push(msg)};
  const email=(key='email')=>{r[key]=excelCell.email(r[key]);add(!validEmail(r[key]),`${DEFINITIONS[entity].fields.find(x=>x[0]===key)?.[1]||key}: صيغة غير صحيحة`)};
  const unique=(key,value,existsSql,msg)=>{const n=norm(value);if(!n)return;if(seen[key]?.has(n))errors.push(`${msg}: مكرر داخل الملف`);else{seen[key]=seen[key]||new Set();seen[key].add(n)}if(existsSql&&db.prepare(existsSql).get(value,n))errors.push(`${msg}: موجود مسبقًا في النظام`)};
  const date=(key,label,datetime=false)=>{if(!r[key])return;const parsed=asDate(r[key]);r[key]=parsed&&(!datetime)?parsed.slice(0,10):parsed;add(!r[key]||(datetime&&!r[key].includes(' ')),`${label}: استخدم ${datetime?'YYYY-MM-DD HH:MM':'YYYY-MM-DD'}`)};
  let company, branch, request, client, service, category;

  if(entity==='clients'){
    add(!r.full_name,'الاسم الكامل مطلوب'); email(); add(!r.email,'البريد الإلكتروني مطلوب');
    unique('email',r.email,'SELECT 1 FROM clients WHERE lower(email)=? OR lower(email)=?','البريد الإلكتروني');
    r.relation=mapped(r.relation,MAPS.relation,['self','guardian','agent','relative','other'],'self'); add(!r.relation,'الصفة غير صحيحة');
    r.lang=mapped(r.lang,MAPS.lang,['ar','en'],'ar'); add(!r.lang,'اللغة غير صحيحة');
  }
  if(entity==='companies'){
    add(!r.name,'اسم الشركة مطلوب'); email(); r.active=asBool(r.active); add(r.active===null,'قيمة نشطة يجب أن تكون نعم أو لا');
    unique('name',r.name,'SELECT 1 FROM companies WHERE lower(name)=? OR lower(name)=?','اسم الشركة');
    if(r.registration_no) unique('registration_no',r.registration_no,'SELECT 1 FROM companies WHERE registration_no=? OR lower(registration_no)=?','رقم السجل');
  }
  if(entity==='branches'){
    add(!r.company,'اسم الشركة مطلوب'); add(!r.name,'اسم الفرع مطلوب'); email(); r.active=asBool(r.active); add(r.active===null,'قيمة نشط يجب أن تكون نعم أو لا');
    company=lookupOne('SELECT id,name FROM companies WHERE active=1 AND (name=? OR lower(name)=?)',r.company,'الشركة',errors); r.company_id=company?.id||null;
    if(company){const key=`${company.id}:${norm(r.name)}`;if(seen.branch?.has(key))errors.push('الفرع مكرر داخل الملف');else{seen.branch=seen.branch||new Set();seen.branch.add(key)}if(db.prepare('SELECT 1 FROM company_branches WHERE company_id=? AND lower(name)=?').get(company.id,norm(r.name)))errors.push('الفرع موجود مسبقًا في النظام')}
  }
  if(entity==='employees'){
    r.username=norm(r.username); add(!r.username,'اسم المستخدم مطلوب'); add(r.username&&!/^[a-z0-9._-]+$/.test(r.username),'اسم المستخدم يقبل حروفًا إنجليزية وأرقامًا و . _ - فقط');
    add(!r.display_name,'اسم العرض مطلوب'); r.role=mapped(r.role,MAPS.role,['admin','supervisor','lawyer','accountant'],null); add(!r.role,'الدور غير صحيح');
    email(); date('birth_date','تاريخ الميلاد'); r.active=asBool(r.active); add(r.active===null,'قيمة نشط يجب أن تكون نعم أو لا');
    unique('username',r.username,'SELECT 1 FROM users WHERE username=? OR lower(username)=?','اسم المستخدم');
  }
  if(entity==='requests'){
    r.ref='';
    add(!r.name,'اسم العميل مطلوب'); add(!r.phone,'رقم الموبايل مطلوب'); email();
    r.status=mapped(r.status,MAPS.requestStatus,Object.keys(require('./i18n').STATUS),'new'); add(!r.status,'حالة الطلب غير صحيحة');
    ['deadline','issued_on','expires_on','renewal_on'].forEach(k=>date(k,DEFINITIONS.requests.fields.find(x=>x[0]===k)[1]));
    ['total_amount','paid_amount'].forEach(k=>{const n=asNumber(r[k]);add(r[k]&&n===null,`${DEFINITIONS.requests.fields.find(x=>x[0]===k)[1]}: يجب أن يكون رقمًا`);r[k]=n??0});
    add(r.total_amount<0||r.paid_amount<0,'المبالغ لا تقبل قيمة سالبة'); add(r.paid_amount>r.total_amount&&r.total_amount>0,'المدفوع أكبر من الإجمالي');
    if(r.ref){r.ref=refLib.normalise(r.ref);unique('ref',r.ref,'SELECT 1 FROM requests WHERE ref=? OR lower(ref)=?','مرجع الطلب')}
    if(r.service){service=lookupOne('SELECT id,title_ar,title_en FROM services WHERE active=1 AND (title_ar=? OR lower(title_en)=?)',r.service,'الخدمة',errors);r.service_id=service?.id||null;r.service_label=service?`${service.title_ar} / ${service.title_en}`:null}
    if(r.company){company=lookupOne('SELECT id,name FROM companies WHERE active=1 AND (name=? OR lower(name)=?)',r.company,'الشركة',errors);r.company_id=company?.id||null}
    if(r.branch){add(!company,'يجب تحديد شركة صحيحة عند كتابة الفرع');if(company){branch=lookupOne('SELECT id,name FROM company_branches WHERE company_id='+Number(company.id)+' AND active=1 AND (name=? OR lower(name)=?)',r.branch,'الفرع',errors);r.branch_id=branch?.id||null}}
    r.assignee_ids=findUsers(r.assignees,errors);
    if(r.email){client=db.prepare('SELECT id FROM clients WHERE lower(email)=?').get(r.email);r.client_id=client?.id||null}
  }
  if(entity==='cases'){
    r.file_no='';
    add(!r.request_ref,'مرجع الطلب مطلوب'); add(!r.title,'عنوان القضية مطلوب');
    request=r.request_ref?db.prepare('SELECT * FROM requests WHERE ref=?').get(refLib.normalise(r.request_ref)):null;add(!request,'مرجع الطلب غير موجود');r.request_id=request?.id||null;r.client_id=request?.client_id||null;
    if(request&&db.prepare('SELECT 1 FROM legal_cases WHERE request_id=?').get(request.id))errors.push('تم إنشاء قضية لهذا الطلب مسبقًا');
    if(request){const key=String(request.id);if(seen.request_id?.has(key))errors.push('مرجع الطلب مكرر داخل الملف ولا يقبل أكثر من قضية');else{seen.request_id=seen.request_id||new Set();seen.request_id.add(key)}}
    if(r.file_no)unique('file_no',r.file_no,'SELECT 1 FROM legal_cases WHERE file_no=? OR lower(file_no)=?','رقم الملف');
    r.status=mapped(r.status,MAPS.caseStatus,Object.keys(casesLib.STATUS),'preparation');add(!r.status,'حالة القضية غير صحيحة');
    r.priority=mapped(r.priority,MAPS.priority,['normal','high','urgent'],'normal');add(!r.priority,'الأولوية غير صحيحة');
    date('opened_on','تاريخ الفتح');date('next_hearing','الجلسة القادمة');
    if(r.category){category=lookupOne('SELECT id,name FROM case_categories WHERE active=1 AND (name=? OR lower(name)=?)',r.category,'التصنيف',errors);r.category_id=category?.id||null}
    r.assignee_ids=findUsers(r.assignees,errors);
  }
  if(entity==='agenda'){
    add(!r.title,'عنوان العمل مطلوب');r.event_type=mapped(r.event_type,MAPS.agendaType,['task','meeting','deadline','renewal','payment'],null);add(!r.event_type,'النوع غير صحيح');
    date('starts_at','البداية',true);date('ends_at','النهاية',true);add(!r.starts_at,'البداية مطلوبة');add(r.ends_at&&r.starts_at&&r.ends_at<r.starts_at,'النهاية تسبق البداية');
    r.priority=mapped(r.priority,MAPS.priority,['normal','high','urgent'],'normal');add(!r.priority,'الأولوية غير صحيحة');
    r.status=mapped(r.status,MAPS.agendaStatus,['pending','in_progress','waiting','completed','cancelled'],'pending');add(!r.status,'الحالة غير صحيحة');
    r.client_visible=asBool(r.client_visible,0);add(r.client_visible===null,'يظهر للعميل يجب أن تكون نعم أو لا');
    const mins=asNumber(r.reminder_minutes);add(r.reminder_minutes&&(mins===null||mins<0),'التذكير بالدقائق يجب أن يكون رقمًا موجبًا');r.reminder_minutes=mins??1440;
    r.assignee_ids=findUsers(r.assignees,errors);
    if(r.request_ref){request=db.prepare('SELECT id,client_id,company_id FROM requests WHERE ref=?').get(refLib.normalise(r.request_ref));add(!request,'مرجع الطلب غير موجود');r.request_id=request?.id||null}
    if(r.client_email){email('client_email');client=db.prepare('SELECT id FROM clients WHERE lower(email)=?').get(norm(r.client_email));add(!client,'بريد العميل غير موجود');r.client_id=client?.id||null}
    if(r.company){company=lookupOne('SELECT id,name FROM companies WHERE active=1 AND (name=? OR lower(name)=?)',r.company,'الشركة',errors);r.company_id=company?.id||null}
    if(request){r.client_id=r.client_id||request.client_id||null;r.company_id=r.company_id||request.company_id||null}
  }
  return { rowNumber, data:r, errors };
}

async function parseWorkbook(buffer, entity) {
  const def=DEFINITIONS[entity]; if(!def)throw new Error('نوع الاستيراد غير مدعوم');
  const wb=new ExcelJS.Workbook(); await wb.xlsx.load(buffer);
  const ws=wb.getWorksheet('البيانات')||wb.worksheets[0]; if(!ws)throw new Error('ملف Excel لا يحتوي على ورقة بيانات');
  const headers={}; ws.getRow(1).eachCell((cell,col)=>{headers[plain(cell.value)]=col});
  const missing=def.fields.filter(f=>!headers[f[1]]).map(f=>f[1]); if(missing.length)throw new Error(`عناوين الأعمدة غير مطابقة للنموذج: ${missing.join('، ')}`);
  const source=[];
  for(let rowNo=2;rowNo<=ws.rowCount;rowNo++){
    const obj={};let any=false;def.fields.forEach(f=>{const v=plain(ws.getRow(rowNo).getCell(headers[f[1]]).value);obj[f[0]]=v;if(v)any=true});if(any)source.push({rowNo,obj});
  }
  if(!source.length)throw new Error('لا توجد صفوف بيانات في الملف'); if(source.length>MAX_ROWS)throw new Error(`الحد الأقصى ${MAX_ROWS} صف في كل عملية استيراد`);
  const seen={}; return source.map(x=>prepareRow(entity,x.obj,x.rowNo,seen));
}

async function templateBuffer(entity) {
  const def=DEFINITIONS[entity]; if(!def)throw new Error('نوع الاستيراد غير مدعوم');
  const wb=new ExcelJS.Workbook(); wb.creator='منصة سند'; wb.created=new Date();
  const ws=wb.addWorksheet('البيانات',{views:[{rightToLeft:true,state:'frozen',ySplit:1}]});
  ws.columns=def.fields.map(f=>({header:f[1],key:f[0],width:Math.max(16,Math.min(35,f[1].length+10))}));
  const head=ws.getRow(1);head.height=30;head.font={bold:true,color:{argb:'FFFFFFFF'}};head.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0B3340'}};head.alignment={horizontal:'center',vertical:'middle'};
  head.eachCell((c,i)=>{c.border={bottom:{style:'medium',color:{argb:'FFB78B32'}}};if(def.fields[i-1][2])c.note='حقل مطلوب'});
  ws.autoFilter={from:{row:1,column:1},to:{row:1,column:def.fields.length}};
  const textFields=new Set(['ref','phone','email','username','national_id','registration_no','tax_no','code','request_ref','file_no','case_number','judicial_year','client_email']);
  const dateFields=new Set(['deadline','issued_on','expires_on','renewal_on','opened_on','next_hearing','birth_date']);
  const dateTimeFields=new Set(['starts_at','ends_at']);
  const systemFields=SYSTEM_FIELDS[entity]||new Set();
  systemFields.forEach(key=>{const idx=def.fields.findIndex(f=>f[0]===key)+1;if(idx>0){ws.getColumn(idx).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE9ECEC'}};ws.getCell(1,idx).note='يولده نظام سند تلقائيًا بعد اعتماد الاستيراد — اترك العمود فارغًا'}});
  for(let i=2;i<=MAX_ROWS+1;i++){ws.getRow(i).height=22;ws.getRow(i).eachCell({includeEmpty:true},(c,col)=>{const key=def.fields[col-1][0];c.alignment={vertical:'middle'};c.border={bottom:{style:'hair',color:{argb:'FFE6ECEA'}}};c.protection={locked:systemFields.has(key)};if(systemFields.has(key)){c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE9ECEC'}};c.note='يولده نظام سند تلقائيًا بعد اعتماد الاستيراد — لا تكتب في هذه الخانة'}if(textFields.has(key))c.numFmt='@';if(dateFields.has(key))c.numFmt='yyyy-mm-dd';if(dateTimeFields.has(key))c.numFmt='yyyy-mm-dd hh:mm';if(['total_amount','paid_amount'].includes(key))c.numFmt='#,##0.00'})}
  const enums={status:entity==='requests'?Object.keys(MAPS.requestStatus):entity==='cases'?Object.keys(MAPS.caseStatus):entity==='agenda'?Object.keys(MAPS.agendaStatus):null,priority:Object.keys(MAPS.priority),event_type:Object.keys(MAPS.agendaType),role:Object.keys(MAPS.role),relation:Object.keys(MAPS.relation),lang:Object.keys(MAPS.lang),active:yesNo,client_visible:yesNo};
  const dynamic={
    service:()=>db.prepare('SELECT title_ar value FROM services WHERE active=1 ORDER BY sort,id').all(),
    company:()=>db.prepare('SELECT name value FROM companies WHERE active=1 ORDER BY name').all(),
    branch:()=>db.prepare('SELECT b.name value FROM company_branches b JOIN companies c ON c.id=b.company_id WHERE b.active=1 AND c.active=1 ORDER BY c.name,b.name').all(),
    assignees:()=>db.prepare('SELECT display_name value FROM users WHERE active=1 ORDER BY display_name').all(),
    request_ref:()=>db.prepare('SELECT ref value FROM requests WHERE archived_at IS NULL ORDER BY id DESC LIMIT 2000').all(),
    category:()=>db.prepare('SELECT name value FROM case_categories WHERE active=1 ORDER BY sort,id').all(),
    client_email:()=>db.prepare("SELECT email value FROM clients WHERE email IS NOT NULL AND email!='' ORDER BY full_name").all(),
  };
  const selections={};
  def.fields.forEach(f=>{
    const values=enums[f[0]]||((dynamic[f[0]]&&['requests','cases','agenda','branches'].includes(entity))?dynamic[f[0]]().map(x=>x.value):null);
    if(values&&values.length)selections[f[0]]=[...new Set(values.map(plain).filter(Boolean))];
  });
  if(Object.keys(selections).length){
    const lists=wb.addWorksheet('قوائم النظام',{state:'veryHidden',views:[{rightToLeft:true}]});
    Object.entries(selections).forEach(([key,values],colIndex)=>{
      const col=colIndex+1,name=`list_${entity}_${key}`;
      lists.getCell(1,col).value=def.fields.find(f=>f[0]===key)?.[1]||key;
      values.forEach((value,i)=>{lists.getCell(i+2,col).value=value});
      wb.definedNames.add(`'قوائم النظام'!$${lists.getColumn(col).letter}$2:$${lists.getColumn(col).letter}$${values.length+1}`,name);
      const fieldIndex=def.fields.findIndex(f=>f[0]===key)+1;
      const required=!!def.fields[fieldIndex-1][2];
      for(let r=2;r<=MAX_ROWS+1;r++){
        const cell=ws.getCell(r,fieldIndex);
        cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF5D9'}};
        cell.dataValidation={type:'list',allowBlank:!required,formulae:[name],showErrorMessage:true,errorTitle:'قيمة غير معتمدة',error:'اختر قيمة من القائمة المرتبطة ببيانات منصة سند.'};
      }
    });
  }
  const info=wb.addWorksheet('التعليمات',{views:[{rightToLeft:true}]});info.columns=[{width:24},{width:18},{width:65}];
  info.addRow([`نموذج استيراد ${def.label}`]);info.mergeCells('A1:C1');info.getCell('A1').font={bold:true,size:18,color:{argb:'FF0B3340'}};info.getCell('A1').alignment={horizontal:'right'};
  info.addRow(['العمود','الحالة','طريقة التعبئة']);def.fields.forEach(f=>info.addRow([f[1],f[2]?'مطلوب':'اختياري',f[3]||'اكتب القيمة كما هي في النظام']));
  info.getRow(3).font={bold:true,color:{argb:'FFFFFFFF'}};info.getRow(3).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFB78B32'}};
  info.addRow([]);info.addRow(['دليل الألوان','ذهبي فاتح','اختر من قائمة النظام المنسدلة — لا تكتب قيمة جديدة.']);
  info.addRow(['','رمادي','خانة يولدها النظام تلقائيًا بعد الاعتماد، مثل رقم الطلب أو رقم ملف القضية.']);
  info.addRow(['','أبيض','بيانات متغيرة تكتبها أنت، مثل الاسم ورقم الموبايل والتاريخ والمبلغ.']);
  info.addRow([]);info.addRow(['مهم','',`القوائم مأخوذة لحظة تنزيل النموذج من بيانات الموقع. إذا أضيفت خدمة أو شركة أو موظف جديد، نزّل نموذجًا جديدًا. لا تغيّر أسماء الأعمدة. التاريخ بصيغة YYYY-MM-DD، والبداية/النهاية بصيغة YYYY-MM-DD HH:MM. الحد الأقصى ${MAX_ROWS} صف.`]);
  info.eachRow(r=>{r.alignment={vertical:'top',wrapText:true};r.height=24});
  return wb.xlsx.writeBuffer();
}

function saveBatch(userId, entity, fileName, rows, officeBranchId) {
  const branch=db.prepare('SELECT id FROM office_branches WHERE id=? AND active=1').get(Number(officeBranchId));
  if(!branch)throw new Error('اختر فرع المكتب الذي تخصه البيانات');
  const token=crypto.randomBytes(18).toString('hex');const bad=rows.filter(x=>x.errors.length);
  db.prepare(`INSERT INTO data_import_batches(token,entity,file_name,total_rows,valid_rows,error_rows,payload_json,errors_json,created_by,office_branch_id)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(token,entity,fileName,rows.length,rows.length-bad.length,bad.length,JSON.stringify(rows.map(x=>x.data)),JSON.stringify(rows.map(x=>({rowNumber:x.rowNumber,errors:x.errors}))),userId,branch.id);
  return token;
}

function loadBatch(token,userId){const b=db.prepare('SELECT b.*,o.name office_branch_name FROM data_import_batches b LEFT JOIN office_branches o ON o.id=b.office_branch_id WHERE b.token=? AND b.created_by=?').get(token,userId);if(!b)return null;return{...b,rows:JSON.parse(b.payload_json),reviews:JSON.parse(b.errors_json),result:b.result_json?JSON.parse(b.result_json):null}}

function commitBatch(batch, req) {
  if(batch.status!=='review')throw new Error('تم تنفيذ عملية الاستيراد من قبل');
  const seen={};
  const checked=batch.rows.map((r,i)=>prepareRow(batch.entity,r,batch.reviews[i]?.rowNumber||i+2,seen));
  const bad=checked.filter(x=>x.errors.length);if(bad.length){db.prepare('UPDATE data_import_batches SET valid_rows=?,error_rows=?,errors_json=? WHERE id=?').run(checked.length-bad.length,bad.length,JSON.stringify(checked.map(x=>({rowNumber:x.rowNumber,errors:x.errors}))),batch.id);return{ok:false,rows:checked}}
  const quotaKind={employees:'users',requests:'requests',branches:'branches'}[batch.entity];
  if(quotaKind){const adding=checked.filter(x=>x.data.active!==0).length,quota=tenantPolicy.allowance(quotaKind,adding);if(!quota.allowed)throw new Error('تجاوز ملف الاستيراد حد الباقة المسموح. خفّض عدد الصفوف أو اطلب ترقية الباقة.');}
  const credentials=[];const refs=[];
  const run=db.transaction(()=>{
    for(const item of checked){const r=item.data;let info,id;
      if(batch.entity==='clients') db.prepare(`INSERT INTO clients(email,full_name,phone,relation,beneficiary_name,lang,office_branch_id) VALUES(?,?,?,?,?,?,?)`).run(r.email,r.full_name,r.phone||null,r.relation,r.beneficiary_name||null,r.lang,batch.office_branch_id);
      if(batch.entity==='companies') db.prepare(`INSERT INTO companies(name,legal_name,registration_no,tax_no,phone,email,address,contact_name,notes,active,created_by,office_branch_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(r.name,r.legal_name||null,r.registration_no||null,r.tax_no||null,r.phone||null,r.email||null,r.address||null,r.contact_name||null,r.notes||null,r.active,req.user.id,batch.office_branch_id);
      if(batch.entity==='branches') db.prepare(`INSERT INTO company_branches(company_id,name,code,phone,email,address,manager,notes,active,office_branch_id) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(r.company_id,r.name,r.code||null,r.phone||null,r.email||null,r.address||null,r.manager||null,r.notes||null,r.active,batch.office_branch_id);
    if(batch.entity==='employees'){const temp=password.suggestTemporary();db.prepare(`INSERT INTO users(username,password_hash,role,display_name,legal_name,job_title,email,phone,national_id,birth_date,active,must_change_password,profile_completed,created_by,office_branch_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`).run(r.username,bcrypt.hashSync(temp,10),r.role,r.display_name,r.legal_name||r.display_name,r.job_title||null,r.email||null,r.phone||null,r.national_id||null,r.birth_date||null,r.active,1,req.user.display_name||req.user.username,batch.office_branch_id);credentials.push({username:r.username,name:r.display_name,password:temp})}
      if(batch.entity==='requests'){
        const ref=r.ref||refLib.generate(c=>!!db.prepare('SELECT 1 FROM requests WHERE ref=?').get(c));
        info=db.prepare(`INSERT INTO requests(ref,name,phone,phone_key,email,client_id,company_id,branch_id,service_id,service_label,title,message,status,total_amount,paid_amount,deadline,issued_on,expires_on,renewal_on,upload_token,opened_by,source,office_branch_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'office',?)`).run(ref,r.name,r.phone,refLib.phoneKey(r.phone),r.email||null,r.client_id||null,r.company_id||null,r.branch_id||null,r.service_id||null,r.service_label||null,r.title||null,r.message||null,r.status,r.total_amount,r.paid_amount,r.deadline||null,r.issued_on||null,r.expires_on||null,r.renewal_on||null,crypto.randomBytes(24).toString('hex'),req.user.display_name||req.user.username,batch.office_branch_id);id=Number(info.lastInsertRowid);if(r.service_id)db.prepare('INSERT OR IGNORE INTO request_services(request_id,service_id,label,sort,added_by) VALUES(?,?,?,?,?)').run(id,r.service_id,r.service_label,0,req.user.display_name||req.user.username);const add=db.prepare('INSERT OR IGNORE INTO request_assignees(request_id,user_id,assigned_by) VALUES(?,?,?)');r.assignee_ids.forEach(uid=>add.run(id,uid,req.user.display_name||req.user.username));refs.push(ref)
      }
      if(batch.entity==='cases'){
        let fileNo=r.file_no||casesLib.nextFileNo();if(!r.file_no){const base=fileNo.replace(/\d+$/,'');let seq=Number(fileNo.slice(base.length));while(db.prepare('SELECT 1 FROM legal_cases WHERE file_no=?').get(fileNo)){seq+=1;fileNo=base+String(seq).padStart(5,'0')}}info=db.prepare(`INSERT INTO legal_cases(request_id,client_id,category_id,file_no,title,case_number,judicial_year,court,circuit,opposing_party,status,priority,opened_on,next_hearing,summary,client_summary,created_by,office_branch_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(r.request_id,r.client_id||null,r.category_id||null,fileNo,r.title,r.case_number||null,r.judicial_year||null,r.court||null,r.circuit||null,r.opposing_party||null,r.status,r.priority,r.opened_on||new Date().toISOString().slice(0,10),r.next_hearing||null,r.summary||null,r.client_summary||null,req.user.id,batch.office_branch_id);id=Number(info.lastInsertRowid);const add=db.prepare('INSERT OR IGNORE INTO case_assignees(case_id,user_id,assigned_by) VALUES(?,?,?)');r.assignee_ids.forEach(uid=>add.run(id,uid,req.user.id));refs.push(fileNo)
      }
      if(batch.entity==='agenda'){info=db.prepare(`INSERT INTO agenda_events(title,event_type,starts_at,ends_at,priority,status,assigned_user_id,request_id,client_id,company_id,client_visible,location,notes,reminder_minutes,created_by,office_branch_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(r.title,r.event_type,r.starts_at,r.ends_at||null,r.priority,r.status,r.assignee_ids[0]||null,r.request_id||null,r.client_id||null,r.company_id||null,r.client_visible,r.location||null,r.notes||null,r.reminder_minutes,req.user.id,batch.office_branch_id);id=Number(info.lastInsertRowid);const add=db.prepare('INSERT OR IGNORE INTO agenda_assignees(agenda_event_id,user_id) VALUES(?,?)');r.assignee_ids.forEach(uid=>add.run(id,uid))}
    }
    const result={count:checked.length,credentials,refs};
    const storedResult={count:checked.length,refs};
    db.prepare(`UPDATE data_import_batches SET status='completed',imported_at=datetime('now'),result_json=?,payload_json='[]' WHERE id=?`).run(JSON.stringify(storedResult),batch.id);return result;
  });
  return {ok:true,result:run()};
}

function purgeOld(){db.prepare("DELETE FROM data_import_batches WHERE status='review' AND created_at < datetime('now','-7 days')").run()}

module.exports={DEFINITIONS,MAX_ROWS,parseWorkbook,templateBuffer,saveBatch,loadBatch,commitBatch,purgeOld};
