const { spawn } = require('child_process');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const root = __dirname;
const central = new Database(path.join(root, 'platform-data', 'central.db'), { readonly: true });
const tenant = central.prepare('SELECT * FROM tenants').get();
central.close();
if (!tenant) throw new Error('Gerwani tenant missing');

class Jar {
  constructor(){ this.cookies = new Map(); }
  async request(url, options={}) {
    const headers = { ...(options.headers || {}) };
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k,v])=>`${k}=${v}`).join('; ');
    const response = await fetch(url, { ...options, headers, redirect: 'manual' });
    const values = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    for (const line of values) {
      const pair = line.split(';',1)[0], at = pair.indexOf('=');
      if (at > 0) this.cookies.set(pair.slice(0,at), pair.slice(at+1));
    }
    return response;
  }
}
const form = (data) => new URLSearchParams(data).toString();
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const wait = ms => new Promise(r=>setTimeout(r,ms));
async function ready(url){ for(let i=0;i<80;i++){try{const r=await fetch(url);if(r.status<500)return}catch(_){}await wait(150)}throw new Error(`server not ready: ${url}`) }

(async()=>{
  const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3000',DATA_DIR:path.join(root,'data'),PLATFORM_DATA_DIR:path.join(root,'platform-data'),SESSION_SECRET:'release-main-test',PLATFORM_SESSION_SECRET:'release-platform-test',NODE_ENV:'development'},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
  try{
    await ready('http://127.0.0.1:3000/');
    await ready(`http://127.0.0.1:${tenant.port}/`);

    const home=await (await fetch('http://127.0.0.1:3000/')).text();
    assert((home.match(/audience-card/g)||[]).length>=3,'homepage does not expose all catalogue categories');
    assert(home.includes('شركة الجرواني'),'Gerwani is missing from public homepage');
    const providers=await (await fetch('http://127.0.0.1:3000/appointments')).text();
    assert(providers.includes('شركة الجرواني') && providers.includes(`localhost:${tenant.port}/appointments`),'Gerwani booking provider/link is missing');

    const owner=new Jar();
    const loginPage=await (await owner.request('http://127.0.0.1:3000/office-panel/login')).text();
    const ownerCsrf=(loginPage.match(/name="_csrf" value="([^"]+)"/)||[])[1];
    const login=await owner.request('http://127.0.0.1:3000/office-panel/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:ownerCsrf,username:'adam',password:'Mas@123456789'})});
    assert(login.status===302 && login.headers.get('location')==='/office-panel',`owner login redirected away from port 3000: ${login.status} ${login.headers.get('location')}`);
    const subs=await owner.request('http://127.0.0.1:3000/office-panel/subscriptions');
    assert(subs.status===200 && (await subs.text()).includes('شركة الجرواني'),'owner cannot open Gerwani record');

    const start=await owner.request(`http://127.0.0.1:3000/office-panel/subscriptions/tenants/${tenant.id}/manage?to=imports`);
    assert(start.status===302 && start.headers.get('location').includes(`:${tenant.port}/platform-owner-access`),'tenant SSO link is wrong');
    const tenantJar=new Jar();
    const sso=await tenantJar.request(start.headers.get('location').replace('localhost','127.0.0.1'));
    assert(sso.status===302 && sso.headers.get('location')==='/office-panel/imports','SSO did not select imports');
    const imports=await tenantJar.request(`http://127.0.0.1:${tenant.port}/office-panel/imports`);
    const importsHtml=await imports.text();
    assert(imports.status===200 && importsHtml.includes('استيراد بيانات'),'owner SSO was blocked by tenant login/profile');
    const tenantCsrf=(importsHtml.match(/name="_csrf" value="([^"]+)"/)||[])[1];
    const ownerStill=await owner.request('http://127.0.0.1:3000/office-panel/subscriptions');
    assert(ownerStill.status===200,'owner session on port 3000 was lost');
    assert(owner.cookies.has('sanad.sid') && tenantJar.cookies.has(`sanad.tenant.${tenant.id}.sid`),'session cookies are not isolated');

    const managerJar=new Jar();
    const managerLoginPage=await (await managerJar.request(`http://127.0.0.1:${tenant.port}/login`)).text();
    const managerCsrf=(managerLoginPage.match(/name="_csrf" value="([^"]+)"/)||[])[1];
    const managerLogin=await managerJar.request(`http://127.0.0.1:${tenant.port}/login`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:managerCsrf,identifier:'elgrwanylaw',password:'Snd@123456'})});
    assert(managerLogin.status===302 && managerLogin.headers.get('location').includes('/account?force=1'),'Gerwani manager card credentials do not work');

    const tenantDb=new Database(path.join(tenant.data_dir,'sanad.db'));
    const created=tenantDb.prepare(`INSERT INTO users(username,password_hash,role,display_name,legal_name,email,active,must_change_password,profile_completed)
      VALUES(?,?,?,?,?,?,1,0,1)`).run('card.test',bcrypt.hashSync('Test@123456',10),'lawyer','موظف اختبار البطاقة','موظف اختبار البطاقة','card@example.com');
    const card=await tenantJar.request(`http://127.0.0.1:${tenant.port}/office-panel/users/${created.lastInsertRowid}/access-card`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:tenantCsrf})});
    const cardHtml=await card.text();
    assert(card.status===200 && cardHtml.includes('بطاقة دخول موظف') && cardHtml.includes('card.test') && cardHtml.includes('شركة الجرواني'),'employee card is incomplete');
    tenantDb.prepare('DELETE FROM users WHERE id=?').run(created.lastInsertRowid);tenantDb.close();

    const booking=await (await fetch(`http://127.0.0.1:${tenant.port}/appointments`)).text();
    assert(booking.includes('booking-form') && booking.includes('رقم الموبايل'),'booking form formatting/labels missing');
    console.log('FINAL RELEASE TEST: PASS');
    console.log(JSON.stringify({ownerPort:3000,tenantPort:tenant.port,ownerCookie:'sanad.sid',tenantCookie:`sanad.tenant.${tenant.id}.sid`,gerwaniOnly:true}));
  } finally {
    child.kill('SIGINT');
  }
})().catch(err=>{console.error('FINAL RELEASE TEST: FAIL',err.message);process.exitCode=1});
