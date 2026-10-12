const STATUSES = ['todo', 'in_progress', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDate(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// ---------- Auth ----------
function validateRegistration(body) {
  const errors = {};
  if (!isPlainObject(body)) return { errors: { body: 'Send a JSON object.' }, value: {} };

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!name) errors.name = 'Enter your name.';
  else if (name.length > 80) errors.name = 'Name must be 80 characters or fewer.';

  if (!email) errors.email = 'Enter your email address.';
  else if (!EMAIL_RE.test(email) || email.length > 254) errors.email = 'Enter a valid email address.';

  if (password.length < 8) errors.password = 'Password must be at least 8 characters.';
  else if (Buffer.byteLength(password) > 72) errors.password = 'Password must be 72 bytes or fewer.';
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errors.password = 'Password must include at least one letter and one number.';
  }

  return { errors, value: { name, email, password } };
}

function validateLogin(body) {
  const errors = {};
  if (!isPlainObject(body)) return { errors: { body: 'Send a JSON object.' }, value: {} };

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email) errors.email = 'Enter your email address.';
  if (!password) errors.password = 'Enter your password.';

  return { errors, value: { email, password } };
}

// ---------- Tasks ----------
// With { partial: true } only the fields that are present are validated (used by PATCH).
function validateTask(body, { partial = false } = {}) {
  const errors = {};
  const value = {};

  if (!isPlainObject(body)) return { errors: { body: 'Send a JSON object.' }, value };

  if (!partial || 'title' in body) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) errors.title = 'Title is required.';
    else if (title.length > 120) errors.title = 'Title must be 120 characters or fewer.';
    else value.title = title;
  }

  if ('description' in body) {
    if (body.description === null) {
      value.description = '';
    } else if (typeof body.description !== 'string') {
      errors.description = 'Description must be text.';
    } else if (body.description.trim().length > 2000) {
      errors.description = 'Description must be 2000 characters or fewer.';
    } else {
      value.description = body.description.trim();
    }
  }

  if ('status' in body) {
    if (!STATUSES.includes(body.status)) errors.status = `Status must be one of: ${STATUSES.join(', ')}.`;
    else value.status = body.status;
  }

  if ('priority' in body) {
    if (!PRIORITIES.includes(body.priority)) errors.priority = `Priority must be one of: ${PRIORITIES.join(', ')}.`;
    else value.priority = body.priority;
  }

  if ('due_date' in body) {
    if (body.due_date === null || body.due_date === '') value.due_date = null;
    else if (!isValidDate(body.due_date)) errors.due_date = 'Use a valid date in YYYY-MM-DD format.';
    else value.due_date = body.due_date;
  }

  if (partial && !Object.keys(errors).length && !Object.keys(value).length) {
    errors.body = 'Nothing to update.';
  }

  return { errors, value };
}

module.exports = {
  STATUSES,
  PRIORITIES,
  validateRegistration,
  validateLogin,
  validateTask
};
