/**
 * The service catalogue.
 *
 * Single source of truth: the seed reads this on a fresh install and a
 * migration replaces the old catalogue with it on existing databases.
 * Editing this file changes nothing on its own — services are managed from
 * the admin panel once they exist.
 */
module.exports = [
  {
    name_ar: 'تراخيص البناء والعقارات',
    name_en: 'Building & Property Licenses',
    desc_ar: 'تراخيص البناء والتعلية والترميم والهدم وتصحيح أوضاع المباني وتغيير الاستخدام.',
    desc_en:
      'Building, extension, renovation and demolition licenses, plus compliance and change-of-use.',
    services: [
      {
        title_ar: 'تراخيص البناء',
        title_en: 'Building Licenses',
        body_ar:
          'نتولى متابعة طلبات تراخيص البناء واستكمال المستندات الهندسية والموافقات والإجراءات الإدارية المطلوبة.',
        body_en:
          'We assist with building license applications and follow up on the required engineering documents and administrative approvals.',
      },
      {
        title_ar: 'تراخيص التعلية وزيادة الغرف',
        title_en: 'Vertical Extensions & Additional Rooms Licenses',
        body_ar:
          'نتولى دراسة ومتابعة إجراءات ترخيص إضافة الأدوار أو الغرف أو التوسعات الإنشائية وفقًا للاشتراطات المطبقة.',
        body_en:
          'We assess and follow up on licensing procedures for additional floors, rooms or structural extensions according to the applicable requirements.',
      },
      {
        title_ar: 'تراخيص الترميم والتعديل',
        title_en: 'Renovation & Modification Licenses',
        body_ar:
          'نتولى إجراءات استخراج تراخيص الترميم والتدعيم الإنشائي وإجراء التعديلات على المباني القائمة.',
        body_en:
          'We assist with obtaining licenses for renovation, structural reinforcement and modifications to existing buildings.',
      },
      {
        title_ar: 'تراخيص الهدم وإعادة البناء',
        title_en: 'Demolition & Reconstruction Licenses',
        body_ar:
          'نتولى إجراءات استخراج تراخيص الهدم الجزئي أو الكلي ومتابعة الموافقات اللازمة لإعادة البناء.',
        body_en:
          'We handle the procedures required for partial or complete demolition licenses and subsequent reconstruction approvals.',
      },
      {
        title_ar: 'تصحيح أوضاع المباني والمنشآت',
        title_en: 'Building Compliance & Legalization',
        body_ar:
          'نراجع الموقف القانوني والترخيصي للمباني والمنشآت ونتابع الإجراءات والمستندات اللازمة لتوفيق أوضاعها.',
        body_en:
          'We review the legal and licensing status of buildings and establishments and follow up on the procedures required to regularize their status.',
      },
      {
        title_ar: 'تغيير استخدام العقار',
        title_en: 'Property Use Change',
        body_ar:
          'نتولى تقديم ومتابعة طلبات تغيير الاستخدام المعتمد للعقار والحصول على الموافقات الفنية والإدارية اللازمة.',
        body_en:
          "We assist with applications to change a property's approved use and obtain the necessary technical and administrative approvals.",
      },
    ],
  },
  {
    name_ar: 'خدمات المرافق',
    name_en: 'Utility Services',
    desc_ar: 'توصيل الكهرباء والمياه والغاز، وزيادة القدرة، ونقل وتعديل بيانات العدادات.',
    desc_en:
      'Electricity, water and gas connections, capacity upgrades, and meter transfers and amendments.',
    services: [
      {
        title_ar: 'توصيل الكهرباء وتركيب العدادات',
        title_en: 'Electricity Connection & Meter Installation',
        body_ar:
          'نتولى تقديم ومتابعة طلبات توصيل الكهرباء وتركيب العدادات للعقارات والمنشآت السكنية والتجارية والصناعية.',
        body_en:
          'We submit and follow up on electricity connection and meter installation applications for residential, commercial and industrial properties.',
      },
      {
        title_ar: 'زيادة القدرة الكهربائية',
        title_en: 'Electrical Capacity Upgrade',
        body_ar:
          'نتولى تقديم ومتابعة طلبات زيادة القدرة الكهربائية بما يتناسب مع احتياجات تشغيل العقار أو المنشأة.',
        body_en:
          "We handle applications to increase electrical capacity according to the property's or establishment's operating requirements.",
      },
      {
        title_ar: 'نقل أو تعديل بيانات عداد الكهرباء',
        title_en: 'Electricity Meter Transfer & Data Amendment',
        body_ar:
          'نتابع إجراءات نقل ملكية عداد الكهرباء وتغيير اسم المشترك وتعديل بيانات العداد والحساب.',
        body_en:
          'We follow up on electricity meter ownership transfers, customer name changes and amendments to meter and account information.',
      },
      {
        title_ar: 'توصيل المياه والصرف الصحي',
        title_en: 'Water & Sewage Connection',
        body_ar:
          'نتولى تقديم ومتابعة طلبات توصيل المياه والصرف الصحي وتركيب عدادات المياه أو تعديل بياناتها.',
        body_en:
          'We submit and follow up on water and sewage connection applications and water meter installation or data amendment procedures.',
      },
      {
        title_ar: 'توصيل الغاز الطبيعي',
        title_en: 'Natural Gas Connection',
        body_ar:
          'نتولى تقديم ومتابعة طلبات توصيل الغاز الطبيعي للعقارات السكنية والتجارية واستكمال الإجراءات المطلوبة.',
        body_en:
          'We assist with natural gas connection applications for residential and commercial properties and follow up on the required procedures.',
      },
      {
        title_ar: 'متابعة طلبات المرافق والمتطلبات الفنية',
        title_en: 'Utility Applications Follow-up',
        body_ar:
          'نتابع طلبات المرافق والمعاينات الفنية والمتطلبات الناقصة والموافقات اللازمة حتى استكمال الإجراءات.',
        body_en:
          'We follow up on utility applications, technical inspections, missing requirements and necessary approvals until completion.',
      },
    ],
  },
  {
    name_ar: 'العقود والخدمات القانونية',
    name_en: 'Contracts & Legal Services',
    desc_ar: 'صياغة ومراجعة كل أنواع العقود، والفحص القانوني قبل التوقيع.',
    desc_en: 'Drafting and reviewing every kind of agreement, plus pre-signature legal due diligence.',
    services: [
      {
        title_ar: 'عقود البيع والشراء',
        title_en: 'Sale & Purchase Agreements',
        body_ar:
          'نقوم بصياغة ومراجعة عقود البيع والشراء بما يوضح حقوق والتزامات الأطراف وشروط السداد وإجراءات التسليم ونقل الملكية.',
        body_en:
          "We draft and review sale and purchase agreements to define the parties' rights, obligations, payment terms, delivery and ownership transfer procedures.",
      },
      {
        title_ar: 'عقود الإيجار السكني والتجاري',
        title_en: 'Residential & Commercial Lease Agreements',
        body_ar:
          'نقوم بصياغة ومراجعة عقود الإيجار السكني والتجاري بما يحفظ حقوق المؤجر والمستأجر وينظم مدة الإيجار والالتزامات المالية.',
        body_en:
          'We draft and review residential and commercial lease agreements to protect the rights of landlords and tenants and regulate their obligations.',
      },
      {
        title_ar: 'عقود المقاولات والتشطيبات',
        title_en: 'Construction & Finishing Contracts',
        body_ar:
          'نقوم بصياغة عقود المقاولات والتشطيبات وتحديد نطاق الأعمال والمواصفات والمدة والدفعات والضمانات ومسؤولية التأخير.',
        body_en:
          'We draft construction and finishing contracts covering the scope of work, specifications, timelines, payments, warranties and delay liabilities.',
      },
      {
        title_ar: 'عقود الشراكة والاستثمار',
        title_en: 'Partnership & Investment Agreements',
        body_ar:
          'نقوم بصياغة ومراجعة عقود الشراكة والاستثمار وتحديد المساهمات والصلاحيات الإدارية وتوزيع الأرباح وآليات التخارج.',
        body_en:
          'We draft and review partnership and investment agreements defining capital contributions, management powers, profit distribution and exit arrangements.',
      },
      {
        title_ar: 'عقود التشغيل والإدارة',
        title_en: 'Operation & Management Agreements',
        body_ar:
          'نقوم بإعداد عقود التشغيل والإدارة وتحديد المسؤوليات ومعايير الأداء والمقابل المالي والتزامات المتابعة والتقارير.',
        body_en:
          'We prepare operation and management agreements defining responsibilities, performance standards, financial terms and reporting obligations.',
      },
      {
        title_ar: 'عقود التوريد والخدمات',
        title_en: 'Supply & Service Agreements',
        body_ar:
          'نقوم بصياغة عقود التوريد والخدمات وتحديد المواصفات ومواعيد التسليم وشروط السداد والضمانات والجزاءات.',
        body_en:
          'We draft supply and service agreements covering specifications, delivery schedules, payment terms, warranties and penalties.',
      },
      {
        title_ar: 'عقود العمل والاستشارات',
        title_en: 'Employment & Consultancy Agreements',
        body_ar:
          'نقوم بصياغة ومراجعة عقود العمل والاستشارات وتنظيم المهام والمقابل المالي والسرية وشروط إنهاء العلاقة التعاقدية.',
        body_en:
          'We draft and review employment and consultancy agreements regulating duties, compensation, confidentiality and termination conditions.',
      },
      {
        title_ar: 'اتفاقيات التسوية والتنازل',
        title_en: 'Settlement & Waiver Agreements',
        body_ar:
          'نقوم بإعداد اتفاقيات التسوية والتنازل وتوثيق ما اتفق عليه الأطراف بما يحفظ حقوقهم عند إنهاء النزاعات.',
        body_en:
          "We prepare settlement and waiver agreements that document the parties' understanding and protect their rights when resolving disputes.",
      },
      {
        title_ar: 'مذكرات التفاهم واتفاقيات السرية',
        title_en: 'Memoranda of Understanding & NDAs',
        body_ar:
          'نقوم بصياغة مذكرات التفاهم واتفاقيات عدم الإفصاح لتنظيم التعاون المبدئي وحماية المعلومات والبيانات السرية.',
        body_en:
          'We draft memoranda of understanding and non-disclosure agreements to regulate preliminary cooperation and protect confidential information.',
      },
      {
        title_ar: 'الفحص القانوني قبل التعاقد',
        title_en: 'Pre-Contract Legal Due Diligence',
        body_ar:
          'نفحص المستندات والملكية والتراخيص والالتزامات القانونية قبل توقيع العقد للكشف عن المخاطر وحماية مصالح العميل.',
        body_en:
          "We review documents, ownership, licenses and legal obligations before signing to identify risks and protect the client's interests.",
      },
    ],
  },
];
