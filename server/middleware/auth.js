const jwt = require('jsonwebtoken');
const config = require('../config');

// Protects a route: requires "Authorization: Bearer <token>".
// On success, req.user.id holds the authenticated user's id.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Log in to continue.' });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: Number(payload.sub) };
    return next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Your session has expired. Log in again.'
      : 'Your session is not valid. Log in again.';
    return res.status(401).json({ error: message });
  }
}

module.exports = { requireAuth };
