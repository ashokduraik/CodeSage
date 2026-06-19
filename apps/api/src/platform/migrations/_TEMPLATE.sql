-- Migration template — NOT applied by the runner (leading _ is ignored).
-- Copy this file to: YYYYMMDDHHMMSS_describe_change_here.sql
-- Use the current UTC timestamp for the prefix, e.g. 20260620100000_add_status_to_repos.sql
-- Then uncomment and fill the relevant blocks below.
-- Always update docs/data-model.md in the same change as the migration.

-- migrate:up

-- ── CREATE TABLE ────────────────────────────────────────────────────────────────
-- CREATE TABLE example (
--     id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
--     name       text        NOT NULL,
--     status     text        NOT NULL DEFAULT 'active',
--     created_at timestamptz NOT NULL DEFAULT now()
-- );

-- ── ADD COLUMN ──────────────────────────────────────────────────────────────────
-- ALTER TABLE example ADD COLUMN description text;
-- ALTER TABLE example ADD COLUMN count int NOT NULL DEFAULT 0;

-- ── ADD INDEX ───────────────────────────────────────────────────────────────────
-- CREATE INDEX idx_example_name ON example (name);
-- CREATE INDEX idx_example_status ON example (status) WHERE status = 'active';

-- ── ADD FOREIGN KEY (with index) ────────────────────────────────────────────────
-- ALTER TABLE example
--     ADD COLUMN project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE;
-- CREATE INDEX idx_example_project_id ON example (project_id);

-- ── ADD ENUM VALUE ──────────────────────────────────────────────────────────────
-- ALTER TYPE some_enum ADD VALUE IF NOT EXISTS 'new_value';

-- ── RENAME COLUMN ───────────────────────────────────────────────────────────────
-- ALTER TABLE example RENAME COLUMN old_name TO new_name;

-- ── DROP COLUMN ─────────────────────────────────────────────────────────────────
-- ALTER TABLE example DROP COLUMN IF EXISTS obsolete_column;

-- ── DROP TABLE ──────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS example;


-- migrate:down

-- Reverse every change above in the opposite order.
-- Examples:
-- DROP TABLE IF EXISTS example;
-- ALTER TABLE example DROP COLUMN IF EXISTS description;
-- DROP INDEX IF EXISTS idx_example_name;
