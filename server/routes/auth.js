const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');
const { validateRegistration, validateLogin } = require('../utils/validate');

const router = express.Router();

// Used to keep login timing similar whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function issueToken(user) {
  return jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email };
}

// POST /api/auth/register
router.post('/register', asyncHandler(async (req, res) => {
  const { errors, value } = validateRegistration(req.body);
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Fix the highlighted fields.', details: errors });
  }

  const hash = await bcrypt.hash(value.password, 12);

  try {
    const { rows } = await db.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
      [value.name, value.email, hash]
    );
    const user = rows[0];
    return res.status(201).json({ token: issueToken(user), user: publicUser(user) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'An account with this email already exists.',
        details: { email: 'This email is already registered.' }
      });
    }
    throw err;
  }
}));

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { errors, value } = validateLogin(req.body);
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Fix the highlighted fields.', details: errors });
  }

  const { rows } = await db.query(
    'SELECT id, name, email, password_hash FROM users WHERE email = $1',
    [value.email]
  );
  const user = rows[0];

  const matches = await bcrypt.compare(value.password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !matches) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  return res.json({ token: issueToken(user), user: publicUser(user) });
}));

// GET /api/auth/me  (protected)
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT id, name, email FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]) return res.status(401).json({ error: 'Your account no longer exists.' });
  return res.json({ user: publicUser(rows[0]) });
}));

module.exports = router;
