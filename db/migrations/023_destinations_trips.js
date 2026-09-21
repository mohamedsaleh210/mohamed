/**
 * Destinations and errands.
 *
 * The office does not only process paperwork — somebody physically goes to the
 * ministry, the registry, the district. The question that has no answer today
 * is "we are going to the foreign ministry on Sunday: which files need
 * something there?"
 *
 * Two layers: a destination attached to a request (what is needed where), and
 * an errand that groups those into one journey on one day.
 */
exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS destinations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      address    TEXT,
      note       TEXT,
      colour     TEXT DEFAULT '#2f7bbf',
      sort       INTEGER DEFAULT 0,
      active     INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- What a given request needs from a given place, and whether it is done.
    CREATE TABLE IF NOT EXISTS request_destinations (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id     INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      destination_id INTEGER NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
      task           TEXT,
      status         TEXT DEFAULT 'pending',
      trip_id        INTEGER,
      added_by       TEXT,
      done_by        TEXT,
      done_on        TEXT,
      result_note    TEXT,
      created_at     TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_rd_request ON request_destinations(request_id);
    CREATE INDEX IF NOT EXISTS idx_rd_dest ON request_destinations(destination_id, status);
    CREATE INDEX IF NOT EXISTS idx_rd_trip ON request_destinations(trip_id);

    -- Pending work is what the errand screen reads on every visit, so it gets
    -- an index of its own that stays small as history accumulates.
    CREATE INDEX IF NOT EXISTS idx_rd_pending
      ON request_destinations(destination_id) WHERE status = 'pending';

    CREATE TABLE IF NOT EXISTS trips (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      destination_id INTEGER REFERENCES destinations(id) ON DELETE SET NULL,
      trip_date      TEXT NOT NULL,
      assignee_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      assignee_name  TEXT,
      status         TEXT DEFAULT 'planned',
      note           TEXT,
      created_by     TEXT,
      created_at     TEXT DEFAULT (datetime('now')),
      closed_at      TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_trips_date ON trips(trip_date DESC);
    CREATE INDEX IF NOT EXISTS idx_trips_open ON trips(trip_date) WHERE status != 'done';
  `);

  // A starting list, so the feature is usable before anyone configures it.
  const seed = [
    ['وزارة الخارجية', '#2f7bbf'],
    ['الشهر العقاري', '#a9853a'],
    ['الحي', '#3a9d6b'],
    ['شركة الكهرباء', '#d98a3d'],
    ['شركة المياه', '#2f7bbf'],
    ['شركة الغاز', '#c15450'],
    ['السجل التجاري', '#8a63c9'],
    ['مصلحة الضرائب', '#66757e'],
  ];

  const exists = db.prepare('SELECT 1 FROM destinations LIMIT 1').get();
  if (!exists) {
    const ins = db.prepare(
      'INSERT INTO destinations (name, colour, sort) VALUES (?,?,?)'
    );
    seed.forEach(([name, colour], i) => ins.run(name, colour, i + 1));
  }
};
