const { addColumn } = require('../migrate');

exports.up = (db) => {
  addColumn(db, 'requests', 'reopened_count', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'requests', 'last_reopened_at', 'TEXT');
  addColumn(db, 'requests', 'completion_summary', 'TEXT');
  addColumn(db, 'requests', 'completion_rating', 'INTEGER');
  addColumn(db, 'treasury_transactions', 'group_ref', 'TEXT');
  addColumn(db, 'treasury_transactions', 'transaction_time', 'TEXT');
  addColumn(db, 'treasury_transactions', 'client_id', 'INTEGER REFERENCES clients(id)');
  addColumn(db, 'treasury_transactions', 'request_id', 'INTEGER REFERENCES requests(id)');
  addColumn(db, 'treasury_transactions', 'bank_name', 'TEXT');
  addColumn(db, 'treasury_transactions', 'account_no', 'TEXT');
  addColumn(db, 'treasury_transactions', 'recipient_name', 'TEXT');
  addColumn(db, 'treasury_transactions', 'notes', 'TEXT');
  addColumn(db, 'treasury_transactions', 'attachment_path', 'TEXT');
  addColumn(db, 'treasury_transactions', 'approval_status', "TEXT NOT NULL DEFAULT 'approved'");
  addColumn(db, 'performance_reviews', 'electronic_score', 'REAL DEFAULT 0');
  addColumn(db, 'performance_reviews', 'administrative_score', 'REAL DEFAULT 0');

  db.exec(`
    CREATE TABLE IF NOT EXISTS request_time_pauses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      note TEXT NOT NULL,
      proof_path TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at TEXT NOT NULL DEFAULT(datetime('now')),
      approved_at TEXT,
      approved_by INTEGER REFERENCES users(id),
      resumed_at TEXT,
      resumed_by INTEGER REFERENCES users(id),
      created_by INTEGER REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_request_pauses ON request_time_pauses(request_id,status,started_at);

    CREATE TABLE IF NOT EXISTS request_assignee_shares (
      request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      contribution_percent REAL NOT NULL DEFAULT 0,
      PRIMARY KEY(request_id,user_id)
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT UNIQUE NOT NULL,
      opened_by_type TEXT NOT NULL DEFAULT 'guest',
      opened_by_user_id INTEGER REFERENCES users(id),
      opened_by_client_id INTEGER REFERENCES clients(id),
      requester_name TEXT NOT NULL,
      requester_email TEXT,
      requester_phone TEXT,
      client_id INTEGER REFERENCES clients(id),
      company_id INTEGER REFERENCES companies(id),
      branch_id INTEGER REFERENCES company_branches(id),
      request_id INTEGER REFERENCES requests(id),
      subscription_ref TEXT,
      issue_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'new',
      due_at TEXT,
      first_response_at TEXT,
      resolved_at TEXT,
      closed_at TEXT,
      reopened_until TEXT,
      rating INTEGER,
      rating_note TEXT,
      created_at TEXT NOT NULL DEFAULT(datetime('now')),
      updated_at TEXT NOT NULL DEFAULT(datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_support_status ON support_tickets(status,priority,created_at);
    CREATE INDEX IF NOT EXISTS idx_support_client ON support_tickets(opened_by_client_id,created_at);

    CREATE TABLE IF NOT EXISTS support_ticket_assignees (
      ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_at TEXT NOT NULL DEFAULT(datetime('now')),
      PRIMARY KEY(ticket_id,user_id)
    );

    CREATE TABLE IF NOT EXISTS support_ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      author_type TEXT NOT NULL,
      author_id INTEGER,
      author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      internal INTEGER NOT NULL DEFAULT 0,
      attachment_path TEXT,
      created_at TEXT NOT NULL DEFAULT(datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_support_messages ON support_ticket_messages(ticket_id,id);

    CREATE TABLE IF NOT EXISTS support_ticket_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      details TEXT,
      actor_id INTEGER,
      actor_name TEXT,
      created_at TEXT NOT NULL DEFAULT(datetime('now'))
    );
  `);
};
