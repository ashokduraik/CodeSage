-- migrate:up

-- Must run in its own migration: Postgres forbids using a new enum value in the same
-- transaction as ALTER TYPE ... ADD VALUE (see audit migration that follows).
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'system';

-- migrate:down

-- PostgreSQL cannot drop a single enum value; rebuilding user_role is out of scope here.
