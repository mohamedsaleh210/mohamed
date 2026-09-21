#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ExcelJS = require('exceljs');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sanad-payroll-test-'));
require('./db/migrate').migrate({ quiet: true });
require('./db/seed')();
const { db } = require('./db');
const payrollImport = require('./lib/payroll-import');
const { rollForward } = require('./lib/payroll-roll-forward');

(async () => {
  const admin = db.prepare('SELECT * FROM users ORDER BY id LIMIT 1').get();
  assert(admin, 'لم يتم إنشاء مستخدم الاختبار');
  db.prepare(`UPDATE users SET active=1, legal_name='موظف اختبار', national_id='29901010101010' WHERE id=?`).run(admin.id);
  const runId = Number(db.prepare(`INSERT INTO payroll_runs(period,title,status,created_by,created_by_label)
    VALUES('2098-01','سند اختبار Excel','draft',?,?)`).run(admin.id, admin.display_name).lastInsertRowid);
  db.prepare(`INSERT INTO payroll_items(payroll_run_id,user_id,employee_name,national_id,basic_salary,
    housing_allowance,performance_bonus,absence_deduction,insurance_deduction,gross_amount,total_deductions,net_amount)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(runId, admin.id, 'موظف اختبار', '29901010101010', 5000, 500, 200, 50, 100, 5700, 150, 5550);

  const template = Buffer.from(await payrollImport.template(runId));
  assert(template.length > 5000, 'قالب Excel غير صالح');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template);
  const sheet = workbook.getWorksheet('سند صرف المرتب');
  assert(sheet && sheet.getCell('C5').value === '29901010101010', 'بيانات الموظف غير موجودة بالقالب');
  sheet.getCell('D5').value = 5250;
  sheet.getCell('H5').value = 350;
  const edited = Buffer.from(await workbook.xlsx.writeBuffer());
  const rows = await payrollImport.parse(edited, runId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].errors.length, 0);
  assert(rows[0].changes.length >= 2, 'المعاينة لم تعرض الفروقات');

  const token = payrollImport.save(admin.id, runId, 'اختبار.xlsx', edited, rows);
  assert.equal(payrollImport.batch(token, admin.id).valid_count, 1);
  payrollImport.apply(token, admin.id);
  const applied = db.prepare('SELECT * FROM payroll_items WHERE payroll_run_id=?').all(runId);
  assert.equal(applied.length, 1, 'الاستيراد كرر الموظف');
  assert.equal(applied[0].basic_salary, 5250);
  assert.equal(applied[0].performance_bonus, 350);
  assert.equal(payrollImport.batch(token, admin.id), null, 'سمح بتطبيق الملف مرتين');

  const next = rollForward(runId, '2098-02', admin);
  assert.equal(next.employeeCount, 1);
  const carried = db.prepare('SELECT * FROM payroll_items WHERE payroll_run_id=?').get(next.id);
  assert.equal(carried.basic_salary, 5250, 'لم يرحل المرتب الأساسي');
  assert.equal(carried.performance_bonus, 0, 'رحّل مكافأة متغيرة بالخطأ');
  assert.equal(carried.absence_deduction, 0, 'رحّل خصمًا متغيرًا بالخطأ');
  assert.equal(carried.insurance_deduction, 100, 'لم يرحل الخصم الثابت');

  console.log('✓ payroll Excel template, preview, apply, and de-duplication');
  console.log('✓ payroll stable-value roll-forward and variable-value reset');
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
