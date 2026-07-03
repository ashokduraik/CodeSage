-- migrate:up

-- Rename domain-specific status columns before introducing row `status` (see row-status.mdc).
ALTER TABLE projects RENAME COLUMN status TO lifecycle_status;

ALTER TABLE jobs RENAME COLUMN status TO job_status;

DROP INDEX IF EXISTS idx_jobs_pending;

-- Row visibility: A = Active, D = Deleted.
ALTER TABLE users
  ADD COLUMN status char(1) NOT NULL DEFAULT 'A'
  CONSTRAINT users_status_check CHECK (status IN ('A', 'D'));

ALTER TABLE projects
  ADD COLUMN status char(1) NOT NULL DEFAULT 'A'
  CONSTRAINT projects_status_check CHECK (status IN ('A', 'D'));

UPDATE projects SET status = 'D' WHERE deleted_at IS NOT NULL;

DROP INDEX IF EXISTS idx_projects_active;

ALTER TABLE projects DROP COLUMN IF EXISTS deleted_at;

CREATE INDEX idx_projects_active ON projects (created_at DESC) WHERE status = 'A';

ALTER TABLE repos
  ADD COLUMN status char(1) NOT NULL DEFAULT 'A'
  CONSTRAINT repos_status_check CHECK (status IN ('A', 'D'));

UPDATE repos SET status = 'D' WHERE deleted_at IS NOT NULL;

DROP INDEX IF EXISTS idx_repos_active_project;

ALTER TABLE repos DROP COLUMN IF EXISTS deleted_at;

CREATE INDEX idx_repos_active_project ON repos (project_id) WHERE status = 'A';

ALTER TABLE graph_nodes
  ADD COLUMN status char(1) NOT NULL DEFAULT 'A'
  CONSTRAINT graph_nodes_status_check CHECK (status IN ('A', 'D'));

ALTER TABLE graph_edges
  ADD COLUMN status char(1) NOT NULL DEFAULT 'A'
  CONSTRAINT graph_edges_status_check CHECK (status IN ('A', 'D'));

ALTER TABLE code_chunks
  ADD COLUMN status char(1) NOT NULL DEFAULT 'A'
  CONSTRAINT code_chunks_status_check CHECK (status IN ('A', 'D'));

ALTER TABLE jobs
  ADD COLUMN status char(1) NOT NULL DEFAULT 'A'
  CONSTRAINT jobs_row_status_check CHECK (status IN ('A', 'D'));

CREATE INDEX idx_jobs_pending ON jobs (created_at)
    WHERE job_status = 'pending' AND status = 'A';

ALTER TABLE audit_log
  ADD COLUMN status char(1) NOT NULL DEFAULT 'A'
  CONSTRAINT audit_log_status_check CHECK (status IN ('A', 'D'));

-- migrate:down

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_status_check;
ALTER TABLE audit_log DROP COLUMN IF EXISTS status;

DROP INDEX IF EXISTS idx_jobs_pending;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_row_status_check;
ALTER TABLE jobs DROP COLUMN IF EXISTS status;

ALTER TABLE code_chunks DROP CONSTRAINT IF EXISTS code_chunks_status_check;
ALTER TABLE code_chunks DROP COLUMN IF EXISTS status;

ALTER TABLE graph_edges DROP CONSTRAINT IF EXISTS graph_edges_status_check;
ALTER TABLE graph_edges DROP COLUMN IF EXISTS status;

ALTER TABLE graph_nodes DROP CONSTRAINT IF EXISTS graph_nodes_status_check;
ALTER TABLE graph_nodes DROP COLUMN IF EXISTS status;

DROP INDEX IF EXISTS idx_repos_active_project;

ALTER TABLE repos
  ADD COLUMN deleted_at timestamptz;

UPDATE repos SET deleted_at = now() WHERE status = 'D';

ALTER TABLE repos DROP CONSTRAINT IF EXISTS repos_status_check;
ALTER TABLE repos DROP COLUMN IF EXISTS status;

CREATE INDEX idx_repos_active_project ON repos (project_id) WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_projects_active;

ALTER TABLE projects
  ADD COLUMN deleted_at timestamptz;

UPDATE projects SET deleted_at = now() WHERE status = 'D';

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects DROP COLUMN IF EXISTS status;

CREATE INDEX idx_projects_active ON projects (created_at DESC) WHERE deleted_at IS NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users DROP COLUMN IF EXISTS status;

ALTER TABLE jobs RENAME COLUMN job_status TO status;

CREATE INDEX idx_jobs_pending ON jobs (created_at)
    WHERE status = 'pending';

ALTER TABLE projects RENAME COLUMN lifecycle_status TO status;
