-- Initial schema. Postgres runs every *.sql under /docker-entrypoint-initdb.d
-- exactly once when the data directory is empty (i.e. on first container boot).

CREATE TABLE IF NOT EXISTS todos (
    id          SERIAL PRIMARY KEY,
    title       TEXT NOT NULL,
    done        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO todos (title, done) VALUES
    ('Try the polyrepo demo', FALSE),
    ('Push both repos to GitHub', FALSE),
    ('Wire it up in agent-orchestrator', FALSE);
