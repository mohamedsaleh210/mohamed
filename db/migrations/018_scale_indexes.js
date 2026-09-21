// Indexes shaped by measurement at 120k requests, where most of the history is
// finished and only a fraction is being worked on.
exports.up = (db) => {
  db.exec(`
    -- Date-window filters ("what came in this week") were scanning: the sort
    -- is by id but the filter is on created_at, so neither index alone helped.
    CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at DESC);

    -- The working set is the open requests, which stay a small slice however
    -- large the archive grows. A partial index keeps its size proportional to
    -- the work, not to the history.
    CREATE INDEX IF NOT EXISTS idx_requests_open
      ON requests(id DESC)
      WHERE archived_at IS NULL AND status NOT IN ('completed','cancelled');

    CREATE INDEX IF NOT EXISTS idx_requests_open_created
      ON requests(created_at DESC)
      WHERE archived_at IS NULL AND status NOT IN ('completed','cancelled');

    -- Dashboard counters group by status over the live rows. A covering index
    -- in that exact order lets SQLite count straight off the index and skip
    -- the temporary B-tree it would otherwise build to group.
    CREATE INDEX IF NOT EXISTS idx_requests_live_status
      ON requests(archived_at, status);
  `);

  db.exec('ANALYZE');
};
