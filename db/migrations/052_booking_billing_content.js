exports.up=db=>db.exec(`
CREATE TABLE booking_invoices(id INTEGER PRIMARY KEY,booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id),number TEXT NOT NULL UNIQUE,amount REAL NOT NULL CHECK(amount>=0),issued_by INTEGER NOT NULL REFERENCES users(id),issued_at TEXT DEFAULT(datetime('now')));
INSERT OR IGNORE INTO homepage_sections(section_key,label_ar,label_en,visible,sort) VALUES('consultations','الاستشارات والمواعيد','Consultations and appointments',1,45);
INSERT OR IGNORE INTO homepage_content(content_key,group_key,label_ar,value_ar,value_en,input_type,sort) VALUES('consultations_title','consultations','عنوان الاستشارات','الاستشارات','Consultations','text',1);
INSERT OR IGNORE INTO homepage_content(content_key,group_key,label_ar,value_ar,value_en,input_type,sort) VALUES('consultations_description','consultations','وصف الاستشارات','اختر الخدمة ونوع الاستشارة والمكتب والموعد المناسب.','Choose a service, consultation type, office and appointment.','text',2);
`);
