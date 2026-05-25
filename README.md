# polyrepo-test-be

Backend half of the polyrepo demo: a tiny REST API for a TODO list, backed by PostgreSQL. Pairs with [`polyrepo-test-fe`](../polyrepo-test-fe) (or any other repo of yours) over HTTP.

- **Runtime:** Node.js 20 + Express
- **Database:** PostgreSQL 16 (containerised, with seed data)
- **Container orchestration:** `docker-compose.yml` brings up `api` + `db` together

## Endpoints

| Method | Path              | Body                      | Notes                       |
| ------ | ----------------- | ------------------------- | --------------------------- |
| GET    | `/api/health`     | —                         | Returns `{ status: "ok" }`  |
| GET    | `/api/todos`      | —                         | Lists todos, newest first   |
| POST   | `/api/todos`      | `{ "title": "..." }`      | Creates a todo              |
| PATCH  | `/api/todos/:id`  | `{ "done": true \| false }` | Toggles `done`              |
| DELETE | `/api/todos/:id`  | —                         | Deletes a todo              |

## Run locally

Prerequisite: Docker + Docker Compose v2.

```bash
# 1) (one time per host) create the shared network used by the FE repo
docker network create polyrepo-shared || true

# 2) bring up the API + Postgres
docker compose up -d --build

# 3) check it works
curl http://localhost:4000/api/health
curl http://localhost:4000/api/todos
```

The Postgres init scripts in `migrations/` are run by the official `postgres` image only the first time the data volume is empty. To reset the seed:

```bash
docker compose down -v
docker compose up -d --build
```

## Configuration

Copy `.env.example` to `.env` and tweak as needed. Defaults are:

| Variable      | Default | Notes                                |
| ------------- | ------- | ------------------------------------ |
| `API_PORT`    | `4000`  | Host-side port for the API           |
| `PGPORT_HOST` | `5432`  | Host-side port for Postgres          |
| `PGUSER`      | `todos` | Both Postgres user and role          |
| `PGPASSWORD`  | `todos` | Demo only — change for anything real |
| `PGDATABASE`  | `todos` | Database name                        |

## How the FE talks to the BE

Both stacks join an external Docker network named `polyrepo-shared`. The FE's nginx is configured to proxy `/api/...` to `http://api:4000`, so DNS resolution happens inside Docker. Nothing on the FE side needs to know your host IP.

If you want to run the FE outside Docker (e.g. `npm run dev`), point it at the host-exposed port:

```bash
export VITE_API_TARGET=http://localhost:4000
```

## Layout

```
polyrepo-test-be/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── migrations/
│   └── 001_init.sql        # schema + seed, run by the postgres image
└── src/
    ├── server.js           # Express app, routes, graceful shutdown
    └── db.js               # pg pool + idempotent ensureSchema()
```
