const { addColumn } = require('../migrate');

/**
 * Several services on one request.
 *
 * Office work is compound: forming a company means the deed, then the
 * commercial registry, then the tax card — each one depends on the last. Filing
 * those as three separate requests would mean three sets of fees, three
 * deadlines and three conversations about one job.
 *
 * So a request keeps its primary service (which is what the page, the label and
 * every existing screen read) and gains a list of everything else it covers.
 *
 * And a request may legitimately have no service at all: a client who describes
 * a problem without knowing what it is called is the common case, not an edge
 * one, and the office would rather have that request than not.
 */
exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS request_services (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
      label      TEXT NOT NULL,
      sort       INTEGER DEFAULT 0,
      added_by   TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(request_id, service_id)
    );

    CREATE INDEX IF NOT EXISTS idx_request_services ON request_services(request_id, sort);
    CREATE INDEX IF NOT EXISTS idx_request_services_svc ON request_services(service_id);
  `);

  // Marks a request the client described in their own words rather than
  // choosing — the office triages these differently.
  addColumn(db, 'requests', 'is_custom', 'INTEGER DEFAULT 0');

  // Existing requests get their single service as the first entry, so every
  // screen can read one list instead of two shapes.
  db.prepare(
    `INSERT OR IGNORE INTO request_services (request_id, service_id, label, sort, added_by)
     SELECT id, service_id, COALESCE(service_label, 'خدمة'), 0, 'النظام'
     FROM requests WHERE service_id IS NOT NULL`
  ).run();

  // Whether the public form limits itself to the page the visitor came from.
  //
  // On by default: an office with four pages and a hundred and fifty services
  // would otherwise show all of them to somebody who came about one company
  // registration. Offices with few services can turn it off.
  db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('scope_services_by_page', '1')"
  ).run();
};
