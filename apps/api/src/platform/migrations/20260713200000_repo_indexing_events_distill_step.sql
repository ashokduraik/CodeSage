-- migrate:up

-- Allow distill as a user-facing indexing timeline step (project knowledge building).
ALTER TABLE repo_indexing_events
  DROP CONSTRAINT IF EXISTS repo_indexing_events_step_check;

ALTER TABLE repo_indexing_events
  ADD CONSTRAINT repo_indexing_events_step_check
  CHECK (step IN ('sync', 'parse', 'embed', 'distill'));

-- migrate:down

ALTER TABLE repo_indexing_events
  DROP CONSTRAINT IF EXISTS repo_indexing_events_step_check;

ALTER TABLE repo_indexing_events
  ADD CONSTRAINT repo_indexing_events_step_check
  CHECK (step IN ('sync', 'parse', 'embed'));
