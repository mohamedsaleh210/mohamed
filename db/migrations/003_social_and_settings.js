// Phase 1 — social accounts, plus the settings that later phases read from
// (domain, mail provider, Google keys) so nothing needs a code change to switch on.
exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS social_links (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      platform   TEXT NOT NULL,
      url        TEXT NOT NULL,
      label      TEXT,
      sort       INTEGER DEFAULT 0,
      active     INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const put = (key, value) => {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO NOTHING`
    ).run(key, value);
  };

  // Everything below is editable from the admin Settings page.
  put('site_domain', ''); // e.g. https://sanad-law.com — used for links inside emails
  put('mail_provider', 'resend');
  put('mail_api_key', '');
  put('mail_from_name', 'سند');
  put('mail_from_email', '');
  put('mail_reply_to', '');
  put('office_emails', ''); // comma separated — new-request notifications
  put('google_client_id', '');
  put('google_client_secret', '');
  put('notify_email_enabled', '0'); // staff email notifications: OFF by default
  put('social_show_header', '1');
  put('social_show_footer', '1');
};
