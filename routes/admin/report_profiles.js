const express=require('express');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const multer=require('multer');
const {db,UPLOAD_DIR}=require('../../db');
const {can}=require('../../middleware/auth');
const audit=require('../../lib/audit');
const csrf=require('../../lib/csrf');
const router=express.Router();
router.use(can('report_profiles.manage'));

const dir=path.join(UPLOAD_DIR,'report-profiles');
fs.mkdirSync(dir,{recursive:true});
const upload=multer({storage:multer.diskStorage({destination:dir,filename:(_r,f,cb)=>cb(null,crypto.randomBytes(16).toString('hex')+path.extname(f.originalname).toLowerCase())}),limits:{fileSize:2*1024*1024},fileFilter:(_r,f,cb)=>cb(null,['image/png','image/jpeg','image/webp'].includes(f.mimetype))});
const fields=upload.fields([{name:'logo',maxCount:1},{name:'signature',maxCount:1},{name:'stamp',maxCount:1}]);

router.get('/',(req,res)=>{res.render('admin/report_profiles',{rows:db.prepare('SELECT r.*,b.name office_branch_name FROM report_profiles r LEFT JOIN office_branches b ON b.id=r.office_branch_id WHERE r.active=1 ORDER BY b.is_main DESC,b.name,r.is_default DESC,r.name').all(),branches:db.prepare('SELECT * FROM office_branches WHERE active=1 ORDER BY is_main DESC,name').all(),msg:req.query.msg})});

router.get('/assets/:name',(req,res)=>{
  const name=path.basename(req.params.name);
  if(name!==req.params.name||!fs.existsSync(path.join(dir,name)))return res.status(404).end();
  res.sendFile(path.join(dir,name));
});

router.post('/new',fields,csrf.verifyDeferred,(req,res)=>{
  const b=req.body,name=String(b.name||'').trim(),company=String(b.company_name_ar||'').trim();
  if(!name||!company)return res.redirect(req.adminPath+'/report-profiles?msg=missing');
  const branch=db.prepare('SELECT id FROM office_branches WHERE id=? AND active=1').get(Number(b.office_branch_id));if(!branch)return res.redirect(req.adminPath+'/report-profiles?msg=missing_branch');
  const file=n=>req.files&&req.files[n]&&req.files[n][0]?req.files[n][0].filename:null;
  const info=db.prepare(`INSERT INTO report_profiles(name,company_name_ar,company_name_en,legal_name,registration_no,tax_no,entity_type,unified_no,vat_registered,vat_rate,prices_include_tax,currency,fiscal_year_start,bank_name,iban,invoice_prefix,address,phone,email,website,logo_file,header_text,intro_text,footer_text,signatory_name,signatory_title,signature_file,stamp_file,watermark_text,primary_color,accent_color,is_default,created_by,office_branch_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(name,company,String(b.company_name_en||'').trim()||null,String(b.legal_name||'').trim()||null,String(b.registration_no||'').trim()||null,String(b.tax_no||'').trim()||null,String(b.entity_type||'').trim()||null,String(b.unified_no||'').trim()||null,b.vat_registered?1:0,Math.max(0,Number(b.vat_rate)||0),b.prices_include_tax?1:0,String(b.currency||'EGP').trim(),String(b.fiscal_year_start||'01-01').trim(),String(b.bank_name||'').trim()||null,String(b.iban||'').trim()||null,String(b.invoice_prefix||'INV').trim(),String(b.address||'').trim()||null,String(b.phone||'').trim()||null,String(b.email||'').trim()||null,String(b.website||'').trim()||null,file('logo'),String(b.header_text||'').trim()||null,String(b.intro_text||'').trim()||null,String(b.footer_text||'').trim()||null,String(b.signatory_name||'').trim()||null,String(b.signatory_title||'').trim()||null,file('signature'),file('stamp'),String(b.watermark_text||'').trim()||null,/^#[0-9a-f]{6}$/i.test(b.primary_color||'')?b.primary_color:'#0b2b34',/^#[0-9a-f]{6}$/i.test(b.accent_color||'')?b.accent_color:'#d1a747',b.is_default?1:0,req.user.id,branch.id);
  if(b.is_default)db.prepare('UPDATE report_profiles SET is_default=CASE WHEN id=? THEN 1 ELSE 0 END WHERE office_branch_id=?').run(info.lastInsertRowid,branch.id);
  audit.log(req,'report_profile.create',{type:'report_profile',id:Number(info.lastInsertRowid),label:name,details:`إضافة هوية تقارير: ${name}`});
  res.redirect(req.adminPath+'/report-profiles?msg=created');
});

router.post('/:id/default',(req,res)=>{
  const row=db.prepare('SELECT * FROM report_profiles WHERE id=? AND active=1').get(req.params.id);
  if(!row)return res.status(404).end();
  db.transaction(()=>{db.prepare('UPDATE report_profiles SET is_default=0 WHERE office_branch_id=?').run(row.office_branch_id);db.prepare('UPDATE report_profiles SET is_default=1 WHERE id=?').run(row.id)})();
  audit.log(req,'report_profile.default',{type:'report_profile',id:row.id,label:row.name,details:`تعيين ${row.name} كهوية التقارير الافتراضية`});
  res.redirect(req.adminPath+'/report-profiles?msg=default');
});
module.exports=router;
