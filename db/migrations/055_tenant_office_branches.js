const {addColumn}=require('../migrate');
exports.up=db=>{
 db.exec(`CREATE TABLE IF NOT EXISTS office_branches(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,code TEXT,active INTEGER NOT NULL DEFAULT 1,is_main INTEGER NOT NULL DEFAULT 0,created_at TEXT DEFAULT(datetime('now')));CREATE UNIQUE INDEX IF NOT EXISTS idx_office_branches_name ON office_branches(lower(name));CREATE TABLE IF NOT EXISTS platform_access_nonces(nonce TEXT PRIMARY KEY,used_at TEXT DEFAULT(datetime('now')));`);
 if(!db.prepare('SELECT 1 FROM office_branches LIMIT 1').get())db.prepare("INSERT INTO office_branches(name,code,active,is_main) VALUES('الفرع الرئيسي','MAIN',1,1)").run();
 ['users','clients','companies','company_branches','requests','legal_cases','agenda_events','data_import_batches','report_profiles','report_exports'].forEach(t=>addColumn(db,t,'office_branch_id','INTEGER REFERENCES office_branches(id)'));
 const main=db.prepare('SELECT id FROM office_branches WHERE is_main=1 ORDER BY id LIMIT 1').get();
 if(main) ['users','clients','companies','company_branches','requests','legal_cases','agenda_events','data_import_batches','report_profiles','report_exports'].forEach(t=>db.prepare(`UPDATE ${t} SET office_branch_id=? WHERE office_branch_id IS NULL`).run(main.id));
 db.exec('CREATE INDEX IF NOT EXISTS idx_import_branch ON data_import_batches(office_branch_id,created_at DESC);CREATE INDEX IF NOT EXISTS idx_report_profile_branch ON report_profiles(office_branch_id,is_default DESC,name)');
};
