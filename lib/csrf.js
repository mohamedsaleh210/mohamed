const crypto = require('crypto');

// Without this, any other website can make a logged-in admin's browser submit
// a form here — deleting a service, changing a price — just by getting them to
// visit a page. Every POST must carry a token that only our own pages contain.
function csrf(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  // Available in EJS as: <%- csrfField %>
  res.locals.csrfField = `<input type="hidden" name="_csrf" value="${req.session.csrfToken}">`;

  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  // A multipart body (file upload) is not parsed yet at this point — only
  // multer can read it, and multer runs inside the route. So the token cannot
  // be in req.body here. Such requests are checked again after parsing, by
  // verifyDeferred(), which the upload routes call.
  if ((req.get('content-type') || '').startsWith('multipart/form-data')) {
    req.csrfDeferred = true;
    return next();
  }

  if (!matches(req)) return reject(res);
  next();
}

/** Constant-time comparison of the submitted token against the session's. */
function matches(req) {
  const sent = String(req.body?._csrf || req.get('x-csrf-token') || '');
  const expected = String(req.session?.csrfToken || '');

  if (!expected || sent.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
}

const reject = (res) => res.status(403).render('errors/csrf', { layout: false });

/**
 * Runs the check that was postponed for a multipart request. Must be called
 * after the body has been parsed and before anything is written.
 */
function verifyDeferred(req, res, next) {
  if (!req.csrfDeferred) return next();
  if (!matches(req)) return reject(res);
  req.csrfDeferred = false;
  next();
}

module.exports = csrf;
module.exports.verifyDeferred = verifyDeferred;
