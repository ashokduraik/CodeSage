-- migrate:up

-- Extend repos for smart connect flow, webhooks, and connection status.
ALTER TABLE repos
  ADD COLUMN full_name            text,
  ADD COLUMN description          text,
  ADD COLUMN base_url             text,
  ADD COLUMN is_private           boolean NOT NULL DEFAULT false,
  ADD COLUMN connection_status    text NOT NULL DEFAULT 'connecting',
  ADD COLUMN last_error           text,
  ADD COLUMN last_error_at        timestamptz,
  ADD COLUMN webhook_id           text,
  ADD COLUMN webhook_secret_enc   bytea,
  ADD COLUMN webhook_enabled      boolean NOT NULL DEFAULT false;

-- Drop repo role (no longer used in attach flow).
ALTER TABLE repos DROP COLUMN role;
DROP TYPE IF EXISTS repo_role;

-- Persist job failure reason for debugging and UI surfacing.
ALTER TABLE jobs ADD COLUMN error_message text;

-- migrate:down

ALTER TABLE jobs DROP COLUMN IF EXISTS error_message;

CREATE TYPE repo_role AS ENUM ('frontend', 'backend', 'iam', 'other');

ALTER TABLE repos
  ADD COLUMN role repo_role NOT NULL DEFAULT 'other';

ALTER TABLE repos
  DROP COLUMN IF EXISTS webhook_enabled,
  DROP COLUMN IF EXISTS webhook_secret_enc,
  DROP COLUMN IF EXISTS webhook_id,
  DROP COLUMN IF EXISTS last_error_at,
  DROP COLUMN IF EXISTS last_error,
  DROP COLUMN IF EXISTS connection_status,
  DROP COLUMN IF EXISTS is_private,
  DROP COLUMN IF EXISTS base_url,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS full_name;
