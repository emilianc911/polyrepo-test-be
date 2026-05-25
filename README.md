# polyrepo-test-be

Backend half of the polyrepo demo: a small but real project-management API. Pairs with [`polyrepo-test-fe`](https://github.com/emilianc911/polyrepo-test-fe) over HTTP and WebSocket.

- **Runtime:** Node.js 20 + TypeScript + Express
- **Database:** PostgreSQL 16
- **Cache / pub-sub / queue:** Redis 7
- **Object storage:** MinIO (S3-compatible) for attachments
- **Email:** MailHog for SMTP capture in dev (worker emits welcome / task notifications)
- **Background jobs:** BullMQ workers (separate process in this same repo)
- **Realtime:** WebSocket server, fan-out via Redis pub/sub

## Domain

```
users  ─owns→  projects  ─has→  tasks  ─has→  comments
                                       └─has→  attachments (MinIO)
```

Auth is JWT (Bearer header). A user can only see and modify projects they own.

## Endpoints

| Method | Path                                       | Auth | Notes                              |
| ------ | ------------------------------------------ | ---- | ---------------------------------- |
| GET    | `/api/health`                              | —    | Cheap liveness check               |
| GET    | `/api/health/deep`                         | —    | Pings db, redis, s3                |
| POST   | `/api/auth/register`                       | —    | `{email, password, displayName}`   |
| POST   | `/api/auth/login`                          | —    | Returns `{user, token}`            |
| GET    | `/api/auth/me`                             | yes  | Current user                       |
| GET    | `/api/projects`                            | yes  | Your projects + task counts        |
| POST   | `/api/projects`                            | yes  | Create project                     |
| GET    | `/api/projects/:id`                        | yes  | Single project                     |
| PATCH  | `/api/projects/:id`                        | yes  | Partial update                     |
| DELETE | `/api/projects/:id`                        | yes  | Cascades to tasks/comments         |
| GET    | `/api/projects/:id/tasks`                  | yes  | Tasks ordered by status, priority  |
| POST   | `/api/projects/:id/tasks`                  | yes  | Create task                       |
| PATCH  | `/api/tasks/:id`                           | yes  | Update title/desc/status/priority  |
| DELETE | `/api/tasks/:id`                           | yes  | Delete task                        |
| GET    | `/api/tasks/:id/comments`                  | yes  | Thread (oldest first)              |
| POST   | `/api/tasks/:id/comments`                  | yes  | Add a comment                      |
| GET    | `/api/tasks/:id/attachments`               | yes  | List, with presigned download URLs |
| POST   | `/api/tasks/:id/attachments/presign`       | yes  | Presigned PUT for direct S3 upload |
| POST   | `/api/tasks/:id/attachments/confirm`       | yes  | Persist DB row after PUT succeeds  |
| DELETE | `/api/attachments/:id`                     | yes  | Delete object + row                |

WebSocket: `ws://<host>/ws?token=<JWT>` — client subscribes per project:
```json
{"type":"subscribe","projectId":"<uuid>"}
```
and receives events: `task.created`, `task.updated`, `task.deleted`, `comment.created`, `attachment.created`, `attachment.deleted`, `project.updated`.

## Run locally

Prerequisite: Docker + Compose v2.

```bash
# 1) one-time: shared network so the FE repo can reach `api` by name
docker network create polyrepo-shared || true

# 2) bring it all up
docker compose up -d --build

# 3) sanity
curl http://localhost:4000/api/health
curl http://localhost:4000/api/health/deep | jq
```

The migration script seeds a demo user:

- email: `demo@polyrepo.local`
- password: `demo1234`

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@polyrepo.local","password":"demo1234"}' | jq -r .token)

curl http://localhost:4000/api/projects -H "Authorization: Bearer $TOKEN" | jq
```

To reset everything (drops DB, Redis, MinIO data):
```bash
docker compose down -v
docker compose up -d --build
```

## Service map

| Service   | Image                | Host port (default) | Notes                                    |
| --------- | -------------------- | ------------------- | ---------------------------------------- |
| `api`     | this repo            | `4000`              | Express + WebSocket on `/ws`             |
| `worker`  | this repo (alt CMD)  | —                   | BullMQ consumer, sends mail              |
| `db`      | `postgres:16-alpine` | `5432`              | Schema initialised from `migrations/`    |
| `cache`   | `redis:7-alpine`     | `6379`              | Cache + pub/sub + BullMQ queue           |
| `objects` | `minio/minio:latest` | `9000` API + `9001` console | S3 endpoint for attachments        |
| `mail`    | `mailhog/mailhog`    | `1025` SMTP + `8025` UI | Captures all outbound mail in dev    |

Open the MinIO console at http://localhost:9001 (`minio` / `minio12345`) and MailHog at http://localhost:8025.

## Configuration

Copy `.env.example` to `.env` for local overrides. The most useful knobs are at the top of `docker-compose.yml` (host ports, JWT secret, MinIO creds).

## Layout

```
polyrepo-test-be/
├── Dockerfile               # multi-stage: build TS → run node dist/*
├── docker-compose.yml       # 6 services
├── package.json             # ESM + TS
├── tsconfig.json
├── migrations/
│   └── 001_init.sql         # schema + seed
└── src/
    ├── api.ts               # Express bootstrap, ties everything together
    ├── worker.ts            # BullMQ worker entry
    ├── config.ts            # env parsing
    ├── db.ts                # pg pool + waitForDb
    ├── redis.ts             # ioredis clients (commands, pub, sub, bull)
    ├── storage.ts           # S3 client + presigned URLs
    ├── mailer.ts            # nodemailer
    ├── logger.ts            # pino
    ├── auth/                # password, jwt, requireAuth middleware
    ├── routes/              # express routers (auth, projects, tasks, ...)
    ├── repositories/        # typed query helpers
    ├── schemas/             # zod validators
    ├── jobs/                # BullMQ queue + worker handlers
    ├── ws/                  # WebSocket server + Redis pub/sub bridge
    └── utils/               # asyncHandler, error classes
```
