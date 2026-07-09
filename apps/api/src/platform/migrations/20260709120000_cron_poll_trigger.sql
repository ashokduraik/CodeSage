-- migrate:up

-- Allow cron_poll as an indexing run trigger (Phase 3 freshness poll fallback).
ALTER TABLE repo_indexing_events
  DROP CONSTRAINT IF EXISTS repo_indexing_events_trigger_check;

ALTER TABLE repo_indexing_events
  ADD CONSTRAINT repo_indexing_events_trigger_check
  CHECK (trigger IN ('initial_attach', 'manual_sync', 'webhook_push', 'cron_poll'));

-- migrate:down

ALTER TABLE repo_indexing_events
  DROP CONSTRAINT IF EXISTS repo_indexing_events_trigger_check;

ALTER TABLE repo_indexing_events
  ADD CONSTRAINT repo_indexing_events_trigger_check
  CHECK (trigger IN ('initial_attach', 'manual_sync', 'webhook_push'));
