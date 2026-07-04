-- migrate:up

-- Internal service accounts for audit attribution (ADR 0018).
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'system';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE repos
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE graph_nodes
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE graph_edges
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE code_chunks
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

INSERT INTO users (id, email, password_hash, role, created_by, updated_by, updated_at)
VALUES
  (
    'a0000001-0000-4000-8000-000000000001',
    'api-system@codesage.internal',
    '$2b$10$jGVcTQfMihpiEgEpYy4mfO..NgwWx6gi3ezk/VNqee/sJOsxFo1uS',
    'system',
    'a0000001-0000-4000-8000-000000000001',
    'a0000001-0000-4000-8000-000000000001',
    now()
  ),
  (
    'a0000001-0000-4000-8000-000000000002',
    'rag-worker@codesage.internal',
    '$2b$10$jGVcTQfMihpiEgEpYy4mfO..NgwWx6gi3ezk/VNqee/sJOsxFo1uS',
    'system',
    'a0000001-0000-4000-8000-000000000002',
    'a0000001-0000-4000-8000-000000000002',
    now()
  ),
  (
    'a0000001-0000-4000-8000-000000000003',
    'webhook-handler@codesage.internal',
    '$2b$10$jGVcTQfMihpiEgEpYy4mfO..NgwWx6gi3ezk/VNqee/sJOsxFo1uS',
    'system',
    'a0000001-0000-4000-8000-000000000003',
    'a0000001-0000-4000-8000-000000000003',
    now()
  )
ON CONFLICT (email) DO NOTHING;

UPDATE users
SET created_by = id, updated_by = id, updated_at = created_at
WHERE created_by IS NULL;

UPDATE projects
SET created_by = 'a0000001-0000-4000-8000-000000000001',
    updated_by = 'a0000001-0000-4000-8000-000000000001',
    updated_at = created_at
WHERE created_by IS NULL;

UPDATE repos
SET created_by = 'a0000001-0000-4000-8000-000000000001',
    updated_by = 'a0000001-0000-4000-8000-000000000001',
    updated_at = created_at
WHERE created_by IS NULL;

UPDATE jobs
SET created_by = 'a0000001-0000-4000-8000-000000000001',
    updated_by = 'a0000001-0000-4000-8000-000000000001',
    updated_at = created_at
WHERE created_by IS NULL;

UPDATE graph_nodes
SET created_by = 'a0000001-0000-4000-8000-000000000002',
    updated_by = 'a0000001-0000-4000-8000-000000000002',
    updated_at = created_at
WHERE created_by IS NULL;

UPDATE graph_edges
SET created_by = 'a0000001-0000-4000-8000-000000000002',
    updated_by = 'a0000001-0000-4000-8000-000000000002',
    updated_at = created_at
WHERE created_by IS NULL;

UPDATE code_chunks
SET created_by = 'a0000001-0000-4000-8000-000000000002',
    updated_by = 'a0000001-0000-4000-8000-000000000002'
WHERE created_by IS NULL;

ALTER TABLE users
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN created_by SET NOT NULL,
  ALTER COLUMN updated_by SET NOT NULL;

ALTER TABLE projects
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN created_by SET NOT NULL,
  ALTER COLUMN updated_by SET NOT NULL;

ALTER TABLE repos
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN created_by SET NOT NULL,
  ALTER COLUMN updated_by SET NOT NULL;

ALTER TABLE graph_nodes
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN created_by SET NOT NULL,
  ALTER COLUMN updated_by SET NOT NULL;

ALTER TABLE graph_edges
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN created_by SET NOT NULL,
  ALTER COLUMN updated_by SET NOT NULL;

ALTER TABLE code_chunks
  ALTER COLUMN created_by SET NOT NULL,
  ALTER COLUMN updated_by SET NOT NULL;

ALTER TABLE jobs
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN created_by SET NOT NULL,
  ALTER COLUMN updated_by SET NOT NULL;

ALTER TABLE users
  ADD CONSTRAINT users_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id),
  ADD CONSTRAINT users_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users (id);

ALTER TABLE projects
  ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id),
  ADD CONSTRAINT projects_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users (id);

ALTER TABLE repos
  ADD CONSTRAINT repos_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id),
  ADD CONSTRAINT repos_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users (id);

ALTER TABLE graph_nodes
  ADD CONSTRAINT graph_nodes_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id),
  ADD CONSTRAINT graph_nodes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users (id);

ALTER TABLE graph_edges
  ADD CONSTRAINT graph_edges_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id),
  ADD CONSTRAINT graph_edges_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users (id);

ALTER TABLE code_chunks
  ADD CONSTRAINT code_chunks_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id),
  ADD CONSTRAINT code_chunks_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users (id);

ALTER TABLE jobs
  ADD CONSTRAINT jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id),
  ADD CONSTRAINT jobs_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users (id);

CREATE OR REPLACE FUNCTION set_row_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE TRIGGER trg_repos_updated_at
  BEFORE UPDATE ON repos FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE TRIGGER trg_graph_nodes_updated_at
  BEFORE UPDATE ON graph_nodes FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE TRIGGER trg_graph_edges_updated_at
  BEFORE UPDATE ON graph_edges FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE TRIGGER trg_code_chunks_updated_at
  BEFORE UPDATE ON code_chunks FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

-- migrate:down

DROP TRIGGER IF EXISTS trg_jobs_updated_at ON jobs;
DROP TRIGGER IF EXISTS trg_code_chunks_updated_at ON code_chunks;
DROP TRIGGER IF EXISTS trg_graph_edges_updated_at ON graph_edges;
DROP TRIGGER IF EXISTS trg_graph_nodes_updated_at ON graph_nodes;
DROP TRIGGER IF EXISTS trg_repos_updated_at ON repos;
DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
DROP FUNCTION IF EXISTS set_row_updated_at();

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_updated_by_fkey;
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_created_by_fkey;
ALTER TABLE code_chunks DROP CONSTRAINT IF EXISTS code_chunks_updated_by_fkey;
ALTER TABLE code_chunks DROP CONSTRAINT IF EXISTS code_chunks_created_by_fkey;
ALTER TABLE graph_edges DROP CONSTRAINT IF EXISTS graph_edges_updated_by_fkey;
ALTER TABLE graph_edges DROP CONSTRAINT IF EXISTS graph_edges_created_by_fkey;
ALTER TABLE graph_nodes DROP CONSTRAINT IF EXISTS graph_nodes_updated_by_fkey;
ALTER TABLE graph_nodes DROP CONSTRAINT IF EXISTS graph_nodes_created_by_fkey;
ALTER TABLE repos DROP CONSTRAINT IF EXISTS repos_updated_by_fkey;
ALTER TABLE repos DROP CONSTRAINT IF EXISTS repos_created_by_fkey;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_updated_by_fkey;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_created_by_fkey;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_updated_by_fkey;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_created_by_fkey;

ALTER TABLE jobs DROP COLUMN IF EXISTS updated_by, DROP COLUMN IF EXISTS created_by, DROP COLUMN IF EXISTS updated_at;
ALTER TABLE code_chunks DROP COLUMN IF EXISTS updated_by, DROP COLUMN IF EXISTS created_by;
ALTER TABLE graph_edges DROP COLUMN IF EXISTS updated_by, DROP COLUMN IF EXISTS created_by, DROP COLUMN IF EXISTS updated_at;
ALTER TABLE graph_nodes DROP COLUMN IF EXISTS updated_by, DROP COLUMN IF EXISTS created_by, DROP COLUMN IF EXISTS updated_at;
ALTER TABLE repos DROP COLUMN IF EXISTS updated_by, DROP COLUMN IF EXISTS created_by, DROP COLUMN IF EXISTS updated_at;
ALTER TABLE projects DROP COLUMN IF EXISTS updated_by, DROP COLUMN IF EXISTS created_by, DROP COLUMN IF EXISTS updated_at;
ALTER TABLE users DROP COLUMN IF EXISTS updated_by, DROP COLUMN IF EXISTS created_by, DROP COLUMN IF EXISTS updated_at;

DELETE FROM users WHERE email IN (
  'api-system@codesage.internal',
  'rag-worker@codesage.internal',
  'webhook-handler@codesage.internal'
);
