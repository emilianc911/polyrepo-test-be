-- Initial schema for the polyrepo demo BE.
-- Postgres runs every *.sql under /docker-entrypoint-initdb.d once when the
-- data directory is empty (first boot).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT        NOT NULL UNIQUE,
    display_name  TEXT        NOT NULL,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX users_email_lower_idx ON users (LOWER(email));

-- ----------------------------------------------------------------------------
-- projects
-- ----------------------------------------------------------------------------
CREATE TABLE projects (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX projects_owner_idx ON projects (owner_id);

-- ----------------------------------------------------------------------------
-- tasks
-- ----------------------------------------------------------------------------
CREATE TYPE task_status   AS ENUM ('todo', 'in_progress', 'done');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');

CREATE TABLE tasks (
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
CREATE INDEX tasks_project_idx ON tasks (project_id);
CREATE INDEX tasks_status_idx  ON tasks (project_id, status);

-- ----------------------------------------------------------------------------
-- comments
-- ----------------------------------------------------------------------------
CREATE TABLE comments (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id    UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES users(id),
    body       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX comments_task_idx ON comments (task_id, created_at);

-- ----------------------------------------------------------------------------
-- attachments
-- ----------------------------------------------------------------------------
CREATE TABLE attachments (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id      UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id      UUID        NOT NULL REFERENCES users(id),
    storage_key  TEXT        NOT NULL,
    filename     TEXT        NOT NULL,
    content_type TEXT        NOT NULL,
    size_bytes   BIGINT      NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX attachments_task_idx ON attachments (task_id, created_at);

-- ----------------------------------------------------------------------------
-- demo seed
-- Single demo user, one project, three tasks. Password is "demo1234".
-- The bcrypt hash below was generated offline with bcryptjs cost=10.
-- ----------------------------------------------------------------------------
INSERT INTO users (id, email, display_name, password_hash) VALUES
  ('00000000-0000-0000-0000-000000000001',
   'demo@polyrepo.local',
   'Demo User',
   '$2a$10$IdmmP9w9xURzFXNSo..GU.IQQwdD05z0ZW3Jx3l6NFv03VtEVGwkW');

INSERT INTO projects (id, owner_id, name, description) VALUES
  ('00000000-0000-0000-0000-000000000010',
   '00000000-0000-0000-0000-000000000001',
   'Polyrepo demo project',
   'Sample project pre-populated by the migration script.');

INSERT INTO tasks (project_id, title, description, status, priority, created_by) VALUES
  ('00000000-0000-0000-0000-000000000010', 'Spin up the FE',         'docker compose up in polyrepo-test-fe',     'todo',        'high',   '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000010', 'Try the realtime board', 'Open two browser tabs and watch live updates', 'in_progress', 'medium', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000010', 'Upload an attachment',   'Drag & drop a small image into a task',     'done',        'low',    '00000000-0000-0000-0000-000000000001');
