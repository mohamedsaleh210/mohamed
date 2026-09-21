# أساس PostgreSQL

الملف `001_foundation.sql` هو أول ترحيل للنواة المتكاملة، وليس بديلًا بعد عن جداول v14.2 السبعين.

## التشغيل

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/postgres/001_foundation.sql
```

بعد فتح اتصال لكل طلب يجب ضبط سياق المكتب داخل transaction:

```sql
SELECT set_config('app.tenant_id', '<tenant-uuid>', true);
SELECT set_config('app.platform_owner', 'false', true);
```

حساب مالك سند فقط يستخدم `app.platform_owner=true`. لا يعتمد التطبيق على `tenant_id` القادم من النموذج أو الرابط؛ يؤخذ من الجلسة/النطاق الموثق.

## قاعدة الأمان

كل جدول يحمل `tenant_id` يجب أن يفعّل RLS قبل إضافة أي مسار يقرأه أو يكتبه. نجاح شرط في كود Express وحده لا يكفي لعزل بيانات المكاتب.
