const { db } = require('../db');

/**
 * Builds the two-level thread the admin view renders.
 * Replies to replies are stored against the same top-level parent, so a thread
 * never nests deeper than one indent — which is what keeps it readable on a
 * phone. The "who is being answered" information survives as an @mention in
 * the body instead of as another level of indentation.
 */
function threadFor(requestId) {
  // The photo is joined in so the thread can show faces without a query per
  // comment.
  const rows = db
    .prepare(
      `SELECT c.*, u.photo AS author_photo
       FROM comments c
       LEFT JOIN users u ON u.id = c.author_id
       WHERE c.request_id = ? ORDER BY c.id`
    )
    .all(requestId);

  const byId = new Map();
  rows.forEach((r) => byId.set(r.id, { ...r, replies: [] }));

  const roots = [];
  byId.forEach((c) => {
    if (c.parent_id && byId.has(c.parent_id)) byId.get(c.parent_id).replies.push(c);
    else roots.push(c);
  });

  // Newest thread last, matching how a conversation actually reads.
  return roots;
}

/** Resolves the top-level ancestor so depth can never exceed two. */
function rootIdOf(commentId) {
  let current = db.prepare('SELECT id, parent_id FROM comments WHERE id = ?').get(commentId);
  let guard = 0;
  while (current && current.parent_id && guard < 20) {
    current = db.prepare('SELECT id, parent_id FROM comments WHERE id = ?').get(current.parent_id);
    guard += 1;
  }
  return current ? current.id : null;
}

function countFor(requestId) {
  return db
    .prepare('SELECT COUNT(*) c FROM comments WHERE request_id = ? AND deleted_at IS NULL')
    .get(requestId).c;
}

module.exports = { threadFor, rootIdOf, countFor };
