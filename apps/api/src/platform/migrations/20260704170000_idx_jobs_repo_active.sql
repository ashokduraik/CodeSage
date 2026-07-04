-- migrate:up

CREATE INDEX idx_jobs_repo_active ON jobs ((payload->>'repoId'), created_at)
    WHERE status = 'A' AND job_status IN ('pending', 'running');

-- migrate:down

DROP INDEX IF EXISTS idx_jobs_repo_active;
