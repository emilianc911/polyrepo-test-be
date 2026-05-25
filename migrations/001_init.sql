-- Initial schema for the polyrepo demo BE.
--
-- This file is run by `src/migrate.ts` on every API start, gated by a
-- `schema_migrations` table + `pg_advisory_lock`. Every statement below MUST
-- be idempotent: re-running this file on a database that already has the
-- schema must succeed without error and without duplicating data.
--
-- This file is NO LONGER mounted into Postgres' /docker-entrypoint-initdb.d.
-- That hook only runs on first boot of an empty data dir, which would silently
-- skip schema changes for anyone who already deployed the project. Owning the
-- migrations from the BE process avoids that whole class of bug.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- enums (CREATE TYPE has no IF NOT EXISTS — wrap in DO block)
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT        NOT NULL UNIQUE,
    display_name  TEXT        NOT NULL,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));

-- ----------------------------------------------------------------------------
-- projects
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects (owner_id);

-- ----------------------------------------------------------------------------
-- tasks
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title       TEXT          NOT NULL,
    description TEXT          NOT NULL DEFAULT '',
    status      task_status   NOT NULL DEFAULT 'todo',
    priority    task_priority NOT NULL DEFAULT 'medium',
    due_date    TIMESTAMPTZ,
    created_by  UUID          NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tasks_project_idx ON tasks (project_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx  ON tasks (project_id, status);

-- ----------------------------------------------------------------------------
-- comments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id    UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES users(id),
    body       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS comments_task_idx ON comments (task_id, created_at);

-- ----------------------------------------------------------------------------
-- attachments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attachments (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id      UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id      UUID        NOT NULL REFERENCES users(id),
    storage_key  TEXT        NOT NULL,
    filename     TEXT        NOT NULL,
    content_type TEXT        NOT NULL,
    size_bytes   BIGINT      NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS attachments_task_idx ON attachments (task_id, created_at);

-- ----------------------------------------------------------------------------
-- demo seed: a single demo user (password: "demo1234") with one project and
-- three tasks. Skipped when the project_id already exists, which doubles as a
-- "is the demo data installed?" check after the first migration run.
-- ----------------------------------------------------------------------------
INSERT INTO users (id, email, display_name, password_hash) VALUES
  ('00000000-0000-0000-0000-000000000001',
   'demo@polyrepo.local',
   'Demo User',
   '$2a$10$IdmmP9w9xURzFXNSo..GU.IQQwdD05z0ZW3Jx3l6NFv03VtEVGwkW')
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, owner_id, name, description) VALUES
  ('00000000-0000-0000-0000-000000000010',
   '00000000-0000-0000-0000-000000000001',
   'Polyrepo demo project',
   'Sample project pre-populated by the migration script.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO tasks (project_id, title, description, status, priority, created_by)
SELECT
    '00000000-0000-0000-0000-000000000010'::uuid,
    v.title, v.description, v.status::task_status, v.priority::task_priority,
    '00000000-0000-0000-0000-000000000001'::uuid
FROM (VALUES
    ('Spin up the FE',         'docker compose up in polyrepo-test-fe',     'todo',        'high'),
    ('Try the realtime board', 'Open two browser tabs and watch live updates', 'in_progress', 'medium'),
    ('Upload an attachment',   'Drag & drop a small image into a task',     'done',        'low')
) AS v(title, description, status, priority)
WHERE NOT EXISTS (
    SELECT 1 FROM tasks WHERE project_id = '00000000-0000-0000-0000-000000000010'::uuid
);
