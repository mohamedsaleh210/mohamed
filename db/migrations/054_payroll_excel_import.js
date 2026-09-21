exports.up=db=>db.exec(`
 CREATE TABLE payroll_import_batches(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  payroll_run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  rows_json TEXT NOT NULL,
  valid_count INTEGER NOT NULL DEFAULT 0,
  invalid_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'preview',
  created_by INTEGER REFERENCES users(id),
  applied_by INTEGER REFERENCES users(id),
  applied_at TEXT,
  created_at TEXT NOT NULL DEFAULT(datetime('now'))
 );
 CREATE INDEX payroll_import_run ON payroll_import_batches(payroll_run_id,status,created_at);
`);
