const express = require('express');
const ai = require('../../lib/ai');

const router = express.Router();

router.use((req, res, next) => {
  if (!ai.canUse(req.user)) return res.status(403).render('admin/denied');
  next();
});

router.get('/', (req, res) => {
  const cfg = ai.config();
  res.render('admin/ai_chat', {
    cfg,
    history: ai.recentMessages(req.user.id, 50),
  });
});

router.post('/chat', async (req, res) => {
  const question = String(req.body.message || '').trim();
  if (!question) return res.status(400).json({ error: 'empty' });
  if (question.length > 2000) return res.status(400).json({ error: 'too_long' });

  try {
    const result = await ai.ask(req.user, question);
    res.json({ reply: result.reply, modulesUsed: result.modulesUsed });
  } catch (err) {
    console.error('AI chat failed:', err.message);
    res.status(500).json({ error: 'server' });
  }
});

router.post('/clear', (req, res) => {
  ai.clearHistory(req.user.id);
  res.redirect(`${req.adminPath}/ai`);
});

module.exports = router;
