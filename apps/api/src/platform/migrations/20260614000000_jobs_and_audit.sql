-- migrate:up

-- Job queue (Postgres-backed, ADR 0006).
-- Workers claim rows with SELECT ... FOR UPDATE SKIP LOCKED.
CREATE TYPE job_status AS ENUM ('pending', 'running', 'done', 'failed');

CREATE TABLE jobs (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    type       text        NOT NULL,
    payload    jsonb       NOT NULL,
    status     job_status  NOT NULL DEFAULT 'pending',
    attempts   int         NOT NULL DEFAULT 0,
    locked_at  timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Workers scan pending rows ordered by creation time; partial index keeps scans fast.
CREATE INDEX idx_jobs_pending ON jobs (created_at)
    WHERE status = 'pending';

-- Audit trail for sensitive actions (actor, action, target, timestamp).
CREATE TABLE audit_log (
    id       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id uuid        REFERENCES users (id) ON DELETE SET NULL,
    action   text        NOT NULL,
    target   text,
    ts       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_actor ON audit_log (actor_id);
CREATE INDEX idx_audit_log_ts    ON audit_log (ts);

-- migrate:down
DROP TABLE IF EXISTS audit_log;
DROP INDEX IF EXISTS idx_jobs_pending;
DROP TABLE IF EXISTS jobs;
DROP TYPE IF EXISTS job_status;
