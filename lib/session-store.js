const { Store } = require('express-session');
const { db } = require('../db');

// A minimal session store on top of the database we already have.
// Deliberately not a new npm dependency: it is ~50 lines, it uses the same
// SQLite file as everything else, and it means one less package to keep patched.
class SqliteStore extends Store {
  constructor() {
    super();
    this.stmts = {
      get: db.prepare('SELECT data, expires_at FROM sessions WHERE sid = ?'),
      set: db.prepare(
        `INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)
         ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`
      ),
      destroy: db.prepare('DELETE FROM sessions WHERE sid = ?'),
      touch: db.prepare('UPDATE sessions SET expires_at = ? WHERE sid = ?'),
      sweep: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
      all: db.prepare('SELECT sid, data FROM sessions WHERE expires_at >= ?'),
      length: db.prepare('SELECT COUNT(*) c FROM sessions WHERE expires_at >= ?'),
      clear: db.prepare('DELETE FROM sessions'),
    };

    // Clear out expired rows hourly so the table cannot grow without bound.
    this.sweeper = setInterval(() => this.sweep(), 60 * 60 * 1000);
    if (this.sweeper.unref) this.sweeper.unref();
    this.sweep();
  }

  sweep() {
    try {
      this.stmts.sweep.run(Date.now());
    } catch (_) {
      /* a failed sweep is not worth crashing the server over */
    }
  }

  expiryOf(sess) {
    const ms =
      sess && sess.cookie && sess.cookie.maxAge ? sess.cookie.maxAge : 7 * 24 * 60 * 60 * 1000;
    return Date.now() + ms;
  }

  get(sid, cb) {
    try {
      const row = this.stmts.get.get(sid);
      if (!row) return cb(null, null);
      if (row.expires_at < Date.now()) {
        this.stmts.destroy.run(sid);
        return cb(null, null);
      }
      cb(null, JSON.parse(row.data));
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sess, cb) {
    try {
      this.stmts.set.run(sid, JSON.stringify(sess), this.expiryOf(sess));
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  touch(sid, sess, cb) {
    try {
      this.stmts.touch.run(this.expiryOf(sess), sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      this.stmts.destroy.run(sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  length(cb) {
    try {
      cb(null, this.stmts.length.get(Date.now()).c);
    } catch (err) {
      cb(err);
    }
  }

  clear(cb) {
    try {
      this.stmts.clear.run();
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  all(cb) {
    try {
      cb(
        null,
        this.stmts.all.all(Date.now()).map((r) => JSON.parse(r.data))
      );
    } catch (err) {
      cb(err);
    }
  }
}

module.exports = SqliteStore;
