# Docket: Full-Stack Task Manager

A task manager with user accounts, deadlines, status tracking and filtering. The back end is Node.js, Express and PostgreSQL. The front end is plain HTML, CSS and JavaScript, served by the same Express app.

## Features

- **Registration and login** with bcrypt-hashed passwords and JWT sessions
- **Protected APIs**: every task route requires a valid token, and every query is scoped to the logged-in user
- **Tasks** with title, description, priority (low, medium, high), status and an optional due date
- **Status changes**: To do, In progress, Done (completion time is recorded and cleared if a task is reopened)
- **Deadlines**: overdue detection, "due today / tomorrow / in N days" labels and an overdue counter
- **Filtering and sorting** by status, priority, due date range and text search, with sorting by date, due date, priority or title
- **PostgreSQL persistence** with constraints and indexes
- **Responsive, accessible UI**: works on phones, labelled controls, keyboard-friendly dialog

## Folder structure

```
docket/
├── package.json
├── .env.example            # copy to .env and edit
├── .gitignore
├── README.md
├── db/
│   └── schema.sql          # users and tasks tables
├── server/
│   ├── index.js            # Express app: security headers, rate limit, routes, static files
│   ├── config.js           # reads and validates environment variables
│   ├── db.js               # PostgreSQL connection pool
│   ├── middleware/
│   │   └── auth.js         # JWT check for protected routes
│   ├── routes/
│   │   ├── auth.js         # register, login, me
│   │   └── tasks.js        # task CRUD, filtering, stats
│   ├── utils/
│   │   └── validate.js     # request validation
│   └── scripts/
│       └── migrate.js      # applies db/schema.sql
└── public/                 # front end
    ├── index.html          # log in / create account
    ├── tasks.html          # task dashboard (login required)
    ├── css/style.css
    └── js/
        ├── api.js          # fetch wrapper, token storage
        ├── auth.js         # login and register forms
        └── tasks.js        # task list, filters, create/edit dialog
```

## Requirements

- [Node.js](https://nodejs.org) 18 or newer
- [PostgreSQL](https://www.postgresql.org/download/) 13 or newer (or Docker, see below)
- [VS Code](https://code.visualstudio.com/)

## Setup in VS Code

### 1. Open the project

**File → Open Folder…** and choose the `docket` folder. Open the built-in terminal with `` Ctrl+` `` (`` Cmd+` `` on Mac).

### 2. Start PostgreSQL

Pick one option.

**Option A: Docker (quickest)**

```bash
docker run --name docket-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=docket -p 5432:5432 -d postgres:16
```

**Option B: PostgreSQL installed on your machine**

```bash
psql -U postgres -c "CREATE DATABASE docket;"
```

On Windows you can run the same command in the "SQL Shell (psql)" app that comes with the installer.

### 3. Create your `.env` file

```bash
cp .env.example .env        # Windows: copy .env.example .env
```

Open `.env` and check:

- `DATABASE_URL` matches your PostgreSQL user, password, host and database name.
- `JWT_SECRET` is a long random string. Generate one with:

  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```

### 4. Install dependencies and create the tables

```bash
npm install
npm run db:migrate
```

You should see `Database is ready: users and tasks tables exist.`

### 5. Run the app

```bash
npm run dev      # restarts automatically when you save a file
# or
npm start        # plain start
```

Open **http://localhost:3000**, create an account and add a task.

## API reference

All task endpoints need the header `Authorization: Bearer <token>`. Errors come back as `{ "error": "message", "details": { "field": "message" } }`.

### Auth

| Method | Endpoint | Body | Notes |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | `name`, `email`, `password` | Returns `token` and `user`. Password: 8+ characters with a letter and a number |
| POST | `/api/auth/login` | `email`, `password` | Returns `token` and `user` |
| GET | `/api/auth/me` | none | Protected. Returns the current user |

### Tasks (all protected)

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/tasks` | List your tasks. Supports the filters below |
| GET | `/api/tasks/stats` | Counts: total, todo, in_progress, done, overdue |
| POST | `/api/tasks` | Create a task. Required: `title`. Optional: `description`, `status`, `priority`, `due_date` |
| GET | `/api/tasks/:id` | Get one task |
| PATCH | `/api/tasks/:id` | Update any subset of the task fields |
| PATCH | `/api/tasks/:id/status` | Change status only: `{ "status": "done" }` |
| DELETE | `/api/tasks/:id` | Delete a task (returns 204) |

**Query parameters for `GET /api/tasks`**

| Parameter | Values |
| --- | --- |
| `status` | `todo`, `in_progress`, `done` |
| `priority` | `low`, `medium`, `high` |
| `due` | `overdue`, `today`, `week` (next 7 days), `none` (no due date) |
| `search` | Text matched against title and description |
| `sort` | `created_at` (default), `due_date`, `priority`, `title` |
| `order` | `asc` or `desc` (default) |

Filters can be combined, for example `/api/tasks?status=todo&priority=high&due=week&sort=due_date&order=asc`.

### Try it with curl

```bash
# Register and capture the token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada","email":"ada@example.com","password":"secret123"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).token")

# Create a task
curl -X POST http://localhost:3000/api/tasks \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Ship the report","due_date":"2026-12-01","priority":"high"}'

# List high-priority tasks
curl "http://localhost:3000/api/tasks?priority=high" -H "Authorization: Bearer $TOKEN"

# Without a token the API refuses
curl -i http://localhost:3000/api/tasks
```

## Security notes

- Passwords are hashed with bcrypt (cost 12) and never returned by the API.
- Every SQL statement uses parameters. Sort columns and filters are checked against whitelists.
- Task queries always include `user_id`, so one user cannot read or change another user's tasks. Other users' task IDs return 404.
- Login errors are generic ("Incorrect email or password") and the timing is kept similar whether or not the email exists.
- Auth endpoints are rate limited, and Helmet adds secure HTTP headers including a Content Security Policy.
- The front end inserts task text with `textContent`, so task content cannot inject HTML.
- The JWT is stored in `localStorage` to keep the example simple. For a production app that handles sensitive data, consider an `httpOnly` cookie with CSRF protection instead.
- Always serve the app over HTTPS in production and set `NODE_ENV=production`.

## Deploying

1. Create a managed PostgreSQL database (Render, Neon, Supabase, Railway and others).
2. Set the environment variables on your host: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`, and `DATABASE_SSL=true` if the provider requires SSL.
3. Run `npm run db:migrate` once against that database.
4. Use `npm start` as the start command.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `Missing required environment variables` | Create `.env` from `.env.example` |
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL isn't running, or `DATABASE_URL` has the wrong host or port |
| `password authentication failed` | The user or password in `DATABASE_URL` is wrong |
| `database "docket" does not exist` | Run the `CREATE DATABASE` step |
| `relation "users" does not exist` | Run `npm run db:migrate` |
| `SSL required` or connection reset on a hosted database | Set `DATABASE_SSL=true` |
| Port 3000 already in use | Change `PORT` in `.env` |
| Logged out unexpectedly | The token expired (default 7 days) or `JWT_SECRET` changed |

## Ideas for extending it

- Password reset by email
- Task categories or projects
- Pagination for very large task lists (the list currently returns up to 500 tasks)
- Automated tests with Jest and Supertest
