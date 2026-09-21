exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS homepage_content (
      content_key TEXT PRIMARY KEY,
      group_key TEXT NOT NULL DEFAULT 'general',
      label_ar TEXT NOT NULL,
      value_ar TEXT NOT NULL DEFAULT '',
      value_en TEXT NOT NULL DEFAULT '',
      input_type TEXT NOT NULL DEFAULT 'text',
      sort INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT(datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_homepage_content_group
      ON homepage_content(group_key, sort, content_key);
  `);

  const insert = db.prepare(`
    INSERT OR IGNORE INTO homepage_content
      (content_key, group_key, label_ar, value_ar, value_en, input_type, sort)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  [
    ['hero_eyebrow','hero','العبارة التعريفية','منصة واحدة لإنجاز أعمالك بثقة','One platform to get business done with confidence','text',10],
    ['hero_title','hero','العنوان الرئيسي','تراخيصك وموافقاتك وعقودك... ونحن نتكفّل بالإجراءات','Your licences, approvals and contracts — handled end to end','textarea',20],
    ['hero_description','hero','وصف الواجهة','خدمات قانونية وإدارية موثوقة للأفراد والشركات، من متابعة واحدة وحتى الإنجاز.','Trusted legal and administrative services for individuals and businesses, from one clear request to completion.','textarea',30],
    ['hero_primary_label','hero','زر الطلب','ابدأ طلبك الآن','Start your request','text',40],
    ['hero_primary_url','hero','رابط زر الطلب','/request','/request','url',50],
    ['hero_secondary_label','hero','زر الاستكشاف','استكشف الخدمات','Explore services','text',60],
    ['hero_secondary_url','hero','رابط زر الاستكشاف','/services','/services','url',70],
    ['hero_image','hero','صورة الواجهة','/images/sanad-global-hero.png','/images/sanad-global-hero.png','url',80],
    ['hero_image_alt','hero','وصف الصورة','متخصص أعمال يستخدم منصة سند في مكتب احترافي','A business professional using Sanad','text',90],

    ['audiences_title','audiences','عنوان فئات العملاء','اختر ما يخصك','Choose what fits you','text',110],
    ['audiences_description','audiences','وصف فئات العملاء','حلول مصممة للأفراد والمكاتب والشركات والقطاعات.','Solutions designed for individuals, offices, companies and sectors.','textarea',120],
    ['partners_title','partners','عنوان المكاتب','الشركات والمكاتب المشتركة في سند','Companies and offices on Sanad','text',130],
    ['partners_description','partners','وصف المكاتب','جهات معتمدة وموثقة يوافق أدمن سند على ظهورها وخدماتها.','Verified providers approved by Sanad Admin.','textarea',140],
    ['popular_title','popular','عنوان الخدمات الأكثر طلبًا','خدماتنا الأكثر طلبًا','Our most requested services','text',150],
    ['popular_description','popular','وصف الخدمات الأكثر طلبًا','حلول عملية تغطي أهم الاحتياجات القانونية والإدارية.','Practical solutions for common legal and administrative needs.','textarea',160],
    ['steps_title','steps','عنوان خطوات العمل','كيف تعمل سند؟','How Sanad works','text',170],
    ['steps_description','steps','وصف خطوات العمل','خطوات واضحة من اختيار الخدمة حتى استلام النتيجة.','Clear steps from choosing a service to receiving the result.','textarea',180],
    ['why_title','why','عنوان لماذا سند','لماذا سند؟','Why Sanad?','text',190],
    ['why_description','why','وصف لماذا سند','أكثر من مجرد منصة؛ شريكك في إنجاز معاملاتك.','More than a platform — your partner in getting work done.','textarea',200],
    ['system_title','system','عنوان سند للأعمال','نظام واحد يدير رحلة العمل كاملة','One system for the full work journey','text',210],
    ['system_description','system','وصف سند للأعمال','إدارة الطلبات والعملاء والقضايا والموظفين والخزنة والفواتير والتقارير في منصة واحدة.','Manage requests, clients, cases, staff, treasury, invoices and reports in one platform.','textarea',220],
    ['plans_title','plans','عنوان الباقات','باقات مرنة تناسب حجم مكتبك','Flexible plans for every office size','text',230],
    ['plans_description','plans','وصف الباقات','يحدد أدمن سند الباقة والمدة والوحدات والحدود لكل مكتب.','Sanad Admin controls each office plan, duration, modules and limits.','textarea',240],
    ['testimonials_title','social','عنوان آراء العملاء','آراء عملائنا','What our clients say','text',250],
    ['faq_title','social','عنوان الأسئلة','أسئلة شائعة','Frequently asked questions','text',260],
    ['cta_title','cta','عنوان الدعوة الأخيرة','جاهز تنجز معاملتك بخطوات واضحة؟','Ready to complete your work with clear steps?','text',270],
    ['cta_description','cta','وصف الدعوة الأخيرة','ابدأ الآن أو تواصل مع فريق سند لمساعدتك في اختيار الخدمة.','Start now or contact Sanad to choose the right service.','textarea',280]
  ].forEach((row) => insert.run(...row));
};
