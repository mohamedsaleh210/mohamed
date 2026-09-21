const { getSetting } = require('../db');
const mailer = require('./mailer');

/**
 * Escapes anything a client typed before it lands in an email.
 *
 * A name like <b>Ali</b> would otherwise render as bold in their inbox, and a
 * name containing a script tag would become live markup the moment anyone
 * previewed the message. Neither belongs in a legal office's correspondence.
 */
const esc = (v) =>
  String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Email templates, Arabic and English.
 *
 * Written as inline-styled tables because that is what mail clients actually
 * render — Outlook in particular ignores most modern CSS.
 */
function shell({ lang, title, bodyHtml, ctaText, ctaUrl, footNote }) {
  const rtl = lang === 'ar';
  const dir = rtl ? 'rtl' : 'ltr';
  const align = rtl ? 'right' : 'left';
  const siteName = rtl ? getSetting('site_name_ar', 'سند') : getSetting('site_name_en', 'Sanad');
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#eef1f0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f0;padding:24px 12px;">
<tr><td align="center">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Tajawal,Segoe UI,Arial,sans-serif;direction:${dir};text-align:${align};">

    <tr><td style="background:#12303a;padding:22px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="width:40px;">
          <div style="width:38px;height:38px;border:2px solid #c9a24b;border-radius:50%;color:#c9a24b;text-align:center;line-height:36px;font-size:17px;font-weight:bold;">${rtl ? 'س' : 'S'}</div>
        </td>
        <td style="padding-${rtl ? 'right' : 'left'}:12px;color:#ffffff;font-size:19px;font-weight:bold;">${esc(siteName)}</td>
      </tr></table>
    </td></tr>

    <tr><td style="padding:30px 28px 8px;">
      <h1 style="margin:0 0 14px;font-size:21px;color:#12303a;">${esc(title)}</h1>
      <div style="font-size:15px;line-height:1.8;color:#33424a;">${bodyHtml}</div>
    </td></tr>

    ${
      ctaUrl
        ? `<tr><td style="padding:14px 28px 26px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="background:#c9a24b;border-radius:10px;">
          <a href="${esc(ctaUrl)}" style="display:inline-block;padding:14px 30px;color:#12303a;font-size:15px;font-weight:bold;text-decoration:none;">${esc(ctaText)}</a>
        </td>
      </tr></table>
      <p style="margin:14px 0 0;font-size:12px;color:#8b9aa1;word-break:break-all;">${esc(ctaUrl)}</p>
    </td></tr>`
        : ''
    }

    ${
      footNote
        ? `<tr><td style="padding:0 28px 24px;">
      <div style="background:#f7f4ee;border-radius:10px;padding:14px 16px;font-size:13.5px;color:#66757e;line-height:1.7;">${footNote}</div>
    </td></tr>`
        : ''
    }

    <tr><td style="background:#f7f9f8;padding:18px 28px;font-size:12px;color:#8b9aa1;border-top:1px solid #e3e8e6;">
      ${esc(siteName)} &copy; ${year}
    </td></tr>

  </table>

</td></tr>
</table>
</body>
</html>`;
}

const T = {
  ar: {
    receivedTitle: 'تم استلام طلبك',
    receivedCta: 'رفع المستندات',
    verifyTitle: 'تأكيد إيميلك',
    verifyCta: 'تأكيد البريد الإلكتروني',
    neededTitle: 'المطلوب منك مستندات',
    neededCta: 'ارفعها من هنا',
    doneTitle: 'طلبك اكتمل',
    doneCta: 'شوف تفاصيل الطلب',
    officeTitle: 'طلب جديد على الموقع',
    officeCta: 'افتح الطلب في اللوحة',
    testTitle: 'رسالة تجريبية',
  },
  en: {
    receivedTitle: 'We received your request',
    receivedCta: 'Upload your documents',
    verifyTitle: 'Confirm your email',
    verifyCta: 'Confirm email',
    neededTitle: 'We need some documents',
    neededCta: 'Upload them here',
    doneTitle: 'Your request is complete',
    doneCta: 'View your request',
    officeTitle: 'New request on the website',
    officeCta: 'Open in the panel',
    testTitle: 'Test message',
  },
};

// ---------------------------------------------------------------- templates

/** Sent the moment a request is submitted. Carries the upload link. */
function requestReceived(request, { lang = 'ar' } = {}) {
  const t = T[lang] || T.ar;
  const url = `${mailer.baseUrl()}/upload/${request.id}?t=${request.upload_token}`;
  const ar = lang === 'ar';

  const body = ar
    ? `<p style="margin:0 0 12px;">أهلاً ${esc(request.name)}،</p>
       <p style="margin:0 0 12px;">وصلنا طلبك وهنراجعه ونتواصل معك قريباً.</p>
       <p style="margin:0 0 6px;">رقم طلبك:</p>
       <p style="margin:0 0 16px;font-size:24px;font-weight:bold;color:#a9853a;direction:ltr;">${esc(request.ref)}</p>
       <p style="margin:0;">لو عندك مستندات تخص الطلب، تقدر ترفعها من اللينك ده — صوّرها بالموبايل أو ارفع PDF. <strong>الرفع اختياري تماماً</strong> وطلبك ماشي عادي من غيره.</p>`
    : `<p style="margin:0 0 12px;">Hello ${esc(request.name)},</p>
       <p style="margin:0 0 12px;">We have received your request and will review it and contact you shortly.</p>
       <p style="margin:0 0 6px;">Your reference number:</p>
       <p style="margin:0 0 16px;font-size:24px;font-weight:bold;color:#a9853a;direction:ltr;">${esc(request.ref)}</p>
       <p style="margin:0;">If you have documents for this request, you can upload them from the link below — photograph them with your phone or attach a PDF. <strong>Uploading is entirely optional</strong> and your request proceeds either way.</p>`;

  const foot = ar
    ? `اللينك ده خاص بيك — متبعتهوش لحد. لو راسلتنا على واتساب، اذكر رقم الطلب <strong style="direction:ltr;">${esc(request.ref)}</strong> عشان نلاقي ملفك بسرعة.`
    : `This link is private to you — please do not share it. If you message us on WhatsApp, mention reference <strong style="direction:ltr;">${esc(request.ref)}</strong> so we can find your file quickly.`;

  return {
    to: request.email,
    subject: ar ? `طلبك ${esc(request.ref)} وصلنا` : `Your request ${esc(request.ref)} was received`,
    template: 'request_received',
    lang,
    requestId: request.id,
    html: shell({ lang, title: t.receivedTitle, bodyHtml: body, ctaText: t.receivedCta, ctaUrl: url, footNote: foot }),
  };
}

/** Confirms a newly registered client's address. */
function verifyEmail(client, token, { lang = 'ar' } = {}) {
  const t = T[lang] || T.ar;
  const url = `${mailer.baseUrl()}/portal/verify?token=${token}`;
  const ar = lang === 'ar';

  const body = ar
    ? `<p style="margin:0 0 12px;">أهلاً ${esc(client.full_name)}،</p>
       <p style="margin:0;">دوس على الزرار تحت عشان نأكد إن البريد الإلكتروني ده بتاعك، وتقدر تتابع طلباتك وترفع مستنداتك أي وقت.</p>`
    : `<p style="margin:0 0 12px;">Hello ${esc(client.full_name)},</p>
       <p style="margin:0;">Tap the button below to confirm this email address, so you can track your requests and upload documents at any time.</p>`;

  const foot = ar
    ? 'اللينك صالح ٢٤ ساعة. لو مش انت اللي سجّلت، تجاهل الرسالة دي.'
    : 'This link is valid for 24 hours. If you did not register, you can ignore this message.';

  return {
    to: client.email,
    subject: ar ? 'أكّد إيميلك في سند' : 'Confirm your email — Sanad',
    template: 'verify_email',
    lang,
    html: shell({ lang, title: t.verifyTitle, bodyHtml: body, ctaText: t.verifyCta, ctaUrl: url, footNote: foot }),
  };
}

/** Sent when staff add something to the client's requirements list. */
function requirementAdded(request, items, { lang = 'ar' } = {}) {
  const t = T[lang] || T.ar;
  const url = `${mailer.baseUrl()}/upload/${request.id}?t=${request.upload_token}`;
  const ar = lang === 'ar';

  const list = items
    .map((i) => `<li style="margin-bottom:6px;">${esc(i)}</li>`)
    .join('');

  const body = ar
    ? `<p style="margin:0 0 12px;">أهلاً ${esc(request.name)}،</p>
       <p style="margin:0 0 12px;">علشان نكمّل في طلبك <strong style="direction:ltr;">${esc(request.ref)}</strong>، محتاجين منك:</p>
       <ul style="margin:0 0 14px;padding-${ar ? 'right' : 'left'}:20px;">${list}</ul>
       <p style="margin:0;">ترفعها من اللينك تحت، أو تبعتها على واتساب مع ذكر رقم الطلب.</p>`
    : `<p style="margin:0 0 12px;">Hello ${esc(request.name)},</p>
       <p style="margin:0 0 12px;">To move forward with your request <strong style="direction:ltr;">${esc(request.ref)}</strong>, we need:</p>
       <ul style="margin:0 0 14px;padding-left:20px;">${list}</ul>
       <p style="margin:0;">Upload them from the link below, or send them on WhatsApp mentioning your reference number.</p>`;

  return {
    to: request.email,
    subject: ar ? `مطلوب مستندات لطلبك ${esc(request.ref)}` : `Documents needed for ${esc(request.ref)}`,
    template: 'requirement_added',
    lang,
    requestId: request.id,
    html: shell({ lang, title: t.neededTitle, bodyHtml: body, ctaText: t.neededCta, ctaUrl: url }),
  };
}

/** Sent once when a request is marked complete. */
function requestCompleted(request, { lang = 'ar' } = {}) {
  const t = T[lang] || T.ar;
  const url = `${mailer.baseUrl()}/portal`;
  const ar = lang === 'ar';

  const body = ar
    ? `<p style="margin:0 0 12px;">أهلاً ${esc(request.name)}،</p>
       <p style="margin:0 0 12px;">طلبك <strong style="direction:ltr;">${esc(request.ref)}</strong> اكتمل. هنتواصل معك بخصوص تسليم الأوراق.</p>
       <p style="margin:0;">شكراً لثقتك فينا.</p>`
    : `<p style="margin:0 0 12px;">Hello ${esc(request.name)},</p>
       <p style="margin:0 0 12px;">Your request <strong style="direction:ltr;">${esc(request.ref)}</strong> is complete. We will be in touch about handing over the documents.</p>
       <p style="margin:0;">Thank you for trusting us.</p>`;

  return {
    to: request.email,
    subject: ar ? `طلبك ${esc(request.ref)} اكتمل` : `Your request ${esc(request.ref)} is complete`,
    template: 'request_completed',
    lang,
    requestId: request.id,
    html: shell({ lang, title: t.doneTitle, bodyHtml: body, ctaText: t.doneCta, ctaUrl: url }),
  };
}

/** Internal alert to the office when a request arrives. */
function officeNewRequest(request, to, adminPath) {
  const url = `${mailer.baseUrl()}${adminPath}/requests/${request.id}`;

  const body = `<p style="margin:0 0 12px;">وصل طلب جديد على الموقع.</p>
     <table style="width:100%;font-size:14px;border-collapse:collapse;">
       <tr><td style="padding:5px 0;color:#66757e;width:110px;">الرقم</td><td style="direction:ltr;text-align:right;"><strong>${esc(request.ref)}</strong></td></tr>
       <tr><td style="padding:5px 0;color:#66757e;">العميل</td><td>${esc(request.name)}</td></tr>
       <tr><td style="padding:5px 0;color:#66757e;">الموبايل</td><td style="direction:ltr;text-align:right;">${esc(request.phone)}</td></tr>
       <tr><td style="padding:5px 0;color:#66757e;">البريد الإلكتروني</td><td style="direction:ltr;text-align:right;">${esc(request.email || '—')}</td></tr>
       <tr><td style="padding:5px 0;color:#66757e;">الخدمة</td><td>${esc(request.service_label || '—')}</td></tr>
     </table>
     ${request.message ? `<p style="margin:14px 0 0;padding:12px;background:#f7f4ee;border-radius:8px;white-space:pre-wrap;">${esc(request.message)}</p>` : ''}`;

  return {
    to,
    subject: `طلب جديد ${esc(request.ref)} — ${esc(request.name)}`,
    template: 'office_new_request',
    lang: 'ar',
    requestId: request.id,
    html: shell({ lang: 'ar', title: T.ar.officeTitle, bodyHtml: body, ctaText: T.ar.officeCta, ctaUrl: url }),
  };
}

/** Sent when someone asks to reset a password. */
function passwordReset({ name, email }, token, { lang = 'ar', audience = 'client' } = {}) {
  const base = mailer.baseUrl();
  const url =
    audience === 'staff'
      ? `${base}${process.env.ADMIN_PATH || '/office-panel'}/reset?token=${token}`
      : `${base}/portal/reset?token=${token}`;
  const ar = lang === 'ar';

  const body = ar
    ? `<p style="margin:0 0 12px;">مرحباً ${esc(name || '')}،</p>
       <p style="margin:0;">وصلنا طلب لإعادة تعيين كلمة المرور. اضغط على الزر أدناه لاختيار كلمة مرور جديدة.</p>`
    : `<p style="margin:0 0 12px;">Hello ${esc(name || '')},</p>
       <p style="margin:0;">We received a request to reset your password. Use the button below to choose a new one.</p>`;

  const foot = ar
    ? 'الرابط صالح لمدة ساعة واحدة ويُستخدم مرة واحدة فقط. إذا لم تطلب ذلك، تجاهل هذه الرسالة — لن يتغيّر شيء.'
    : 'This link is valid for one hour and can be used once. If you did not request it, ignore this message — nothing will change.';

  return {
    to: email,
    subject: ar ? 'إعادة تعيين كلمة المرور' : 'Reset your password',
    template: 'password_reset',
    lang,
    html: shell({
      lang,
      title: ar ? 'إعادة تعيين كلمة المرور' : 'Reset your password',
      bodyHtml: body,
      ctaText: ar ? 'اختيار كلمة مرور جديدة' : 'Choose a new password',
      ctaUrl: url,
      footNote: foot,
    }),
  };
}

/** Used by the settings page to prove the configuration works. */
function testEmail(to) {
  const body = `<p style="margin:0 0 12px;">لو وصلتك الرسالة دي، فإعدادات البريد الإلكتروني شغالة تمام.</p>
     <p style="margin:0;">المزوّد الحالي: <strong>${mailer.currentProvider()}</strong></p>`;

  return {
    to,
    subject: 'رسالة تجريبية من سند',
    template: 'test',
    lang: 'ar',
    html: shell({ lang: 'ar', title: T.ar.testTitle, bodyHtml: body }),
  };
}

/** Platform-owner response to a company subscription application. */
function subscriptionDecision(application, { action, message, tenant, planName } = {}) {
  const names = {
    approved: ['تم قبول طلب الاشتراك', 'subscription_approved'],
    rejected: ['تحديث بشأن طلب الاشتراك', 'subscription_rejected'],
    inquiry: ['مطلوب استكمال بيانات طلب الاشتراك', 'subscription_inquiry'],
  };
  const [title, template] = names[action] || names.inquiry;
  const intro = action === 'approved'
    ? 'يسعدنا إبلاغكم بقبول الطلب وتفعيل حساب المنشأة.'
    : action === 'rejected'
      ? 'بعد مراجعة الطلب، تعذر قبوله في الوقت الحالي.'
      : 'نحتاج إلى المعلومات التالية لاستكمال مراجعة الطلب:';
  const details = action === 'approved' && tenant
    ? `<table style="width:100%;font-size:14px;border-collapse:collapse;margin:14px 0;">
        <tr><td style="padding:5px 0;color:#66757e;width:120px;">رمز الحساب</td><td dir="ltr"><strong>${esc(tenant.slug)}</strong></td></tr>
        <tr><td style="padding:5px 0;color:#66757e;">الباقة</td><td>${esc(planName || '—')}</td></tr>
        <tr><td style="padding:5px 0;color:#66757e;">حالة الحساب</td><td>نسخة تجريبية مفعلة</td></tr>
      </table>`
    : '';
  const note = message
    ? `<div style="margin:14px 0 0;padding:14px;background:#f7f4ee;border-radius:10px;white-space:pre-wrap;">${esc(message)}</div>`
    : '';
  const body = `<p style="margin:0 0 12px;">مرحباً ${esc(application.contact_name || '')}،</p>
    <p style="margin:0;">${intro}</p>${details}${note}`;
  const ctaUrl = action === 'approved' && tenant ? `${mailer.baseUrl()}/office/${tenant.slug}` : null;
  return {
    to: application.email,
    subject: `${title} — ${application.company_name}`,
    template,
    lang: 'ar',
    html: shell({
      lang: 'ar', title, bodyHtml: body,
      ctaText: ctaUrl ? 'الدخول إلى حساب الشركة' : null,
      ctaUrl,
      footNote: action === 'inquiry' ? 'يمكنكم الرد مباشرة على هذه الرسالة بالمعلومات المطلوبة.' : null,
    }),
  };
}

module.exports = {
  passwordReset,
  requestReceived,
  verifyEmail,
  requirementAdded,
  requestCompleted,
  officeNewRequest,
  subscriptionDecision,
  testEmail,
};
