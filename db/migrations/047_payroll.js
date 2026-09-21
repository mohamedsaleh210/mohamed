const { addColumn } = require('../migrate');

exports.up = (db) => {
  addColumn(db, 'treasury_transactions', 'payroll_item_id', 'INTEGER REFERENCES payroll_items(id)');
  db.exec(`
    CREATE TABLE IF NOT EXISTS salary_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      basic_salary REAL NOT NULL DEFAULT 0,
      housing_allowance REAL NOT NULL DEFAULT 0,
      transport_allowance REAL NOT NULL DEFAULT 0,
      fixed_allowance REAL NOT NULL DEFAULT 0,
      insurance_default REAL NOT NULL DEFAULT 0,
      tax_default REAL NOT NULL DEFAULT 0,
      bank_name TEXT,
      iban TEXT,
      payment_method TEXT NOT NULL DEFAULT 'bank',
      notes TEXT,
      updated_by INTEGER REFERENCES users(id),
      updated_at TEXT NOT NULL DEFAULT(datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payroll_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_by_label TEXT,
      approved_by INTEGER REFERENCES users(id),
      approved_by_label TEXT,
      approved_at TEXT,
      created_at TEXT NOT NULL DEFAULT(datetime('now')),
      updated_at TEXT NOT NULL DEFAULT(datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payroll_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payroll_run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      employee_name TEXT NOT NULL,
      job_title TEXT,
      national_id TEXT,
      basic_salary REAL NOT NULL DEFAULT 0,
      housing_allowance REAL NOT NULL DEFAULT 0,
      transport_allowance REAL NOT NULL DEFAULT 0,
      fixed_allowance REAL NOT NULL DEFAULT 0,
      performance_bonus REAL NOT NULL DEFAULT 0,
      exceptional_incentive REAL NOT NULL DEFAULT 0,
      overtime_amount REAL NOT NULL DEFAULT 0,
      other_earning REAL NOT NULL DEFAULT 0,
      absence_deduction REAL NOT NULL DEFAULT 0,
      lateness_deduction REAL NOT NULL DEFAULT 0,
      penalty_deduction REAL NOT NULL DEFAULT 0,
      advance_deduction REAL NOT NULL DEFAULT 0,
      insurance_deduction REAL NOT NULL DEFAULT 0,
      tax_deduction REAL NOT NULL DEFAULT 0,
      other_deduction REAL NOT NULL DEFAULT 0,
      earning_note TEXT,
      deduction_note TEXT,
      gross_amount REAL NOT NULL DEFAULT 0,
      total_deductions REAL NOT NULL DEFAULT 0,
      net_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      treasury_id INTEGER REFERENCES treasuries(id),
      payment_method TEXT,
      payment_reference TEXT,
      paid_at TEXT,
      paid_by INTEGER REFERENCES users(id),
      paid_by_label TEXT,
      created_at TEXT NOT NULL DEFAULT(datetime('now')),
      updated_at TEXT NOT NULL DEFAULT(datetime('now')),
      UNIQUE(payroll_run_id,user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_payroll_items_run ON payroll_items(payroll_run_id,status,user_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_items_user ON payroll_items(user_id,payroll_run_id);
  `);
};
