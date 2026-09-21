const {addColumn}=require('../migrate');
exports.up=db=>{
  addColumn(db,'requests','issued_on','TEXT');
  addColumn(db,'requests','expires_on','TEXT');
  addColumn(db,'requests','renewal_on','TEXT');
  addColumn(db,'users','job_title','TEXT');
  const page=db.prepare("SELECT id FROM pages WHERE slug='gerwani-company-services'").get();
  const pageId=page?page.id:Number(db.prepare(`INSERT INTO pages(slug,name_ar,name_en,tagline_ar,tagline_en,intro_ar,intro_en,colour,icon,sort,show_in_menu) VALUES('gerwani-company-services','خدمات شركة الجرواني','El Gerwany Company Services','التراخيص والتشغيل والموافقات في مسار واحد','Licensing and operational approvals in one path','خدمات متخصصة للشركات والمنشآت مع متابعة الإصدار والانتهاء والتجديد.','Specialized company services with issue, expiry and renewal tracking.','#cda646','briefcase',0,1)`).run().lastInsertRowid);
  const groups=[
    ['التراخيص والتشغيل','Licensing & operation',['ترخيص اعلان','رخصة تشغيل محل','رخصة تشغيل مصنع','رخصة تشغيل مول تجاري','رخصة تشغيل مبنى اداري','استخراج رخصة هدم','ترخيص علاج حر']],
    ['المرافق والعدادات','Utilities & meters',['زيادة قدرة عداد كهرباء','تغيير عداد كهرباء بدل تالف','تركيب عداد مياه','تركيب تليفون وانترنت','تركيب اعلان']],
    ['الموافقات والتصاريح','Approvals & permits',['تصريح تشطيب','موافقة بيئة','موافقة حماية مدنية','تصريح مرور','موافقة مرورية','موافقة كاميرات','تصريح اشغالات','استخراج خطاب موجه الي الحماية المدنية']],
    ['العقود والتوثيق والمستندات','Contracts & documents',['اثبات تاريخ','استلام مستندات','استخراج شهادة سلبية','استخراج عقد مشهر','تصديق علي عقد']],
    ['الخدمات الطبية والبيئية','Medical & environmental',['تسجيل نقابة الاطباء','ترخيص تداول نفايات','عقد نفايات']],
    ['المقابلات والتوقيع','Meetings & signing',['مقابلة عميل للتوقيع علي عقد']]
  ];
  const addCat=db.prepare('INSERT INTO categories(sort,name_ar,name_en,desc_ar,desc_en,page_id) VALUES(?,?,?,?,?,?)');
  const addSvc=db.prepare('INSERT INTO services(category_id,sort,title_ar,title_en,body_ar,body_en,is_consultation,active) VALUES(?,?,?,?,?,?,0,1)');
  groups.forEach((g,i)=>{let cat=db.prepare('SELECT id FROM categories WHERE page_id=? AND name_ar=?').get(pageId,g[0]);const cid=cat?cat.id:Number(addCat.run(i+1,g[0],g[1],'خدمات '+g[0],g[1],pageId).lastInsertRowid);g[2].forEach((name,j)=>{if(!db.prepare('SELECT 1 FROM services WHERE category_id=? AND title_ar=?').get(cid,name))addSvc.run(cid,j+1,name,name,'متابعة الخدمة ومستنداتها ومواعيد إصدارها وانتهائها.','Service processing, documents, issue and expiry tracking.')})});
};
