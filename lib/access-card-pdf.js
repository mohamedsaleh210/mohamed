const sharp = require('sharp');

const xml = (value) => String(value == null ? '' : value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

async function qrData(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const endpoint = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=8&data=${encodeURIComponent(url)}`;
    const res = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch (_) {
    return null;
  }
}

function svgCard(card, qr) {
  const qrMarkup = qr
    ? `<rect x="450" y="1110" width="340" height="340" rx="28" fill="#fff" stroke="#d7dedb" stroke-width="3"/><image href="${qr}" x="490" y="1150" width="260" height="260"/>`
    : `<rect x="450" y="1110" width="340" height="340" rx="28" fill="#f6f8f7" stroke="#d7dedb" stroke-width="3"/><text x="620" y="1280" text-anchor="middle" font-size="32" fill="#6c7b80">QR</text>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1754" viewBox="0 0 1240 1754">
    <rect width="1240" height="1754" fill="#eef2f0"/>
    <rect x="70" y="70" width="1100" height="1614" rx="42" fill="#fff" stroke="#d1a747" stroke-width="7"/>
    <rect x="110" y="110" width="1020" height="185" rx="25" fill="#0b2b34"/>
    <text x="1080" y="190" text-anchor="end" font-family="Tahoma,Arial,DejaVu Sans,sans-serif" font-size="64" font-weight="700" fill="#fff">سند</text>
    <text x="1080" y="245" text-anchor="end" font-family="Tahoma,Arial,DejaVu Sans,sans-serif" font-size="28" fill="#e5d29d">منصة الخدمات القانونية والإدارية</text>
    <circle cx="185" cy="202" r="58" fill="none" stroke="#d1a747" stroke-width="7"/><text x="185" y="224" text-anchor="middle" font-family="Tahoma,Arial,DejaVu Sans,sans-serif" font-size="56" font-weight="700" fill="#d1a747">س</text>

    <text x="1080" y="365" text-anchor="end" font-family="Tahoma,Arial,DejaVu Sans,sans-serif" font-size="32" font-weight="700" fill="#aa7c18">بطاقة دخول الموظف</text>
    <text x="1080" y="445" text-anchor="end" font-family="Tahoma,Arial,DejaVu Sans,sans-serif" font-size="48" font-weight="700" fill="#0b2b34">${xml(card.name)}</text>
    <text x="1080" y="505" text-anchor="end" font-family="Tahoma,Arial,DejaVu Sans,sans-serif" font-size="30" fill="#44565c">${xml(card.company)} · ${xml(card.branch)}</text>

    <rect x="110" y="565" width="1020" height="145" rx="24" fill="#f5f7f6" stroke="#dce2df" stroke-width="2"/>
    <text x="1080" y="610" text-anchor="end" font-family="Tahoma,Arial,DejaVu Sans,sans-serif" font-size="23" fill="#718086">رابط الدخول</text>
    <text x="1080" y="665" text-anchor="end" font-family="Consolas,Arial,sans-serif" font-size="27" fill="#0b2b34" direction="ltr">${xml(card.url)}</text>

    <rect x="110" y="745" width="490" height="155" rx="24" fill="#f5f7f6" stroke="#dce2df" stroke-width="2"/>
    <text x="550" y="790" text-anchor="end" font-family="Tahoma,Arial,DejaVu Sans,sans-serif" font-size="23" fill="#718086">اسم المستخدم</text>
    <text x="550" y="850" text-anchor="end" font-family="Consolas,Arial,sans-serif" font-size="34" font-weight="700" fill="#0b2b34" direction="ltr">${xml(card.username)}</text>

    <rect x="640" y="745" width="490" height="155" rx="24" fill="#fff9ea" stroke="#e4ca83" stroke-width="2"/>
    <text x="1080" y="790" text-anchor="end" font-family="Tahoma,Arial,DejaVu Sans,sans-serif" font-size="23" fill="#8a6c20">كلمة المرور المؤقتة</text>
    <text x="1080" y="850" text-anchor="end" font-family="Consolas,Arial,sans-serif" font-size="34" font-weight="700" fill="#0b2b34" direction="ltr">${xml(card.password)}</text>

    ${card.email ? `<rect x="110" y="935" width="1020" height="120" rx="24" fill="#f5f7f6" stroke="#dce2df" stroke-width="2"/><text x="1080" y="980" text-anchor="end" font-family="Tahoma,Arial,DejaVu Sans,sans-serif" font-size="22" fill="#718086">البريد الإلكتروني</text><text x="1080" y="1025" text-anchor="end" font-family="Arial,sans-serif" font-size="28" fill="#0b2b34" direction="ltr">${xml(card.email)}</text>` : ''}

    ${qrMarkup}
    <text x="620" y="1495" text-anchor="middle" font-family="Tahoma,Arial,DejaVu Sans,sans-serif" font-size="27" font-weight="700" fill="#0b2b34">امسح QR Code لفتح صفحة الدخول</text>
    <rect x="110" y="1540" width="1020" height="82" rx="18" fill="#fff7e5"/>
    <text x="1080" y="1592" text-anchor="end" font-family="Tahoma,Arial,DejaVu Sans,sans-serif" font-size="23" fill="#76570c">تنبيه: يجب تغيير كلمة المرور عند أول دخول وعدم مشاركة البطاقة بعد استخدامها.</text>
    <text x="110" y="1650" font-family="Tahoma,Arial,DejaVu Sans,sans-serif" font-size="18" fill="#7b888c" direction="ltr">${xml(card.eventId)} · ${xml(card.issuedLabel)}</text>
  </svg>`;
}

function jpegToPdf(jpeg, imgWidth, imgHeight) {
  const pageW = 595.28, pageH = 841.89;
  const chunks = [];
  const offsets = [0];
  let length = 0;
  const push = (x) => { const b = Buffer.isBuffer(x) ? x : Buffer.from(x, 'binary'); chunks.push(b); length += b.length; };
  push('%PDF-1.4\n%âãÏÓ\n');
  const obj = (n, head, stream) => {
    offsets[n] = length;
    push(`${n} 0 obj\n${head}`);
    if (stream) { push('\nstream\n'); push(stream); push('\nendstream'); }
    push('\nendobj\n');
  };
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, `<< /Type /XObject /Subtype /Image /Width ${imgWidth} /Height ${imgHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
  const content = Buffer.from(`q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`, 'ascii');
  obj(5, `<< /Length ${content.length} >>`, content);
  const xref = length;
  push('xref\n0 6\n0000000000 65535 f \n');
  for (let i = 1; i <= 5; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return Buffer.concat(chunks);
}

async function create(card) {
  const qr = await qrData(card.url);
  const svg = svgCard(card, qr);
  const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toBuffer();
  return jpegToPdf(jpeg, 1240, 1754);
}

module.exports = { create };
