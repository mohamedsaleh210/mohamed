#!/usr/bin/env node
/**
 * Super Admin regression suite.
 *
 * `admin` stays a single role string everywhere (every existing
 * `role === 'admin'` route gate keeps meaning "either tier of admin"), but a
 * new `is_super_admin` flag on top of it splits that role into two tiers:
 * Super Admin (unconditional access, protected from being edited/disabled/
 * demoted by anyone but another Super Admin, and from ever self-demoting)
 * and a regular admin (same defaults as before, but now genuinely
 * configurable — a Super Admin can strip a specific ability from a specific
 * admin, the same override mechanism every other role already used).
 *
 * This suite proves the guard matrix holds over real HTTP requests against
 * the real server, not just that the code reads correctly:
 *   - exactly one Super Admin is bootstrapped on a fresh install
 *   - a regular admin's permissions are now real and Super-Admin-editable
 *   - a regular admin cannot edit/disable/promote a Super Admin, or itself
 *   - a Super Admin can promote/demote between the two tiers
 *   - the last Super Admin can never be reduced to zero
 *
 *   node super-admin-test.js
 */
const path = require('path');
const bcrypt = require('bcryptjs');
const { createHarness } = require('./test-harness');

const H = createHarness({ port: 4578, label: 'Super Admin suite' });
const { check, section, makeClient, loginStaff, ADMIN, BASE, has } = H;

(async () => {
  console.log('\x1b[1mSanad — Super Admin regression suite\x1b[0m\n');
  await H.start();

  const Database = require('better-sqlite3');
  const db = new Database(path.join(H.DATA_DIR, 'sanad.db'));

  try {
    // ================================================== fixture: a regular admin
    // A distinct admin-tier account that is NOT the bootstrapped Super Admin,
    // with a complete-enough profile to pass every request through
    // requireAuth's profile-completion gate instead of being redirected to it.
    db.prepare("UPDATE settings SET value='0' WHERE key='staff_id_required'").run();
    const regularAdminId = db
      .prepare(
        `INSERT INTO users (username, password_hash, role, display_name, legal_name, email, phone,
                             national_id, birth_date, active, must_change_password, profile_completed)
         VALUES (?,?,?,?,?,?,?,?,?,1,0,1)`
      )
      .run(
        'regularadmin', bcrypt.hashSync('RegularAdmin1!', 10), 'admin', 'Regular Admin',
        'Regular Admin Test Person', 'regular@test.sanad', '+201000000088', '29001011234567', '1990-01-01'
      ).lastInsertRowid;

    // ================================================== 1. bootstrap
    section('١. توليد سوبر أدمن واحد تلقائيًا عند التركيب');
    const superAdmins = db.prepare('SELECT id, username FROM users WHERE is_super_admin = 1').all();
    check('يوجد سوبر أدمن واحد بالضبط بعد التركيب', superAdmins.length === 1, JSON.stringify(superAdmins));
    check('السوبر أدمن هو أول حساب أدمن (adam)', superAdmins[0] && superAdmins[0].username === 'adam');

    const adamId = db.prepare("SELECT id FROM users WHERE username='adam'").get().id;

    // ================================================== login both tiers
    const adamLogin = await loginStaff('adam', '1234');
    check('تسجيل دخول السوبر أدمن adam نجح', adamLogin.status === 302, `status=${adamLogin.status}`);
    const adam = adamLogin.client;

    const regularLogin = await loginStaff('regularadmin', 'RegularAdmin1!');
    check('تسجيل دخول الأدمن العادي نجح', regularLogin.status === 302, `status=${regularLogin.status}`);
    const regular = regularLogin.client;

    // ================================================== 2. regular admin cannot touch super admin
    section('٢. الأدمن العادي ما يقدرش يلمس حساب السوبر أدمن');
    const csrfR = await regular.token(`${ADMIN}/users`);

    const updResp = await regular.post(`${ADMIN}/users/${adamId}/update`, {
      body: { _csrf: csrfR, display_name: 'HACKED', legal_name: 'H A C K', role: 'lawyer' },
    });
    check('POST /update على حساب السوبر أدمن مرفوض 403', updResp.status === 403, `status=${updResp.status}`);

    const toggleResp = await regular.post(`${ADMIN}/users/${adamId}/toggle`, { body: { _csrf: csrfR } });
    check('POST /toggle على حساب السوبر أدمن مرفوض 403', toggleResp.status === 403, `status=${toggleResp.status}`);

    const permResp = await regular.post(`${ADMIN}/users/${adamId}/permissions`, {
      body: { _csrf: csrfR, permission: 'users.manage' },
    });
    check('POST /permissions على حساب السوبر أدمن مرفوض (302 لرسالة "غير محدودة" أو 403)',
      permResp.status === 403 || (permResp.location || '').includes('admin_unlimited'),
      `status=${permResp.status} location=${permResp.location}`);

    const adamAfterAttack = db.prepare('SELECT display_name, role, active, is_super_admin FROM users WHERE id=?').get(adamId);
    check('حساب السوبر أدمن سليم تمامًا بعد المحاولة (مفيش تغيير جزئي)',
      adamAfterAttack.display_name !== 'HACKED' && adamAfterAttack.role === 'admin'
      && adamAfterAttack.active === 1 && adamAfterAttack.is_super_admin === 1,
      JSON.stringify(adamAfterAttack));

    // ================================================== 3. regular admin cannot self-escalate
    section('٣. الأدمن العادي ما يقدرش يرفّع نفسه سوبر أدمن');
    const csrfSelf = await regular.token(`${ADMIN}/users/${regularAdminId}`);
    await regular.post(`${ADMIN}/users/${regularAdminId}/update`, {
      body: {
        _csrf: csrfSelf, display_name: 'Regular Admin', legal_name: 'Regular Admin Test Person',
        email: 'regular@test.sanad', phone: '+201000000088', national_id: '29001011234567',
        birth_date: '1990-01-01', role: 'admin', is_super_admin: '1',
      },
    });
    const regularAfterSelfPromo = db.prepare('SELECT is_super_admin FROM users WHERE id=?').get(regularAdminId);
    check('is_super_admin لسه صفر بعد محاولة الترقية الذاتية', regularAfterSelfPromo.is_super_admin === 0);

    const selfPermResp = await regular.post(`${ADMIN}/users/${regularAdminId}/permissions`, {
      body: { _csrf: csrfSelf, permission: 'users.manage' },
    });
    check('الأدمن العادي ما يقدرش يعدّل صلاحياته هو نفسه',
      selfPermResp.status === 403 || (selfPermResp.location || '').includes('msg=self'),
      `status=${selfPermResp.status} location=${selfPermResp.location}`);

    // ================================================== 4. super admin CAN configure regular admin
    section('٤. السوبر أدمن يقدر يظبط صلاحيات الأدمن العادي');
    const csrfA = await adam.token(`${ADMIN}/users/${regularAdminId}/permissions`);
    // Regular admin defaults to ALL (unchanged behaviour), so stripping one
    // permission and NOT resending it should record it as removed.
    const allPermsPage = await adam.get(`${ADMIN}/users/${regularAdminId}/permissions`);
    check('صفحة صلاحيات الأدمن العادي فيها قائمة حقيقية قابلة للتعديل (مش رسالة "غير محدودة")',
      has(allPermsPage.text, 'name="permission"') && !has(allPermsPage.text, 'مالوش قائمة صلاحيات'));

    const otherPerms = require('./lib/permissions').ALL.filter((k) => k !== 'users.manage');
    const stripResp = await adam.post(`${ADMIN}/users/${regularAdminId}/permissions`, {
      body: { _csrf: csrfA, permission: otherPerms },
    });
    check('السوبر أدمن قدر يحفظ صلاحيات الأدمن العادي', stripResp.status === 302, `status=${stripResp.status}`);

    const override = db.prepare("SELECT granted FROM user_permissions WHERE user_id=? AND permission='users.manage'").get(regularAdminId);
    check('صلاحية users.manage اتسجّلت كمستثناة (مشيلة) على الأدمن العادي', override && override.granted === 0, JSON.stringify(override));

    // Effect is real, not cosmetic: the regular admin, now missing
    // users.manage, can no longer reach a users.manage-gated route.
    const csrfRAfterStrip = await regular.token(`${ADMIN}/users`);
    const blockedNow = await regular.post(`${ADMIN}/users/new`, {
      body: { _csrf: csrfRAfterStrip, username: 'shouldnotexist', role: 'lawyer', password: 'Xx123456789!', password_confirm: 'Xx123456789!' },
    });
    check('بعد سحب users.manage، الأدمن العادي مرفوض من مسار محتاج الصلاحية دي', blockedNow.status === 403, `status=${blockedNow.status}`);

    // restore users.manage for the rest of the suite
    await adam.post(`${ADMIN}/users/${regularAdminId}/permissions`, {
      body: { _csrf: await adam.token(`${ADMIN}/users/${regularAdminId}/permissions`), permission: require('./lib/permissions').ALL },
    });

    // ================================================== 5. creating a new admin-tier account
    section('٥. إنشاء حساب أدمن جديد محتاج سوبر أدمن');
    const csrfNewR = await regular.token(`${ADMIN}/users`);
    await regular.post(`${ADMIN}/users/new`, {
      body: { _csrf: csrfNewR, username: 'sneakyadmin', role: 'admin', password: 'Xx123456789!', password_confirm: 'Xx123456789!' },
    });
    const sneaky = db.prepare("SELECT role FROM users WHERE username='sneakyadmin'").get();
    check('الأدمن العادي اللي عمل حساب "أدمن" اتنزّل تلقائيًا لدور تاني (مش أدمن)',
      !sneaky || sneaky.role !== 'admin', JSON.stringify(sneaky));

    const csrfNewA = await adam.token(`${ADMIN}/users`);
    await adam.post(`${ADMIN}/users/new`, {
      body: { _csrf: csrfNewA, username: 'realnewadmin', role: 'admin', password: 'Xx123456789!', password_confirm: 'Xx123456789!' },
    });
    const realNew = db.prepare("SELECT role FROM users WHERE username='realnewadmin'").get();
    check('السوبر أدمن يقدر ينشئ حساب أدمن حقيقي', realNew && realNew.role === 'admin', JSON.stringify(realNew));

    // ================================================== 6. promotion/demotion + last-Super-Admin protection
    section('٦. الترقية والتنزيل وحماية آخر سوبر أدمن');
    const csrfPromote = await adam.token(`${ADMIN}/users/${regularAdminId}`);
    await adam.post(`${ADMIN}/users/${regularAdminId}/update`, {
      body: {
        _csrf: csrfPromote, display_name: 'Regular Admin', legal_name: 'Regular Admin Test Person',
        email: 'regular@test.sanad', phone: '+201000000088', national_id: '29001011234567',
        birth_date: '1990-01-01', role: 'admin', is_super_admin: '1',
      },
    });
    const promoted = db.prepare('SELECT is_super_admin FROM users WHERE id=?').get(regularAdminId);
    check('السوبر أدمن رقّى الأدمن العادي لسوبر أدمن بنجاح', promoted.is_super_admin === 1);

    // Two Super Admins now (adam, regularadmin) -- demoting one is fine.
    const nowRegularAdmin = makeClient();
    const t2 = await nowRegularAdmin.token(`${ADMIN}/login`);
    await nowRegularAdmin.post(`${ADMIN}/login`, { body: { _csrf: t2, username: 'regularadmin', password: 'RegularAdmin1!' } });
    const csrfDemoteAdam = await nowRegularAdmin.token(`${ADMIN}/users/${adamId}`);
    await nowRegularAdmin.post(`${ADMIN}/users/${adamId}/update`, {
      body: {
        _csrf: csrfDemoteAdam, display_name: 'Adam', legal_name: 'Adam Test',
        email: 'adam@sanad.com.eg', phone: '+201001234567', national_id: '28403171201573',
        birth_date: '1984-03-17', role: 'admin', is_super_admin: '0',
      },
    });
    const adamDemoted = db.prepare('SELECT is_super_admin FROM users WHERE id=?').get(adamId);
    check('سوبر أدمن تاني (regularadmin) قدر ينزّل adam لأدمن عادي (فيه سوبر أدمن تاني باقي)', adamDemoted.is_super_admin === 0);

    // Now regularadmin is the SOLE Super Admin. adam (now regular) must be
    // fully blocked from touching regularadmin's record at all.
    const csrfAdamNowRegular = await adam.token(`${ADMIN}/users`);
    const lastSuperAttack = await adam.post(`${ADMIN}/users/${regularAdminId}/update`, {
      body: { _csrf: csrfAdamNowRegular, display_name: 'x', role: 'lawyer', is_super_admin: '0' },
    });
    check('آخر سوبر أدمن محمي تمامًا من أدمن عادي — 403', lastSuperAttack.status === 403, `status=${lastSuperAttack.status}`);
    const soleSuperStillSuper = db.prepare('SELECT is_super_admin FROM users WHERE id=?').get(regularAdminId);
    check('آخر سوبر أدمن لسه سوبر أدمن بعد المحاولة', soleSuperStillSuper.is_super_admin === 1);

    // restore adam to super admin so the seeded state matches expectations
    // for anyone re-running against this same DATA_DIR.
    const csrfRestore = await nowRegularAdmin.token(`${ADMIN}/users/${adamId}`);
    await nowRegularAdmin.post(`${ADMIN}/users/${adamId}/update`, {
      body: {
        _csrf: csrfRestore, display_name: 'Adam', legal_name: 'Adam Test',
        email: 'adam@sanad.com.eg', phone: '+201001234567', national_id: '28403171201573',
        birth_date: '1984-03-17', role: 'admin', is_super_admin: '1',
      },
    });

    // ================================================== 7. lib/cases.js no longer hardcodes role==='admin'
    section('٧. lib/cases.js بيعتمد على الصلاحية المحلولة مش على الدور مباشرة');
    const casesLib = require('./lib/cases');
    const strippedAdmin = { id: regularAdminId, role: 'admin', abilities: new Set() };
    const fullAdmin = { id: regularAdminId, role: 'admin', abilities: new Set(['cases.view_all']) };
    check('أدمن من غير cases.view_all في مجموعة الصلاحيات المحلولة ما يشوفش كل القضايا',
      casesLib.visibleFilter(strippedAdmin).sql !== '');
    check('أدمن معاه cases.view_all في مجموعة الصلاحيات المحلولة يشوف كل القضايا',
      casesLib.visibleFilter(fullAdmin).sql === '');

    section('سلامة السيرفر');
    check('مفيش أخطاء في السيرفر', !/Error|error:/i.test(H.state.serverOutput), H.state.serverOutput.slice(0, 300));
  } catch (err) {
    H.state.fail += 1;
    H.state.failures.push('استثناء غير متوقع: ' + err.message);
    console.error('\n\x1b[31mERROR:\x1b[0m', err);
  } finally {
    db.close();
    H.stop();
  }

  const failCount = H.report();
  process.exit(failCount ? 1 : 0);
})();
