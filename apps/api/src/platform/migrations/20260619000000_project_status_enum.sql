-- migrate:up

-- Introduce a typed enum for project lifecycle states.
-- Drop the text default before changing type — Postgres cannot auto-cast it to the enum.
CREATE TYPE project_status AS ENUM (
  'active',
  'indexed',
  'indexing',
  'stale',
  'connecting',
  'error'
);

ALTER TABLE projects
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE projects
  ALTER COLUMN status TYPE project_status
    USING status::project_status;

ALTER TABLE projects
  ALTER COLUMN status SET DEFAULT 'active'::project_status;

-- migrate:down

ALTER TABLE projects
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE projects
  ALTER COLUMN status TYPE text
    USING status::text;

ALTER TABLE projects
  ALTER COLUMN status SET DEFAULT 'active';

DROP TYPE IF EXISTS project_status;
