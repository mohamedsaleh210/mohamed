# تقرير Responsive — سند v16.7.0

تاريخ الفحص: 2026-09-20

## 1. الملفات المعدلة

- `package.json`
- `package-lock.json`
- `views/partials/head.ejs`
- `views/partials/admin_head.ejs`
- `views/partials/footer.ejs`
- `views/admin/request_print.ejs`
- `public/js/admin.js`
- `public/css/responsive.css` (جديد)
- `public/css/responsive-admin.css` (جديد)
- `CHANGELOG-v16.7.0-RESPONSIVE-AR.md` (جديد)
- `RESPONSIVE-TEST-REPORT-v16.7.0-AR.md` (جديد)

## 2. المشكلات المعالجة

- اتساع محتوى لوحة التحكم عن شاشة الهاتف.
- بقاء Grid وFlex children على `min-width:auto` في مواضع تسبب overflow.
- ازدحام الفلاتر الأفقية والنماذج والبطاقات على 320–430px.
- عرض Sidebar داخل مساحة الهاتف بدل Drawer.
- القوائم المنسدلة والحوارات التي يمكن أن تتجاوز حدود الشاشة.
- صغر بعض touch targets وحقول iPhone التي تسبب Auto Zoom.
- الجداول التشغيلية التي كانت تُضغط كجدول Desktop على الهاتف.
- عدم تثبيت Safe Area و`100dvh` في الـDrawers والعناصر العائمة.
- إدارة تركيز Drawer وإغلاقه بـEscape/Overlay/الرابط ومنع تمرير الخلفية.

## 3. مصفوفة المقاسات

تمت مراجعة قواعد التدفق والـbreakpoints لتغطي: 320، 360، 375، 390، 393، 412، 414، 430، 480، 600، 768، 820، 1024، 1280، 1366، 1440، 1920 بكسل، وجميع القيم البينية عبر `clamp()` وGrid/Flex و`minmax()`.

تعذر تشغيل فحص Playwright المرئي الكامل لأن متصفح Chromium لم يتمكن من التنزيل داخل بيئة الاختبار (انتهاء مهلة المصدر ثم 502). لذلك لا يُسجل فحص Screenshot/Pixel لكل مقاس على أنه ناجح فعليًا؛ الفحص المنفذ هو فحص CSS/DOM وتشغيل HTTP فعلي.

## 4. الصفحات التي شُغلت فعليًا

### الموقع العام

`/`، `/services`، `/about`، `/consultations`، `/contact`، `/guides`، `/faq`، `/support`، `/login`، `/portal/login`، `/track`، `/request`، وصفحات الأقسام والخدمات الظاهرة في القائمة.

المسار `/appointments` أعاد 403 وفق حالة/سياسة البيانات الحالية، وليس 404. لم يُغيّر الإصدار هذه السياسة.

### لوحة الإدارة بعد تسجيل دخول حقيقي

Dashboard، Requests، Agenda، Appointments، Cases، Clients/Companies، Users، Performance، Payroll، Consultations Settings، Treasury، Revenue، Expenses، Custodies، Imports، Homepage CMS، Content/Services، Reports Identity، Security، Activity، Settings، Support، Renewals، Errands، Notifications، Account، Trash.

كل الروابط الظاهرة في تنقل لوحة الإدارة أعادت HTTP 200.

## 5. RTL وLTR

- طبقة العرض تستخدم logical properties (`margin-inline`، `inset-inline`، `padding-inline`).
- اتجاه Drawer يتغير حسب `dir`.
- قواعد RTL العربية وLTR الإنجليزية موجودة ومشتركة دون نسخة Mobile منفصلة.
- التحقق المرئي الكامل باللغة الإنجليزية عبر Chromium غير منفذ بسبب قيد المتصفح المذكور.

## 6. Horizontal Overflow

- تم منع overflow على مستوى الصفحة بواسطة قيود Fluid عامة و`min-width:0` للأطفال.
- الجداول التحليلية ذات `.table-scroll` فقط مسموح لها بتمرير داخلي.
- لم يمكن تنفيذ قياس `document.documentElement.scrollWidth` بمتصفح فعلي لكل صفحة بسبب عدم توفر Chromium؛ لذلك هذه النقطة غير معتمدة كاختبار Browser نهائي.

## 7. Console وNetwork

- `public/js/admin.js` اجتاز `node --check`.
- سجل الخادم أثناء جولة الصفحات: لا `TypeError` ولا `ReferenceError` ولا أخطاء غير معالجة.
- روابط لوحة الإدارة الظاهرة: لا 404.
- مسار `/office-panel/companies` غير موجود في النسخة الأساسية؛ إدارة الشركات موجودة ضمن `/office-panel/clients`، ولم يُنشأ Route جديد حفاظًا على نطاق UI فقط.
- Console browser الفعلي غير مختبر لعدم توفر Chromium.

## 8. اختبارات الانحدار

- تشغيل الخادم بنسخة مؤقتة من البيانات نجح.
- تسجيل دخول `adam` نجح وأعاد 302 إلى لوحة التحكم ثم 200.
- جولة GET لكل روابط القائمة الإدارية نجحت.
- `npm test` و`npm run integration` و`npm run security` لا تبدأ في النسخة الأصلية لأن `demo.js` المشار إليه في Test Harness غير موجود داخل الملف المرفق. هذا عيب سابق ومستقل عن تعديلات Responsive، ولم تتم إضافة ملف بيانات أو تغيير منطق الاختبار لأن نطاق الإصدار UI فقط.

## 9. سلامة البيانات

تطابقت SHA-256 قبل وبعد التعديل:

- `data/sanad.db`: `4deab6ea370ce508f80a705610f9ab5786085293c01b7aaf13cd55135446b1f3`
- `backups/pre-v16/sanad.db`: `765f8983a024e3dbfcd7def71e7054aa66e8f508022508d5894734e06a7d83ef`
- `backups/pre-v16/central.db`: `890c8dfbe1c926fc1e57eb8ac626ed1507dbdba6705ebbe30c6a8eed28570278`

لا توجد Migration، ولم تتغير بيانات الشركات أو الموظفين أو العملاء أو الطلبات.

## 10. نقاط غير مختبرة فعليًا

- Screenshot/Pixel comparison على جميع المقاسات المطلوبة.
- قياس `scrollWidth` داخل Chromium لكل صفحة ولكل عرض.
- Console browser وNetwork panel داخل Chromium.
- سيناريو Keyboard الحقيقي على iOS/Android.
- إرسال البريد وSMS لأنها خدمات خارجية.

