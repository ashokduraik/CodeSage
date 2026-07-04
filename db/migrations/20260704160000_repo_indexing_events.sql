-- migrate:up

-- User-facing per-repo indexing progress timeline (append-only events).
CREATE TABLE repo_indexing_events (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    repo_id         uuid        NOT NULL REFERENCES repos (id) ON DELETE CASCADE,
    run_id          uuid        NOT NULL,
    job_id          uuid        REFERENCES jobs (id) ON DELETE SET NULL,
    trigger         text        CHECK (trigger IN ('initial_attach', 'manual_sync', 'webhook_push')),
    step            text        NOT NULL CHECK (step IN ('sync', 'parse', 'embed')),
    phase           text        NOT NULL CHECK (phase IN ('started', 'finished', 'failed', 'skipped')),
    started_at      timestamptz NOT NULL DEFAULT now(),
    duration_ms     int         CHECK (duration_ms IS NULL OR duration_ms >= 0),
    message         text        NOT NULL,
    failure_reason  text,
    details         jsonb,
    status          char(1)     NOT NULL DEFAULT 'A' CHECK (status IN ('A', 'D')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL REFERENCES users (id),
    updated_by      uuid        NOT NULL REFERENCES users (id)
);

CREATE TRIGGER trg_repo_indexing_events_updated_at
  BEFORE UPDATE ON repo_indexing_events FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE INDEX idx_repo_indexing_events_repo_started
    ON repo_indexing_events (repo_id, started_at DESC)
    WHERE status = 'A';

CREATE INDEX idx_repo_indexing_events_run
    ON repo_indexing_events (run_id, started_at)
    WHERE status = 'A';

CREATE INDEX idx_repo_indexing_events_project_repo
    ON repo_indexing_events (project_id, repo_id)
    WHERE status = 'A';

-- migrate:down

DROP INDEX IF EXISTS idx_repo_indexing_events_project_repo;
DROP INDEX IF EXISTS idx_repo_indexing_events_run;
DROP INDEX IF EXISTS idx_repo_indexing_events_repo_started;
DROP TABLE IF EXISTS repo_indexing_events;
