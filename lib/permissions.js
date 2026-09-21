/**
 * Permissions.
 *
 * Before this file there were sixty-one hand-written checks spread over twenty
 * modules — `role === 'admin'` here, `['admin','supervisor'].includes(...)`
 * there, a `requireSupervisor` somewhere else. Nothing said, in one place, who
 * may do what. That is how a page ends up hiding a button while the route
 * behind it still accepts the request.
 *
 * The model is roles as templates plus per-person exceptions: the role covers
 * almost everyone, and an individual can be granted or denied a single ability
 * without inventing a new role for them.
 *
 * An admin is deliberately outside the system. Someone has to be able to fix a
 * misconfiguration, and that someone cannot be locked out by it.
 */

/**
 * Everything the application can do, grouped the way the permissions screen
 * presents it. `label` is what an admin reads; `note` explains the consequence
 * where it is not obvious.
 */
const CATALOGUE = {
  requests: {
    label: 'الطلبات',
    items: {
      'requests.view_all': {
        label: 'يشوف كل الطلبات',
        note: 'من غيرها بيشوف الطلبات المعيّن عليها فقط.',
      },
      'requests.create': { label: 'يفتح طلب لعميل' },
      'requests.edit': { label: 'يعدّل الحالة والعنوان والموعد' },
      'requests.assign': { label: 'يعيّن ويشيل محامين' },
      'requests.critical': { label: 'يعلّم الطلب كعاجل' },
      'requests.archive': { label: 'يؤرشف الطلبات' },
      'requests.delete': { label: 'يحذف الطلبات', note: 'الحذف بيروح لسلة المحذوفات.' },
      'comments.moderate': {
        label: 'يشطب تعليقات غيره',
        note: 'كل موظف بيقدر يشطب تعليقه هو دايماً.',
      },
      'documents.manage': { label: 'يرفع ويحذف مستندات' },
      'requirements.manage': { label: 'يطلب مستندات من العميل' },
      'requests.export': { label: 'يصدّر تقارير الطلبات Excel وPDF' },
    },
  },

  cases: {
    label: 'إدارة مكتب المحاماة',
    items: {
      'cases.view_all': { label: 'يشوف كل القضايا', note: 'من غيرها يشوف القضايا المعيّن عليها فقط.' },
      'cases.create': { label: 'ينشئ قضية من طلب' },
      'cases.edit': { label: 'يعدّل بيانات القضية وحالتها' },
      'cases.assign': { label: 'يعيّن فريق القضية' },
      'cases.hearings': { label: 'يدير الجلسات والقرارات' },
      'cases.tasks': { label: 'يدير أعمال وطلبات القضايا' },
      'cases.parties': { label: 'يدير أطراف القضية' },
      'cases.report': { label: 'يطبع تقرير القضية الكامل' },
    },
  },

  money: {
    label: 'الفلوس',
    items: {
      'money.view': {
        label: 'يشوف الأتعاب والمدفوع',
        note: 'من غيرها مش بيشوف أي رقم مالي في أي مكان.',
      },
      'money.fees': { label: 'يعدّل بنود الأتعاب' },
      'money.payments': { label: 'يسجّل ويلغي الدفعات' },
      'money.discount': { label: 'يعمل خصم' },
      'money.write_off': { label: 'يعدم ديون' },
      'revenue.view': { label: 'يفتح صفحة الإيرادات' },
      'revenue.export': { label: 'يصدّر تقارير الإيرادات Excel وPDF' },
      'treasury.view': { label: 'يشوف الخزنة وحركتها' },
      'treasury.manage': { label: 'يسجّل وارد الخزنة', note: 'صلاحية مالية تؤثر في الرصيد.' },
      'treasury.export': { label: 'يصدّر تقارير الخزنة Excel وPDF' },
    },
  },

  expenses: {
    label: 'المصاريف',
    items: {
      'expenses.add': {
        label: 'يضيف مصاريف على طلباته',
        note: 'على الطلبات المعيّن عليها.',
      },
      'expenses.view_all': { label: 'يشوف مصاريف كل الموظفين' },
      'expenses.manage': {
        label: 'يعتمد ويصرف المصاريف',
        note: 'يعلّم المصروف إنه اتصرف للموظف.',
      },
      'expenses.custody': { label: 'يدير عهد الموظفين', note: 'صلاحية قديمة شاملة.' },
      'custody.view_all': { label: 'يشاهد جميع العهد' },
      'custody.view_own': { label: 'يشاهد عهدته فقط' },
      'custody.create': { label: 'ينشئ طلب عهدة' },
      'custody.approve': { label: 'يعتمد العهدة' },
      'custody.disburse': { label: 'يصرف العهدة من الخزنة' },
      'custody.receive': { label: 'يؤكد استلام عهدته' },
      'custody.expense': { label: 'يسجل مصروفًا من عهدته' },
      'custody.review_expense': { label: 'يعتمد أو يرفض مصروف العهدة' },
      'custody.return': { label: 'يدير مرتجع العهدة' },
      'custody.close': { label: 'يسوي ويغلق العهدة' },
      'custody.reverse': { label: 'يلغي أو يعكس العهدة', note: 'صلاحية مالية عالية الخطورة.' },
      'custody.attachments': { label: 'يشاهد مرفقات مصروفات العهدة' },
      'custody.export': { label: 'يصدّر تقارير العهد' },
      'expenses.export': { label: 'يصدّر تقارير المصروفات والعهد Excel وPDF' },
    },
  },

  performance: {
    label: 'تقييم الموظفين',
    items: {
      'performance.view': { label: 'يشوف تقييم الإنجاز والمكافآت والخصومات' },
      'performance.manage': { label: 'يعتمد قواعد التقييم والمكافآت والخصومات', note: 'صلاحية مالية وإدارية.' },
      'performance.export': { label: 'يصدّر تقارير التقييم Excel وPDF' },
    },
  },

  payroll: {
    label: 'المرتبات والمكافآت والحوافز',
    items: {
      'payroll.view_own': { label: 'يشوف ويطبع سند راتبه فقط' },
      'payroll.view_all': { label: 'يشوف رواتب جميع الموظفين', note: 'بيانات مالية سرية.' },
      'payroll.manage': { label: 'يعرّف الرواتب وينشئ ويعدّل سند صرف المرتبات' },
      'payroll.approve': { label: 'يعتمد سند صرف المرتبات', note: 'يفضل أن يكون المعتمد غير مُعدّ السند.' },
      'payroll.pay': { label: 'يصرف المرتبات من الخزنة', note: 'ينشئ حركة منصرف فعلية في الخزنة.' },
      'payroll.export': { label: 'يصدّر كشف المرتبات Excel وPDF' },
    },
  },

  clients: {
    label: 'العملاء',
    items: {
      'clients.directory': { label: 'يفتح دليل العملاء' },
      'clients.file': { label: 'يفتح ملف العميل وكل طلباته' },
      'clients.edit': { label: 'يعدّل بيانات العميل', note: 'الاسم ورقم الموبايل والبريد وصفة مقدم الطلب.' },
      'clients.export': { label: 'يصدّر تقارير العملاء والشركات Excel وPDF' },
    },
  },

  errands: {
    label: 'المشاوير',
    items: {
      'errands.view': { label: 'يشوف المشاوير والجهات' },
      'errands.manage': { label: 'يضيف جهات ويخطط مشاوير' },
      'errands.export': { label: 'يصدّر تقارير المشاوير Excel وPDF' },
    },
  },

  agenda: {
    label: 'أجندة الأعمال والتجديدات',
    items: {
      'agenda.view': { label: 'يشوف أجندة الأعمال' },
      'bookings.create': { label: 'ينشئ موعدًا أو استشارة نيابةً عن العميل' },
      'bookings.manage': { label: 'إدارة الحجوزات وتعيين الموظفين وإعادة الجدولة' },
      'agenda.manage': { label: 'يضيف أعمالًا ومواعيد ويغيّر حالتها' },
      'agenda.export': { label: 'يصدّر تقارير الأجندة Excel وPDF' },
      'renewals.view': { label: 'يشوف مواعيد الانتهاء والتجديد' },
      'renewals.export': { label: 'يصدّر تقارير الانتهاء والتجديد Excel وPDF' },
    },
  },

  support: {
    label: 'الدعم الفني',
    items: {
      'support.view': { label: 'يشوف تذاكر الدعم المسموح بها' },
      'support.view_all': { label: 'يشوف كل تذاكر الدعم' },
      'support.create': { label: 'يفتح تذكرة نيابةً عن العميل' },
      'support.reply': { label: 'يرد على التذاكر' },
      'support.assign': { label: 'يعيّن ويحوّل مسؤولي التذكرة' },
      'support.manage': { label: 'يغيّر الحالة والأولوية والموعد' },
      'support.internal': { label: 'يشوف ويضيف الملاحظات الداخلية' },
      'support.close': { label: 'يغلق أو يعيد فتح التذكرة' },
      'support.reports': { label: 'يشوف ويصدّر تقارير الدعم الفني' },
    },
  },

  content: {
    label: 'المحتوى',
    items: {
      'content.manage': { label: 'يعدّل الصفحات والأقسام والخدمات' },
      'contacts.manage': { label: 'يعدّل بيانات التواصل' },
      'social.manage': { label: 'يعدّل حسابات التواصل' },
    },
  },

  /*
   * Erasing things for good.
   *
   * A group of its own, because these are the only actions in the system that
   * destroy data rather than hide it — and because bundling them with "manages
   * staff" meant the office had to make somebody an administrator just to let
   * them clean up a duplicate entry.
   */
  erase: {
    label: 'الحذف النهائي',
    items: {
      'clients.erase': {
        label: 'يحذف عميل نهائياً',
        note: 'بيمسح الحساب وكل طلباته والصور من السيرفر. مفيش تراجع.',
      },
      'requests.erase': {
        label: 'يحذف طلب من الأرشيف نهائياً',
        note: 'تحصيل الطلب بينزل من أرقام الإيرادات. مفيش تراجع.',
      },
    },
  },

  admin: {
    label: 'الإدارة',
    items: {
      'users.view': {
        label: 'يشوف ملفات الموظفين',
        note: 'البيانات وصورة البطاقة والشغل الحالي — من غير تعديل.',
      },
      'users.manage': {
        label: 'يدير الموظفين وصلاحياتهم',
        note: 'صلاحية خطيرة — اللي معاه ده يقدر يدي نفسه أي حاجة.',
      },
      'users.export': { label: 'يصدّر تقارير الموظفين Excel وPDF' },
      'report_profiles.manage': { label: 'يدير شعارات وبيانات وهوية التقارير' },
      'settings.manage': { label: 'يعدّل الإعدادات' },
      'security.view': { label: 'يشوف الأمان وسجل الدخول' },
      'activity.view': { label: 'يشوف سجل النشاط' },
      'trash.restore': { label: 'يسترجع من سلة المحذوفات' },
    },
  },
};

/** Flat list, for validation and for iterating. */
const ALL = Object.values(CATALOGUE).flatMap((g) => Object.keys(g.items));

const labelOf = (key) => {
  for (const group of Object.values(CATALOGUE)) {
    if (group.items[key]) return group.items[key].label;
  }
  return key;
};

/**
 * What each role can do out of the box.
 *
 * Admin is absent on purpose — it is not a set of permissions, it is the
 * absence of a limit. Encoding it as a list would mean a new ability could be
 * added and silently not granted to the person responsible for the system.
 */
const ROLE_DEFAULTS = {
  supervisor: [
    'bookings.create', 'bookings.manage',
    'requests.view_all', 'requests.create', 'requests.edit', 'requests.assign',
    'requests.critical', 'requests.archive', 'requests.delete', 'requests.export',
    'comments.moderate', 'documents.manage', 'requirements.manage',
    'money.view', 'money.fees', 'money.payments', 'money.discount',
    'money.write_off', 'revenue.view', 'revenue.export',
    'treasury.view', 'treasury.manage', 'treasury.export',
    'expenses.add', 'expenses.view_all', 'expenses.manage', 'expenses.custody', 'expenses.export', 'custody.view_all','custody.create','custody.approve','custody.disburse','custody.review_expense','custody.return','custody.close','custody.reverse','custody.attachments','custody.export',
    'clients.directory', 'clients.file', 'clients.edit', 'clients.export',
    'errands.view', 'errands.manage', 'errands.export',
    'agenda.view', 'agenda.manage', 'agenda.export', 'renewals.view', 'renewals.export',
    'support.view', 'support.view_all', 'support.create', 'support.reply', 'support.assign',
    'support.manage', 'support.internal', 'support.close', 'support.reports',
    'content.manage', 'contacts.manage', 'social.manage',
    'security.view', 'activity.view', 'trash.restore',
    'users.view', 'users.export', 'report_profiles.manage',
    'performance.view', 'performance.manage', 'performance.export',
    'cases.view_all', 'cases.create', 'cases.edit', 'cases.assign',
    'cases.hearings', 'cases.tasks', 'cases.parties', 'cases.report',
    // Deliberately not clients.erase or requests.erase: destroying records is
    // granted to a person, never inherited from a job title.
  ],

  lawyer: [
    // Deliberately not requests.view_all: a lawyer sees their own files.
    'requests.edit', 'requests.critical', 'requests.export',
    'documents.manage', 'requirements.manage',
    'expenses.add', 'custody.view_own','custody.receive','custody.expense','custody.return','custody.attachments',
    'errands.view',
    'cases.edit', 'cases.hearings', 'cases.tasks', 'cases.parties', 'cases.report',
    'agenda.view', 'agenda.manage',
    'support.view', 'support.create', 'support.reply',
  ],

  accountant: [
    'money.view', 'revenue.view', 'revenue.export',
    'treasury.view', 'treasury.manage', 'treasury.export',
    'expenses.view_all', 'expenses.export', 'custody.view_all','custody.create','custody.approve','custody.disburse','custody.review_expense','custody.return','custody.close','custody.attachments','custody.export',
    'performance.view', 'performance.export',
    'payroll.view_own', 'payroll.view_all', 'payroll.manage', 'payroll.pay', 'payroll.export',
  ],
};

const isAdmin = (user) => !!user && user.role === 'admin';

/**
 * Resolves what a person may do: their role's defaults, plus anything granted
 * to them individually, minus anything revoked from them individually.
 *
 * Revocations are applied last so that taking something away from one person
 * always works, whatever their role says.
 */
function permissionsFor(user, overrides = []) {
  if (!user) return new Set();
  if (isAdmin(user)) return new Set(ALL);

  const set = new Set(ROLE_DEFAULTS[user.role] || []);

  overrides.forEach((o) => {
    if (!ALL.includes(o.permission)) return;
    if (o.granted) set.add(o.permission);
    else set.delete(o.permission);
  });

  return set;
}

/** Loads the overrides for one account. */
function overridesFor(db, userId) {
  return db
    .prepare('SELECT permission, granted FROM user_permissions WHERE user_id = ?')
    .all(userId)
    .map((r) => ({ permission: r.permission, granted: !!r.granted }));
}

/** The whole picture for one account, ready for a session or a screen. */
function resolve(db, user) {
  if (!user) return new Set();
  if (isAdmin(user)) return new Set(ALL);
  return permissionsFor(user, overridesFor(db, user.id));
}

/**
 * Describes one person's permissions for the management screen: what the role
 * gives, what was added, what was taken away.
 */
function describe(db, user) {
  const defaults = new Set(ROLE_DEFAULTS[user.role] || []);
  const overrides = new Map(overridesFor(db, user.id).map((o) => [o.permission, o.granted]));

  const rows = [];
  Object.entries(CATALOGUE).forEach(([groupKey, group]) => {
    Object.entries(group.items).forEach(([key, item]) => {
      const byRole = defaults.has(key);
      const override = overrides.has(key) ? overrides.get(key) : null;

      rows.push({
        group: groupKey,
        groupLabel: group.label,
        key,
        label: item.label,
        note: item.note || null,
        byRole,
        override,
        effective: override === null ? byRole : override,
      });
    });
  });

  return rows;
}

module.exports = {
  CATALOGUE,
  ALL,
  ROLE_DEFAULTS,
  labelOf,
  isAdmin,
  permissionsFor,
  overridesFor,
  resolve,
  describe,
};
