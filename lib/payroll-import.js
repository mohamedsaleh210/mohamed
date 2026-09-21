const ExcelJS=require('exceljs');
const crypto=require('crypto');
const {db}=require('../db');

const FIELDS=[
 ['basic_salary','المرتب الأساسي'],['housing_allowance','بدل السكن'],['transport_allowance','بدل الانتقال'],['fixed_allowance','بدلات ثابتة'],
 ['performance_bonus','مكافأة الأداء'],['exceptional_incentive','حافز استثنائي'],['overtime_amount','عمل إضافي'],['other_earning','استحقاقات أخرى'],
 ['absence_deduction','خصم غياب'],['lateness_deduction','خصم تأخير'],['penalty_deduction','جزاءات'],['advance_deduction','خصم سلفة'],
 ['insurance_deduction','تأمينات'],['tax_deduction','ضرائب'],['other_deduction','خصومات أخرى']
];
const HEADERS=['كود الموظف','اسم الموظف','الرقم القومي',...FIELDS.map(x=>x[1]),'بيان المكافآت والحوافز','بيان الخصومات','إجمالي الاستحقاقات','إجمالي الخصومات','صافي المرتب'];
const money=v=>{if(v===null||v===undefined||v==='')return 0;if(typeof v==='object'&&v.result!==undefined)v=v.result;const n=Number(String(v).replace(/,/g,''));return Number.isFinite(n)&&n>=0&&n<=100000000?Math.round(n*100)/100:null};
const text=v=>{if(v===null||v===undefined)return '';if(typeof v==='object'&&v.text!==undefined)return String(v.text).trim();return String(v).trim()};
const totals=row=>{const earn=FIELDS.slice(0,8).reduce((s,[k])=>s+row[k],0),ded=FIELDS.slice(8).reduce((s,[k])=>s+row[k],0);return{gross_amount:earn,total_deductions:ded,net_amount:Math.max(0,earn-ded)}};

async function template(runId){
 const run=db.prepare('SELECT * FROM payroll_runs WHERE id=?').get(runId);if(!run)throw new Error('السند غير موجود');
 const rows=db.prepare('SELECT * FROM payroll_items WHERE payroll_run_id=? ORDER BY employee_name').all(run.id);
 const wb=new ExcelJS.Workbook();wb.creator='منصة سند';wb.created=new Date();
 const ws=wb.addWorksheet('سند صرف المرتب',{views:[{rightToLeft:true,state:'frozen',ySplit:4,xSplit:3}]});
 ws.mergeCells('A1:W1');ws.getCell('A1').value=`بيانات سند صرف مرتب ${run.period}`;ws.getCell('A1').font={name:'Arial',size:16,bold:true,color:{argb:'FFFFFFFF'}};ws.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0B2B34'}};ws.getCell('A1').alignment={horizontal:'center'};
 ws.mergeCells('A2:W2');ws.getCell('A2').value='عدّل القيم المالية فقط. لا تغيّر كود الموظف، ولا تضف موظفًا غير موجود في السند.';ws.getCell('A2').font={name:'Arial',italic:true,color:{argb:'FF6B7280'}};
 ws.addRow([]);ws.addRow(HEADERS);
 ws.getRow(4).font={name:'Arial',bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(4).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFD1A747'}};ws.getRow(4).alignment={horizontal:'center',vertical:'middle',wrapText:true};
 rows.forEach((r,index)=>{const n=5+index;const values=[r.user_id,r.employee_name,r.national_id||'',...FIELDS.map(([k])=>r[k]||0),r.earning_note||'',r.deduction_note||''];const row=ws.addRow(values);row.getCell(21).value={formula:`SUM(D${n}:K${n})`,result:r.gross_amount};row.getCell(22).value={formula:`SUM(L${n}:R${n})`,result:r.total_deductions};row.getCell(23).value={formula:`MAX(0,U${n}-V${n})`,result:r.net_amount};});
 ws.columns.forEach((c,i)=>{c.width=i===1?24:i===18||i===19?28:i<3?16:15;c.font={name:'Arial',size:10};});
 ws.getColumn(1).protection={locked:true};ws.getColumn(2).protection={locked:true};ws.getColumn(3).protection={locked:true};
 ['U','V','W'].forEach(c=>{ws.getColumn(c).protection={locked:true};ws.getColumn(c).numFmt='#,##0.00'});for(let c=4;c<=18;c++)ws.getColumn(c).numFmt='#,##0.00';
 ws.autoFilter={from:'A4',to:`W${Math.max(5,4+rows.length)}`};ws.eachRow(r=>r.alignment={vertical:'middle'});ws.getRow(4).height=34;
 const info=wb.addWorksheet('تعليمات',{views:[{rightToLeft:true}]});info.getColumn(1).width=110;info.getCell('A1').value='تعليمات الاستيراد';info.getCell('A1').font={name:'Arial',size:15,bold:true,color:{argb:'FF0B2B34'}};[
  'يمكن تعديل بيانات الموظفين الموجودين في سند صرف المرتب فقط.',
  'الخانات الصفراء هي الخانات المتغيرة التي يمكن تعبئتها.',
  'القيم السالبة أو غير الرقمية أو الأكبر من 100,000,000 تُرفض.',
  'يتم عرض معاينة والفروقات قبل الحفظ، ولا يؤثر رفع الملف وحده على السند.',
  'إعادة رفع الملف لا تكرر البنود؛ التطبيق يحدث صف الموظف نفسه مرة واحدة.'
 ].forEach((v,i)=>{const cell=info.getCell(`A${i+3}`);cell.value=v;cell.font={name:'Arial',size:11};});
 for(let row=5;row<=4+rows.length;row++)for(let col=4;col<=20;col++){
  ws.getCell(row,col).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF4CC'}};
  ws.getCell(row,col).protection={locked:false};
 }
 return wb.xlsx.writeBuffer();
}

async function parse(buffer,runId){
 const run=db.prepare("SELECT * FROM payroll_runs WHERE id=? AND status='draft'").get(runId);if(!run)throw new Error('سند صرف المرتب غير موجود أو تم اعتماده');
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(buffer);const ws=wb.getWorksheet('سند صرف المرتب')||wb.worksheets[0];if(!ws)throw new Error('ملف Excel لا يحتوي على ورقة بيانات');
 const headers=new Map();ws.getRow(4).eachCell((cell,col)=>headers.set(text(cell.value),col));for(const h of HEADERS.slice(0,20))if(!headers.has(h))throw new Error(`العمود المطلوب غير موجود: ${h}`);
 const current=new Map(db.prepare('SELECT * FROM payroll_items WHERE payroll_run_id=?').all(run.id).map(r=>[r.user_id,r])),seen=new Set(),rows=[];
 for(let n=5;n<=ws.rowCount;n++){
  const code=Number(text(ws.getRow(n).getCell(headers.get('كود الموظف')).value));if(!code&&ws.getRow(n).values.every(v=>!text(v)))continue;
  const errors=[],before=current.get(code);if(!Number.isInteger(code)||!before)errors.push('كود الموظف غير موجود في سند صرف المرتب');if(seen.has(code))errors.push('كود الموظف مكرر في الملف');seen.add(code);
  const values={};for(const [key,label] of FIELDS){const value=money(ws.getRow(n).getCell(headers.get(label)).value);if(value===null)errors.push(`${label}: قيمة غير صحيحة`);values[key]=value===null?0:value;}
  values.earning_note=text(ws.getRow(n).getCell(headers.get('بيان المكافآت والحوافز')).value).slice(0,1000)||null;values.deduction_note=text(ws.getRow(n).getCell(headers.get('بيان الخصومات')).value).slice(0,1000)||null;Object.assign(values,totals(values));
  const changes=before?FIELDS.filter(([k])=>Number(before[k]||0)!==values[k]).map(([k,label])=>`${label}: ${Number(before[k]||0)} ← ${values[k]}`):[];
  rows.push({row:n,user_id:code,employee_name:before?.employee_name||text(ws.getRow(n).getCell(headers.get('اسم الموظف')).value),values,changes,errors});
 }
 if(!rows.length)throw new Error('لا توجد بيانات موظفين في الملف');return rows;
}
function save(userId,runId,fileName,buffer,rows){const token=crypto.randomBytes(24).toString('hex'),valid=rows.filter(r=>!r.errors.length).length;db.prepare('INSERT INTO payroll_import_batches(token,payroll_run_id,file_name,file_hash,rows_json,valid_count,invalid_count,created_by) VALUES(?,?,?,?,?,?,?,?)').run(token,runId,String(fileName||'payroll.xlsx').slice(0,200),crypto.createHash('sha256').update(buffer).digest('hex'),JSON.stringify(rows),valid,rows.length-valid,userId);return token;}
function batch(token,userId){const b=db.prepare("SELECT * FROM payroll_import_batches WHERE token=? AND created_by=? AND status='preview'").get(token,userId);if(!b)return null;return{...b,rows:JSON.parse(b.rows_json)}}
function apply(token,userId){const b=batch(token,userId);if(!b)throw new Error('المعاينة غير موجودة أو تم تطبيقها');if(b.invalid_count)throw new Error('صحح الصفوف المرفوضة ثم ارفع الملف مجددًا');const run=db.prepare("SELECT * FROM payroll_runs WHERE id=? AND status='draft'").get(b.payroll_run_id);if(!run)throw new Error('سند صرف المرتب تم اعتماده ولا يقبل الاستيراد');const sql=db.prepare(`UPDATE payroll_items SET basic_salary=@basic_salary,housing_allowance=@housing_allowance,transport_allowance=@transport_allowance,fixed_allowance=@fixed_allowance,performance_bonus=@performance_bonus,exceptional_incentive=@exceptional_incentive,overtime_amount=@overtime_amount,other_earning=@other_earning,absence_deduction=@absence_deduction,lateness_deduction=@lateness_deduction,penalty_deduction=@penalty_deduction,advance_deduction=@advance_deduction,insurance_deduction=@insurance_deduction,tax_deduction=@tax_deduction,other_deduction=@other_deduction,earning_note=@earning_note,deduction_note=@deduction_note,gross_amount=@gross_amount,total_deductions=@total_deductions,net_amount=@net_amount,updated_at=datetime('now') WHERE payroll_run_id=@run_id AND user_id=@user_id`);db.transaction(()=>{for(const r of b.rows)sql.run({...r.values,run_id:run.id,user_id:r.user_id});db.prepare("UPDATE payroll_import_batches SET status='applied',applied_by=?,applied_at=datetime('now') WHERE id=?").run(userId,b.id)})();return run;}
module.exports={FIELDS,HEADERS,template,parse,save,batch,apply};
