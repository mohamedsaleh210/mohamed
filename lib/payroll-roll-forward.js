const { db } = require('../db');

const stableFields = [
  'basic_salary', 'housing_allowance', 'transport_allowance', 'fixed_allowance',
  'insurance_deduction', 'tax_deduction',
];

const amount = (value) => Math.max(0, Math.round(Number(value || 0) * 100) / 100);

function rollForward(sourceId, targetPeriod, actor) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(targetPeriod || ''))) throw new Error('period');
  const source = db.prepare('SELECT * FROM payroll_runs WHERE id=?').get(sourceId);
  if (!source) throw new Error('not_found');
  if (db.prepare('SELECT 1 FROM payroll_runs WHERE period=?').get(targetPeriod)) throw new Error('exists');

  const items = db.prepare(`SELECT i.* FROM payroll_items i JOIN users u ON u.id=i.user_id
    WHERE i.payroll_run_id=? AND u.active=1 ORDER BY i.employee_name`).all(source.id);

  return db.transaction(() => {
    const result = db.prepare(`INSERT INTO payroll_runs(period,title,notes,created_by,created_by_label)
      VALUES(?,?,?,?,?)`).run(targetPeriod, `سند صرف مرتب ${targetPeriod}`,
      `تم ترحيل البيانات الثابتة من ${source.period}`, actor.id, actor.display_name);
    const runId = Number(result.lastInsertRowid);
    const insert = db.prepare(`INSERT INTO payroll_items(
      payroll_run_id,user_id,employee_name,job_title,national_id,basic_salary,housing_allowance,
      transport_allowance,fixed_allowance,insurance_deduction,tax_deduction,gross_amount,
      total_deductions,net_amount) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

    for (const item of items) {
      const values = Object.fromEntries(stableFields.map((field) => [field, amount(item[field])]));
      const gross = values.basic_salary + values.housing_allowance + values.transport_allowance + values.fixed_allowance;
      const deductions = values.insurance_deduction + values.tax_deduction;
      insert.run(runId, item.user_id, item.employee_name, item.job_title, item.national_id,
        values.basic_salary, values.housing_allowance, values.transport_allowance, values.fixed_allowance,
        values.insurance_deduction, values.tax_deduction, gross, deductions, Math.max(0, gross - deductions));
    }
    return { id: runId, source, targetPeriod, employeeCount: items.length };
  })();
}

module.exports = { rollForward, stableFields };
