-- migrate:up

ALTER TABLE repos
  ADD COLUMN deleted_at        timestamptz,
  ADD COLUMN last_indexed_at   timestamptz,
  ADD COLUMN primary_language  text;

CREATE INDEX idx_repos_active_project ON repos (project_id) WHERE deleted_at IS NULL;

-- migrate:down

DROP INDEX IF EXISTS idx_repos_active_project;

ALTER TABLE repos
  DROP COLUMN IF EXISTS primary_language,
  DROP COLUMN IF EXISTS last_indexed_at,
  DROP COLUMN IF EXISTS deleted_at;
