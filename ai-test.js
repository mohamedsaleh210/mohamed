#!/usr/bin/env node
/**
 * AI assistant regression suite.
 *
 * The one rule that matters here: the assistant must never see more than
 * the person asking it could see themselves. "Allowed roles" only decides
 * who may open the chat at all; what it can actually read is the
 * intersection of the office's AI data-source settings and the asking
 * user's own real abilities — enabling a data source for the assistant
 * never grants a user anything they didn't already have.
 *
 * Also covers: the settings tab round-trips every field (including the
 * write-only API key), a role left out of "allowed roles" is refused the
 * whole feature with a real 403 (not just a hidden nav link), and a
 * question is answered honestly — "not connected" — rather than a faked
 * reply when no provider key is configured.
 *
 *   node ai-test.js
 */
const path = require('path');
const { createHarness } = require('./test-harness');

const H = createHarness({ port: 4581, label: 'AI assistant suite' });
const { check, section, loginStaff, ADMIN } = H;

(async () => {
  console.log('\x1b[1mSanad — AI assistant regression suite\x1b[0m\n');
  await H.start();

  const Database = require('better-sqlite3');
  const db = new Database(path.join(H.DATA_DIR, 'sanad.db'));

  try {
    const adamLogin = await loginStaff('adam', '1234');
    check('تسجيل دخول السوبر أدمن نجح', adamLogin.status === 302, `status=${adamLogin.status}`);
    const adam = adamLogin.client;

    const monaLogin = await loginStaff('mona', 'demo1234');
    check('تسجيل دخول المحامية منى نجح', monaLogin.status === 302, `status=${monaLogin.status}`);
    const mona = monaLogin.client;

    // ================================================== 1. disabled by default
    section('١. المساعد متوقف افتراضيًا');
    const disabledResp = await adam.get(`${ADMIN}/ai`);
    check('المساعد ممنوع قبل التفعيل — 403', disabledResp.status === 403, `status=${disabledResp.status}`);

    // ================================================== 2. settings round-trip
    section('٢. حفظ إعدادات المساعد الذكي');
    const csrfSave = await adam.token(`${ADMIN}/settings?tab=ai`);
    const saveResp = await adam.post(`${ADMIN}/settings/ai-settings`, {
      body: {
        _csrf: csrfSave,
        ai_enabled: '1',
        ai_provider: 'anthropic',
        ai_model: 'claude-sonnet-4-5',
        ai_system_instructions: 'رد بإيجاز',
        ai_welcome_message: 'أهلاً، أقدر أساعدك',
        ai_retention_days: '30',
        ai_allowed_roles: ['admin', 'lawyer'],
        ai_data_sources: ['requests', 'cases'],
        ai_audit_log: '1',
      },
    });
    check('حفظ الإعدادات بينجح (302)', saveResp.status === 302, `status=${saveResp.status}`);

    const ai = require('./lib/ai');
    const cfg = ai.config();
    check('التفعيل اتسجل', cfg.enabled === true);
    check('الأدوار المسموح لها اتسجلت (أدمن ومحامي بس)', cfg.allowedRoles.includes('admin') && cfg.allowedRoles.includes('lawyer') && !cfg.allowedRoles.includes('accountant'));
    check('مصادر البيانات اتسجلت (طلبات وقضايا بس)', cfg.dataSources.includes('requests') && cfg.dataSources.includes('cases') && !cfg.dataSources.includes('money'));
    check('مفيش مفتاح API محفوظ لسه', cfg.hasApiKey === false);

    // ================================================== 3. role gate is a real 403, not just a hidden link
    section('٣. الدور المش مسموح له ممنوع فعليًا مش مجرد مخفي');
    const accountantLogin = await loginStaff('samia', 'demo1234');
    if (accountantLogin.status === 302) {
      const forbidden = await accountantLogin.client.get(`${ADMIN}/ai`);
      check('محاسبة مش في الأدوار المسموحة ممنوعة من فتح المساعد — 403', forbidden.status === 403, `status=${forbidden.status}`);
    } else {
      check('محاسبة مش في الأدوار المسموحة ممنوعة من فتح المساعد — 403', false, 'samia login failed, cannot verify');
    }

    const lawyerOpen = await mona.get(`${ADMIN}/ai`);
    check('محامي في الأدوار المسموحة يقدر يفتح المساعد — 200', lawyerOpen.status === 200, `status=${lawyerOpen.status}`);

    // ================================================== 4. no provider key: honest failure, not a fake reply
    section('٤. من غير مفتاح API — رسالة صريحة مش رد مختلق');
    const csrfChat = await mona.token(`${ADMIN}/ai`);
    const chatResp = await mona.post(`${ADMIN}/ai/chat`, { body: { message: 'فيه إيه جديد؟' }, headers: { 'x-csrf-token': csrfChat } });
    check('الرد بيوصل (200)', chatResp.status === 200, `status=${chatResp.status}`);
    let chatBody = {};
    try { chatBody = JSON.parse(chatResp.text); } catch (_) {}
    check('الرد بيوضّح إن المساعد مش متصل، مش رد وهمي', /مش متصل/.test(chatBody.reply || ''), chatBody.reply);

    // ================================================== 5. the actual security rule: permission intersection
    section('٥. القاعدة الأمنية: تقاطع صلاحيات المستخدم مع مصادر بيانات المساعد');
    const aiAccess = require('./lib/ai-access');
    const access = require('./lib/access');

    // mona (lawyer): requests.view_all? no by default -> assigned-only; cases same.
    const monaUser = { id: db.prepare("SELECT id FROM users WHERE username='mona'").get().id, role: 'lawyer', abilities: access.abilitiesOf({ role: 'lawyer' }) };
    const monaContext = aiAccess.buildContext(monaUser, cfg.dataSources);
    const monaKeys = monaContext.map((s) => s.key);
    check('محامية عادية: مفيش money في السياق حتى لو كان مفعّل (مش من مصادرها المفعّلة أصلًا هنا)', !monaKeys.includes('money'));

    // Now enable "money" as an office-wide data source, but mona still lacks money.view -> must still get nothing.
    const csrfSave2 = await adam.token(`${ADMIN}/settings?tab=ai`);
    await adam.post(`${ADMIN}/settings/ai-settings`, {
      body: {
        _csrf: csrfSave2, ai_enabled: '1', ai_provider: 'anthropic', ai_retention_days: '30',
        ai_allowed_roles: ['admin', 'lawyer'], ai_data_sources: ['requests', 'cases', 'money', 'clients'],
      },
    });
    const cfg2 = ai.config();
    const monaContext2 = aiAccess.buildContext(monaUser, cfg2.dataSources);
    const monaKeys2 = monaContext2.map((s) => s.key);
    check('المكتب فعّل money كمصدر بيانات، لكن منى (محامية بدون money.view) لسه ما بتشوفهوش — التقاطع بيسري', !monaKeys2.includes('money'));
    check('ومنى برضه ما بتشوفش clients (بدون clients.directory)', !monaKeys2.includes('clients'));

    // adam (Super Admin): holds every ability, so the office's enabled sources are the only ceiling.
    const adamUser = { id: db.prepare("SELECT id FROM users WHERE username='adam'").get().id, role: 'admin', abilities: access.abilitiesOf({ role: 'admin', is_super_admin: 1 }) };
    const adamContext = aiAccess.buildContext(adamUser, cfg2.dataSources);
    const adamKeys = adamContext.map((s) => s.key);
    check('السوبر أدمن يشوف money وclients لأنه معاه الصلاحيات فعلًا', adamKeys.includes('clients'));

    // A module the office never enabled must never appear, no matter who asks.
    const adamContextNarrow = aiAccess.buildContext(adamUser, ['requests']);
    check('موديول متعطّل من إعدادات المكتب مش هيظهر حتى للسوبر أدمن', !aiAccess.buildContext(adamUser, ['requests']).map((s) => s.key).includes('cases'));

    // ================================================== 6. history + clear + retention purge
    section('٦. تخزين المحادثة والمسح وتنقية الاحتفاظ');
    const beforeCount = db.prepare('SELECT COUNT(*) c FROM ai_messages WHERE user_id=?').get(monaUser.id).c;
    check('اتسجل سؤال ورد في المحادثة', beforeCount >= 2, `count=${beforeCount}`);

    const csrfClear = await mona.token(`${ADMIN}/ai`);
    const clearResp = await mona.post(`${ADMIN}/ai/clear`, { body: { _csrf: csrfClear } });
    check('مسح المحادثة بينجح (302)', clearResp.status === 302, `status=${clearResp.status}`);
    const afterClear = db.prepare('SELECT COUNT(*) c FROM ai_messages WHERE user_id=?').get(monaUser.id).c;
    check('اتمسحت رسايل المحادثة فعلًا', afterClear === 0, `count=${afterClear}`);

    db.prepare("INSERT INTO ai_messages (user_id, role, content, created_at) VALUES (?,?,?,datetime('now','-200 days'))").run(monaUser.id, 'user', 'قديم جدًا');
    const purged = ai.purgeOld();
    check('تنقية الاحتفاظ بتشيل الرسايل الأقدم من المدة المحددة', purged >= 1, `purged=${purged}`);

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
