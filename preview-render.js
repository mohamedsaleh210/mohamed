const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
const { UI } = require('./lib/i18n');

const out = path.join(__dirname, 'preview');
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'public/css/style.css'), path.join(out, 'style.css'));
const common = {
  lang: 'ar', dir: 'rtl', t: UI.ar, path: '/', query: {}, clientUser: null,
  site: { name_ar: 'سند', name_en: 'Sanad', tagline_ar: 'تراخيصك ومرافقك وعقودك… ونحن نتكفّل بالإجراءات', tagline_en: '', whatsapp: '201000000000' },
  socialLinks: [], hasConsultations: true, csrfField: '',
  waLink: () => '#',
  menuPages: [
    { slug:'general', name_ar:'الخدمات العامة', name_en:'General services' },
    { slug:'visas', name_ar:'تأشيرات وإقامات', name_en:'Visas' },
    { slug:'universities', name_ar:'جامعات', name_en:'Universities' },
    { slug:'companies', name_ar:'شركات', name_en:'Companies' },
  ],
};
const pages = [
  { slug:'general',name_ar:'الخدمات العامة',name_en:'General',tagline_ar:'تراخيص البناء، المرافق، والعقود',colour:'#b68b2c',service_count:21 },
  { slug:'visas',name_ar:'تأشيرات وإقامات',name_en:'Visas',tagline_ar:'إجراءات السفر والإقامة من أول خطوة',colour:'#237bc1',service_count:10 },
  { slug:'universities',name_ar:'جامعات',name_en:'Universities',tagline_ar:'القبول والمعادلة والتصديقات الدراسية',colour:'#39a275',service_count:9 },
  { slug:'companies',name_ar:'شركات',name_en:'Companies',tagline_ar:'التأسيس والتراخيص والامتثال',colour:'#8455d6',service_count:9 },
];
function render(template, file, locals) {
  const html = ejs.render(fs.readFileSync(template, 'utf8'), locals, { filename: template })
    .replace('href="/css/style.css"', 'href="style.css"');
  fs.writeFileSync(path.join(out, file), html);
}
render(path.join(__dirname,'views/public/home.ejs'),'index.html',{...common,pages});
render(path.join(__dirname,'views/public/system.ejs'),'system.html',{...common,path:'/system',plans:[
  {id:1,name:'الأساسية',annual_price:12000,currency:'EGP',max_users:5,max_requests:500,storage_mb:2048},
  {id:2,name:'الاحترافية',annual_price:24000,currency:'EGP',max_users:20,max_requests:5000,storage_mb:10240},
]});
render(path.join(__dirname,'views/public/system_apply.ejs'),'apply.html',{...common,path:'/system/apply',sent:false,error:null,form:{},plans:[
  {id:1,name:'الأساسية'},{id:2,name:'الاحترافية'}
]});
console.log(out);
