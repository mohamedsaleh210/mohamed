const { db, getSetting, getBool } = require('../db');
const aiAccess = require('./ai-access');

const ALL_ROLES = ['admin', 'supervisor', 'lawyer', 'accountant'];

function config() {
  return {
    enabled: getBool('ai_enabled', false),
    provider: getSetting('ai_provider', 'anthropic') === 'openai' ? 'openai' : 'anthropic',
    model: getSetting('ai_model', ''),
    hasApiKey: !!(getSetting('ai_api_key', '') || '').trim(),
    systemInstructions: getSetting('ai_system_instructions', ''),
    welcomeMessage: getSetting('ai_welcome_message', '') || 'أهلاً! أقدر أساعدك تسأل عن بيانات المكتب اللي مسموح لك تشوفها.',
    allowedRoles: (getSetting('ai_allowed_roles', ALL_ROLES.join(',')) || '')
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean),
    dataSources: (getSetting('ai_data_sources', '') || '').split(',').map((s) => s.trim()).filter(Boolean),
    auditLog: getBool('ai_audit_log', true),
    retentionDays: Math.max(1, parseInt(getSetting('ai_retention_days', '90'), 10) || 90),
    // 0-1, one decimal place — the providers' own range. Left at a
    // conservative default (lower = more literal) since this assistant is
    // meant to report on real office data, not write creatively.
    temperature: Math.min(1, Math.max(0, parseFloat(getSetting('ai_temperature', '0.3')) || 0.3)),
    maxTokens: Math.min(4096, Math.max(256, parseInt(getSetting('ai_max_tokens', '1024'), 10) || 1024)),
  };
}

/**
 * Whether this person can open the assistant at all — the office's own
 * coarse "who may use it" switch. What it can actually see once opened is a
 * separate, stricter question answered by lib/ai-access.js's intersection
 * with the person's real abilities.
 */
function canUse(user) {
  if (!user) return false;
  const cfg = config();
  return cfg.enabled && cfg.allowedRoles.includes(user.role);
}

function buildSystemPrompt(cfg, contextSections) {
  let prompt =
    'أنت المساعد الذكي داخل نظام سند لإدارة مكتب قانوني. جاوب بالعربية ما لم يُطلب غير ذلك، ' +
    'بإيجاز ودقة. اعتمد فقط على البيانات المرفقة تحت — لا تختلق أرقامًا أو أسماء غير موجودة فيها، ' +
    'ولو سُئلت عن شيء غير متاح في البيانات المرفقة وضّح أنه غير متاح لك بدل تخمينه.';
  if (cfg.systemInstructions) prompt += `\n\nتعليمات إضافية من المكتب:\n${cfg.systemInstructions}`;

  if (contextSections.length) {
    prompt += '\n\nبيانات حقيقية من النظام (النطاق المسموح به لهذا المستخدم فقط):';
    contextSections.forEach((s) => {
      prompt += `\n\n## ${s.label}\n${JSON.stringify(s.rows)}`;
    });
  } else {
    prompt += '\n\nمفيش بيانات مفعّلة أو متاحة لهذا المستخدم حاليًا — جاوب بعموميات عن استخدام النظام فقط.';
  }
  return prompt;
}

async function callProvider(cfg, apiKey, system, history) {
  if (!apiKey) {
    return { ok: false, reply: 'المساعد الذكي مش متصل حاليًا — يحتاج مفتاح API يتضاف من إعدادات الذكاء الاصطناعي.' };
  }
  try {
    if (cfg.provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: cfg.model || 'gpt-4o-mini',
          messages: [{ role: 'system', content: system }, ...history],
          temperature: cfg.temperature,
          max_tokens: cfg.maxTokens,
        }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return { ok: true, reply: data.choices?.[0]?.message?.content || '' };
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: cfg.model || 'claude-sonnet-4-5',
        max_tokens: cfg.maxTokens,
        temperature: cfg.temperature,
        system,
        messages: history,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return { ok: true, reply: (data.content || []).map((c) => c.text || '').join('') };
  } catch (err) {
    console.error('AI provider call failed:', err.message);
    return { ok: false, reply: 'تعذّر الاتصال بمزوّد الذكاء الاصطناعي حاليًا. حاول تاني بعد شوية.' };
  }
}

const HISTORY_LIMIT = 20;

function recentMessages(userId, limit = HISTORY_LIMIT) {
  return db
    .prepare('SELECT role, content FROM ai_messages WHERE user_id = ? ORDER BY id DESC LIMIT ?')
    .all(userId, limit)
    .reverse();
}

function storeMessage(userId, role, content) {
  db.prepare('INSERT INTO ai_messages (user_id, role, content) VALUES (?,?,?)').run(userId, role, content);
}

/** Asks the assistant a question, scoped entirely to what this user may see. */
async function ask(user, question) {
  const cfg = config();
  const apiKey = (getSetting('ai_api_key', '') || '').trim();
  const contextSections = aiAccess.buildContext(user, cfg.dataSources);
  const system = buildSystemPrompt(cfg, contextSections);

  storeMessage(user.id, 'user', question);
  const history = recentMessages(user.id).map((m) => ({ role: m.role, content: m.content }));

  const result = await callProvider(cfg, apiKey, system, history);
  storeMessage(user.id, 'assistant', result.reply);

  if (cfg.auditLog) {
    require('./audit').log({ session: { user } }, 'ai.chat', {
      type: 'ai',
      id: user.id,
      label: user.display_name || user.username,
      details: `سؤال: ${question.slice(0, 200)}`,
    });
  }

  return { reply: result.reply, ok: result.ok, modulesUsed: contextSections.map((s) => s.key) };
}

function clearHistory(userId) {
  db.prepare('DELETE FROM ai_messages WHERE user_id = ?').run(userId);
}

/** Purges conversation rows past the configured retention window. */
function purgeOld() {
  const cfg = config();
  const info = db.prepare(`DELETE FROM ai_messages WHERE created_at < datetime('now', ?)`).run(`-${cfg.retentionDays} days`);
  return info.changes;
}

function startHousekeeping() {
  const tick = () => {
    const n = purgeOld();
    if (n) console.log(`  AI chat housekeeping: purged ${n} old message(s)`);
  };
  const timer = setInterval(tick, 24 * 60 * 60 * 1000);
  if (timer.unref) timer.unref();
}

module.exports = {
  ALL_ROLES,
  config,
  canUse,
  ask,
  recentMessages,
  clearHistory,
  purgeOld,
  startHousekeeping,
};
