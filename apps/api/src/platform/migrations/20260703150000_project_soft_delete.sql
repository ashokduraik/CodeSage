-- migrate:up

ALTER TABLE projects
  ADD COLUMN deleted_at timestamptz;

CREATE INDEX idx_projects_active ON projects (created_at DESC) WHERE deleted_at IS NULL;

-- migrate:down

DROP INDEX IF EXISTS idx_projects_active;

ALTER TABLE projects
  DROP COLUMN IF EXISTS deleted_at;
