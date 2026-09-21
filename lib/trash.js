const { db } = require('../db');

// How long a deleted item stays undoable. Long enough that somebody can walk
// away, notice the mistake and come back; short enough that the bin stays small.
const UNDO_WINDOW_DAYS = 45;

/**
 * Moves a row into the trash and deletes it, returning the trash id so the
 * caller can offer an undo link.
 */
function remove({ entity, id, label, row, extra = null, by, deleteFn }) {
  const payload = JSON.stringify({ row, extra });
  const info = db
    .prepare('INSERT INTO trash (entity, entity_id, label, payload, deleted_by) VALUES (?,?,?,?,?)')
    .run(entity, id, label, payload, by);
  deleteFn();
  return Number(info.lastInsertRowid);
}

const get = (trashId) => db.prepare('SELECT * FROM trash WHERE id = ?').get(trashId);

const listRecent = (limit = 50) =>
  db
    .prepare(
      `SELECT * FROM trash WHERE restored_at IS NULL
       ORDER BY id DESC LIMIT ?`
    )
    .all(limit);

const markRestored = (trashId) =>
  db.prepare("UPDATE trash SET restored_at = datetime('now') WHERE id = ?").run(trashId);

/** Items older than the window are gone for good. */
function purgeExpired() {
  db.prepare(
    `DELETE FROM trash WHERE restored_at IS NULL
     AND deleted_at < datetime('now', '-${UNDO_WINDOW_DAYS} days')`
  ).run();
}

module.exports = { remove, get, listRecent, markRestored, purgeExpired, UNDO_WINDOW_DAYS };
