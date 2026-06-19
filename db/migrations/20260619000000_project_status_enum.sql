-- migrate:up

-- Introduce a typed enum for project lifecycle states.
-- The previous default ('active') is included so existing rows remain valid.
CREATE TYPE project_status AS ENUM (
  'active',
  'indexed',
  'indexing',
  'stale',
  'connecting',
  'error'
);

ALTER TABLE projects
  ALTER COLUMN status TYPE project_status
    USING status::project_status,
  ALTER COLUMN status SET DEFAULT 'active';

-- migrate:down
ALTER TABLE projects
  ALTER COLUMN status TYPE text
    USING status::text,
  ALTER COLUMN status SET DEFAULT 'active';

DROP TYPE IF EXISTS project_status;
