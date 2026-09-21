const {addColumn}=require('../migrate');
exports.up=db=>{
 addColumn(db,'audit_log','ip','TEXT');
 addColumn(db,'audit_log','latitude','REAL');
 addColumn(db,'audit_log','longitude','REAL');
 db.exec(`
  CREATE TABLE IF NOT EXISTS treasuries(
   id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,currency TEXT DEFAULT 'EGP',active INTEGER DEFAULT 1,created_at TEXT DEFAULT(datetime('now'))
  );
 `);
 addColumn(db,'staff_custodies','treasury_id','INTEGER REFERENCES treasuries(id)');
 addColumn(db,'staff_custodies','custody_type',"TEXT DEFAULT 'operational'");
 db.exec(`
  CREATE TABLE IF NOT EXISTS treasury_transactions(
   id INTEGER PRIMARY KEY AUTOINCREMENT,treasury_id INTEGER NOT NULL REFERENCES treasuries(id),direction TEXT NOT NULL,
   amount REAL NOT NULL,transaction_date TEXT NOT NULL,method TEXT,source_name TEXT,purpose TEXT,reference TEXT,
   custody_id INTEGER REFERENCES staff_custodies(id),recorded_by_id INTEGER REFERENCES users(id),recorded_by TEXT,
   voided_at TEXT,void_reason TEXT,created_at TEXT DEFAULT(datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_treasury_tx ON treasury_transactions(treasury_id,transaction_date,id);
 `);
 db.exec(`INSERT INTO treasuries(name,currency) SELECT 'الخزنة الرئيسية','EGP' WHERE NOT EXISTS(SELECT 1 FROM treasuries);`);
};
