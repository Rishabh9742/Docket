const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { STATUSES, PRIORITIES, validateTask } = require('../utils/validate');

const router = express.Router();

// Every route in this file requires a valid token.
router.use(requireAuth);

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const COLUMNS = `
  id, title, description, status, priority, due_date,
  created_at, updated_at, completed_at,
  (due_date IS NOT NULL AND due_date < CURRENT_DATE AND status <> 'done') AS overdue
`;

// Whitelist of sortable columns, so user input never reaches the SQL text.
const SORT_COLUMNS = {
  created_at: 'created_at',
  due_date: 'due_date',
  title: 'LOWER(title)',
  priority: "CASE priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END"
};

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) {
    res.status(404).json({ error: 'Task not found.' });
    return null;
  }
  return id;
}

function escapeLike(text) {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// Applies a validated partial update. Returns the updated row, or undefined if
// the task does not exist or belongs to someone else.
async function updateTask(id, userId, value) {
  const keys = Object.keys(value); // keys come from validateTask, never from raw input
  const params = [];
  const sets = keys.map((key) => {
    params.push(value[key]);
    return `${key} = $${params.length}`;
  });

  if ('status' in value) {
    const idx = keys.indexOf('status') + 1;
    sets.push(
      `completed_at = CASE WHEN $${idx}::text = 'done' THEN COALESCE(completed_at, now()) ELSE NULL END`
    );
  }
  sets.push('updated_at = now()');

  params.push(id, userId);
  const { rows } = await db.query(
    `UPDATE tasks SET ${sets.join(', ')}
     WHERE id = $${params.length - 1} AND user_id = $${params.length}
     RETURNING ${COLUMNS}`,
    params
  );
  return rows[0];
}

// GET /api/tasks/stats
router.get('/stats', asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'todo')::int AS todo,
       COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
       COUNT(*) FILTER (WHERE status = 'done')::int AS done,
       COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status <> 'done')::int AS overdue
     FROM tasks WHERE user_id = $1`,
    [req.user.id]
  );
  res.json({ stats: rows[0] });
}));

// GET /api/tasks?status=&priority=&due=&search=&sort=&order=
router.get('/', asyncHandler(async (req, res) => {
  const { status, priority, due, search, sort = 'created_at', order = 'desc' } = req.query;
  const where = ['user_id = $1'];
  const params = [req.user.id];

  if (status) {
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status filter.' });
    params.push(status);
    where.push(`status = $${params.length}`);
  }

  if (priority) {
    if (!PRIORITIES.includes(priority)) return res.status(400).json({ error: 'Unknown priority filter.' });
    params.push(priority);
    where.push(`priority = $${params.length}`);
  }

  if (due) {
    const dueFilters = {
      overdue: "due_date < CURRENT_DATE AND status <> 'done'",
      today: 'due_date = CURRENT_DATE',
      week: 'due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7',
      none: 'due_date IS NULL'
    };
    if (!Object.hasOwn(dueFilters, due)) return res.status(400).json({ error: 'Unknown due filter.' });
    where.push(dueFilters[due]);
  }

  if (typeof search === 'string' && search.trim()) {
    params.push(`%${escapeLike(search.trim().slice(0, 100))}%`);
    where.push(`(title ILIKE $${params.length} OR description ILIKE $${params.length})`);
  }

  if (!Object.hasOwn(SORT_COLUMNS, sort)) return res.status(400).json({ error: 'Unknown sort field.' });
  if (!['asc', 'desc'].includes(order)) return res.status(400).json({ error: 'Order must be asc or desc.' });

  const nulls = sort === 'due_date' ? ' NULLS LAST' : '';
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM tasks
     WHERE ${where.join(' AND ')}
     ORDER BY ${SORT_COLUMNS[sort]} ${order.toUpperCase()}${nulls}, id DESC
     LIMIT 500`,
    params
  );

  res.json({ tasks: rows });
}));

// POST /api/tasks
router.post('/', asyncHandler(async (req, res) => {
  const { errors, value } = validateTask(req.body);
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Fix the highlighted fields.', details: errors });
  }

  const { title, description = '', status = 'todo', priority = 'medium', due_date = null } = value;
  const { rows } = await db.query(
    `INSERT INTO tasks (user_id, title, description, status, priority, due_date, completed_at)
     VALUES ($1, $2, $3, $4::text, $5, $6, CASE WHEN $4::text = 'done' THEN now() END)
     RETURNING ${COLUMNS}`,
    [req.user.id, title, description, status, priority, due_date]
  );

  res.status(201).json({ task: rows[0] });
}));

// GET /api/tasks/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;

  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM tasks WHERE id = $1 AND user_id = $2`,
    [id, req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Task not found.' });
  res.json({ task: rows[0] });
}));

// PATCH /api/tasks/:id   (any subset of title, description, status, priority, due_date)
router.patch('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;

  const { errors, value } = validateTask(req.body, { partial: true });
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Fix the highlighted fields.', details: errors });
  }

  const task = await updateTask(id, req.user.id, value);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  res.json({ task });
}));

// PATCH /api/tasks/:id/status   ({ "status": "done" })
router.patch('/:id/status', asyncHandler(async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;

  const { errors, value } = validateTask({ status: req.body && req.body.status }, { partial: true });
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Fix the highlighted fields.', details: errors });
  }

  const task = await updateTask(id, req.user.id, value);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  res.json({ task });
}));

// DELETE /api/tasks/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;

  const { rowCount } = await db.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (!rowCount) return res.status(404).json({ error: 'Task not found.' });
  res.status(204).end();
}));

module.exports = router;
