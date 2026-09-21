const {addColumn}=require('../migrate');
exports.up=db=>{
 addColumn(db,'requests','completed_at','TEXT');
 db.exec(`
 CREATE TABLE IF NOT EXISTS performance_rules(
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  target_percent REAL NOT NULL DEFAULT 90,
  bonus_amount REAL NOT NULL DEFAULT 0,
  deduction_per_overdue REAL NOT NULL DEFAULT 0,
  notes TEXT,updated_by INTEGER REFERENCES users(id),updated_at TEXT DEFAULT(datetime('now'))
 );
 CREATE TABLE IF NOT EXISTS performance_reviews(
  id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id),
  period_from TEXT NOT NULL,period_to TEXT NOT NULL,assigned_count INTEGER DEFAULT 0,
  completed_count INTEGER DEFAULT 0,on_time_count INTEGER DEFAULT 0,late_count INTEGER DEFAULT 0,
  overdue_count INTEGER DEFAULT 0,score REAL DEFAULT 0,recommended_bonus REAL DEFAULT 0,
  recommended_deduction REAL DEFAULT 0,approved_bonus REAL DEFAULT 0,approved_deduction REAL DEFAULT 0,
  decision TEXT NOT NULL DEFAULT 'pending',notes TEXT,reviewed_by INTEGER REFERENCES users(id),
  reviewed_by_label TEXT,paid_at TEXT,created_at TEXT DEFAULT(datetime('now')),updated_at TEXT DEFAULT(datetime('now')),
  UNIQUE(user_id,period_from,period_to)
 );
 CREATE INDEX IF NOT EXISTS idx_performance_period ON performance_reviews(period_from,period_to,user_id);
 `);
};
