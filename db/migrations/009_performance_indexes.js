// Indexes for the queries the admin runs constantly. Without these, every list
// view scans the whole table — fine at 10 requests, painful at 10,000.
exports.up = (db) => {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_requests_status    ON requests(status);
    CREATE INDEX IF NOT EXISTS idx_requests_archived  ON requests(archived_at);
    CREATE INDEX IF NOT EXISTS idx_requests_deadline  ON requests(deadline);
    CREATE INDEX IF NOT EXISTS idx_requests_client    ON requests(client_id);
    CREATE INDEX IF NOT EXISTS idx_requests_ref       ON requests(ref);
    CREATE INDEX IF NOT EXISTS idx_requests_created   ON requests(id DESC);
    CREATE INDEX IF NOT EXISTS idx_requests_email     ON requests(email);

    CREATE INDEX IF NOT EXISTS idx_todos_request      ON todos(request_id, sort);
    CREATE INDEX IF NOT EXISTS idx_reqs_request       ON requirements(request_id);
    CREATE INDEX IF NOT EXISTS idx_docs_request       ON documents(request_id);
    CREATE INDEX IF NOT EXISTS idx_comments_parent    ON comments(parent_id);
    CREATE INDEX IF NOT EXISTS idx_services_category  ON services(category_id, sort);
    CREATE INDEX IF NOT EXISTS idx_services_active    ON services(active, is_consultation);
  `);

  // Lets SQLite pick better plans on the joins above.
  db.exec('ANALYZE');
};
