-- migrate:up
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('admin', 'expert', 'developer', 'end_user');

CREATE TABLE users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    role          user_role NOT NULL DEFAULT 'developer',
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL,
    status     text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE repo_provider AS ENUM ('github', 'gitlab');
CREATE TYPE repo_role AS ENUM ('frontend', 'backend', 'iam', 'other');

CREATE TABLE repos (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    repo_url         text NOT NULL,
    provider         repo_provider NOT NULL,
    branch           text NOT NULL DEFAULT 'main',
    role             repo_role NOT NULL DEFAULT 'other',
    token_enc        bytea,
    last_indexed_sha text,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_repos_project_id ON repos (project_id);

-- migrate:down
DROP TABLE IF EXISTS repos;
DROP TYPE IF EXISTS repo_role;
DROP TYPE IF EXISTS repo_provider;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS users;
DROP TYPE IF EXISTS user_role;
