// Repairs values that earlier, looser parsing let through: amounts that are
// not finite numbers, and deadlines that are not calendar dates. Both break
// every screen that reads them, and neither can be corrected by hand once a
// total has been poisoned.
exports.up = (db) => {
  // SQLite stores Infinity as the literal 9e999 and NaN as NULL; both fail a
  // round-trip comparison against themselves or a bound.
  db.prepare(
    `DELETE FROM fee_items
     WHERE amount IS NULL
        OR amount != amount
        OR ABS(amount) > 100000000`
  ).run();

  db.prepare(
    `UPDATE requests SET total_amount =
       (SELECT COALESCE(SUM(amount), 0) FROM fee_items f WHERE f.request_id = requests.id)`
  ).run();

  db.prepare(
    `UPDATE requests SET paid_amount = 0
     WHERE paid_amount IS NULL OR paid_amount != paid_amount
        OR paid_amount < 0 OR ABS(paid_amount) > 100000000`
  ).run();

  // Anything that is not YYYY-MM-DD is cleared rather than guessed at.
  db.prepare(
    `UPDATE requests SET deadline = NULL, deadline_alerted_at = NULL
     WHERE deadline IS NOT NULL
       AND (length(deadline) != 10 OR deadline NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')`
  ).run();

  db.prepare(
    `UPDATE todos SET done_on = NULL
     WHERE done_on IS NOT NULL
       AND (length(done_on) != 10 OR done_on NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')`
  ).run();
};
