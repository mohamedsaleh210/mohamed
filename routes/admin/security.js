const express = require('express');
const { db } = require('../../db');
const security = require('../../lib/security');
const { can } = require('../../middleware/auth');

const router = express.Router();
router.use(can('security.view'));

router.get('/', (req, res) => {
  const users = db
    .prepare(
      `SELECT id, username, display_name, role, active, last_login_at, last_login_ip
       FROM users ORDER BY active DESC, role, id LIMIT 200`
    )
    .all()
    .map((u) => ({
      ...u,
      logins: security.recentFor(u.id, 3),
      ipCount: security.distinctIpCount(u.id, 30),
      sessions: security.activeSessions(u.id),
    }));

  const failures = security.recentFailures(30);

  // Repeated failures from one address is the pattern worth surfacing;
  // a single typo is not.
  const byIp = {};
  failures.forEach((f) => {
    byIp[f.ip] = (byIp[f.ip] || 0) + 1;
  });
  const suspicious = Object.entries(byIp)
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1]);

  res.render('admin/security', { users, failures, suspicious });
});

router.get('/log', (req, res) => {
  res.render('admin/security_log', { entries: security.allRecent(200) });
});

module.exports = router;
