# 11 — AI Assistant Architecture

Source: `lib/ai.js` (full), `lib/ai-access.js` (full), `routes/admin/ai.js`,
migration `058_ai_chat.js`. **Tag B (optional module)**, **tag G (provider
choice)**, **tag A (the permission-intersection mechanism itself)**.

## Enable / access

`ai_enabled` (office-wide master switch, default off) +
`ai_allowed_roles` (comma-list, default all four roles: admin,
supervisor, lawyer, accountant). `ai.canUse(user)` requires both.

## Providers — exactly two, hardcoded

`ai_provider`: `'anthropic'` (default) or `'openai'` (anything else
coerces to Anthropic). OpenAI path calls the chat-completions endpoint
directly; Anthropic path calls the messages endpoint directly (raw
`fetch`, not the SDK, `anthropic-version: 2023-06-01` header). Per-
provider default model if `ai_model` is left blank. `ai_api_key` follows
the write-only-secret convention (see `12-notifications-settings.md`).
`ai_temperature` (0–1, default 0.3 — "deliberately conservative since
this assistant is meant to report on real office data, not write
creatively," per the code comment) and `ai_max_tokens` (256–4096, default
1024) are both office-configurable.

## System instructions — single-tier, not platform+office

`buildSystemPrompt()` always starts from **one hardcoded Arabic base
prompt baked into the code** (answer in Arabic, be concise/accurate, rely
only on attached data, never fabricate numbers/names, say "not available"
rather than guess). `ai_system_instructions` (office-settable) is appended
underneath as additional office instructions — this is the **only**
per-tenant customization point; there is no separate platform-level
system-prompt setting distinct from the hardcoded base. `ai_welcome_message`
(office-settable, defaults to a canned Arabic greeting) drives the chat
UI's opening text.

## The permission-intersection rule — the important mechanism

**Two independent gates must both pass before any data reaches the
model:**

1. **Office-level ceiling**: the module key must be present in
   `ai_data_sources` (a comma-list setting — the office admin picks which
   modules the assistant may touch *at all*).
2. **User-level**: `MODULES[key].allowed(user)` — reusing the **exact same
   ability/permission checks the human-facing routes use**, not a
   separate AI-specific permission set:
   - `requests`: always attempted, but filtered through
     `access.visibleRequestFilter(user)` (the identical row-level filter
     the requests list page uses) and only includes money columns if the
     user holds `money.view`.
   - `cases`: `casesLib.visibleFilter(user)`.
   - `clients`: gated on `clients.directory`.
   - `money`: gated on `money.view`.
   - `agenda`: gated on `agenda.view`.
   - `payroll`: self-scoped — `payroll.view_all` sees everyone,
     `payroll.view_own` sees only their own rows, neither ability
     contributes nothing.

`buildContext()` iterates every module key, skips anything not
office-enabled or not user-allowed, catches per-module query errors
individually (logs and skips rather than failing the whole request), and
drops modules that return zero rows — only modules with actual data
become labeled sections in the prompt. **The code states the governing
principle explicitly**: *"the assistant must never see more than the
person asking it could see themselves by clicking around the panel."*
This is the formal statement of the rule the extraction instruction asked
to document:

```
AI ACCESS =
  CONFIGURED DATA SOURCES (office-level allow-list)
  ∩
  REQUESTING USER'S REAL PERMISSIONS (same checks as the human UI)
```

There is no separate "tenant scope ∩ branch/object scope" layer beyond
what's already baked into `visibleRequestFilter`/`visibleFilter` — because,
per `04-company-branch-tenant-model.md`, this platform is single-tenant-
per-deployment, so "tenant scope" is trivially the whole deployment, and
branch scoping isn't enforced at the query level elsewhere either (so the
AI module correctly does not pretend to enforce something the rest of the
app doesn't).

## Conversation / history storage

`ai_messages(user_id, role, content, created_at)` — per-user chat history,
last 20 messages fed back as conversational context on every call (a real
multi-turn chat, not stateless). `ai_retention_days` (default 90, clamped
1–365) drives `purgeOld()`, run on a 24h `setInterval` started at boot
(independent of the backup scheduler's own timer).

## Logging / audit

`ai_audit_log` (default true, office-togglable): when on, every `ask()`
call logs an `ai.chat` audit event (type 'ai', details = first 200 chars
of the question — answers are not put in the audit log, only stored in
`ai_messages`).

## "Provider not connected" — an honest failure state, never faked

If `ai_api_key` is blank, `callProvider()` returns immediately, **without
making any network call**: `{ok: false, reply: 'المساعد الذكي مش متصل
حاليًا — يحتاج مفتاح API...'}` — "the AI assistant isn't connected right
now, needs an API key added from AI settings." If a key is present but
the HTTP call fails (non-2xx or network error), it similarly returns a
generic honest failure message rather than a fabricated success. **Both
failure paths are still stored in `ai_messages`** (so the failure message
itself becomes part of the visible chat history) and `ok:false` is
surfaced to the caller. This is exactly the behavior the extraction
instruction required — verified in code, not assumed.

## For a white-label deployment

The reusable, keep-as-is parts (**tag A**): the office-ceiling ∩
user-permission intersection mechanism, the honest-failure convention, the
write-only-secret settings pattern, the per-user conversation-history
model with retention purge. The swap points per company (**tag D/G**):
provider choice, model, temperature/max-tokens, the office-added system-
instruction text, the welcome message, which roles/modules are allowed.
The one hardcoded base system prompt (**tag E**, Sanad's own house style —
concise, Arabic, no fabrication) is a reasonable default philosophy to
keep but should be reviewed per company's own tone/language requirements
rather than assumed universal.
