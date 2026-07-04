# `repo_indexing_events`

> **Status:** implemented  
> **Domain:** QA, operations, audit

Append-only, user-facing timeline of repo indexing progress across sync, parse, and embed steps.
The RAG worker writes one row per step event (started, finished, failed, or skipped) so the API
and UI can show plain-English status without polling job internals. Events for a single indexing
attempt share a `run_id` (the sync job UUID); `trigger` records whether the run came from initial
attach, manual re-index, or a webhook push.

## Columns

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `project_id` | `uuid` | NO | — | FK → `projects.id` |
| `repo_id` | `uuid` | NO | — | FK → `repos.id` |
| `run_id` | `uuid` | NO | — | Groups sync → parse → embed for one indexing attempt |
| `job_id` | `uuid` | YES | — | FK → `jobs.id`; job that emitted this event |
| `trigger` | `text` | YES | — | `initial_attach`, `manual_sync`, or `webhook_push` |
| `step` | `text` | NO | — | `sync`, `parse`, or `embed` |
| `phase` | `text` | NO | — | `started`, `finished`, `failed`, or `skipped` |
| `started_at` | `timestamptz` | NO | `now()` | Event timestamp (UTC) |
| `duration_ms` | `int` | YES | — | Step duration; null on `started` |
| `message` | `text` | NO | — | Plain-English user-facing message |
| `failure_reason` | `text` | YES | — | Sanitized explanation when `phase = failed` |
| `details` | `jsonb` | YES | — | Optional metrics (`commit_sha`, `file_count`, …) |
| `status` | `char(1)` | NO | `'A'` | Row visibility: `A` = active, `D` = soft-deleted |
| `created_at` | `timestamptz` | NO | `now()` | Insert time (UTC) |
| `updated_at` | `timestamptz` | NO | `now()` | Last row update (UTC) |
| `created_by` | `uuid` | NO | — | FK → `users.id`; `rag-worker` service user |
| `updated_by` | `uuid` | NO | — | FK → `users.id` |

## Constraints

- `trigger` must be `initial_attach`, `manual_sync`, or `webhook_push` when set.
- `step` must be `sync`, `parse`, or `embed`.
- `phase` must be `started`, `finished`, `failed`, or `skipped`.
- `status` must be `A` or `D`.

## Indexes

| Name | Columns | Notes |
|---|---|---|
| `idx_repo_indexing_events_repo_started` | `repo_id`, `started_at DESC` | Partial: `WHERE status = 'A'` — repo timeline |
| `idx_repo_indexing_events_run` | `run_id`, `started_at` | Partial: `WHERE status = 'A'` — group by run |
| `idx_repo_indexing_events_project_repo` | `project_id`, `repo_id` | Partial: `WHERE status = 'A'` |

## Foreign keys

| Column | References | On delete |
|---|---|---|
| `project_id` | `projects(id)` | `CASCADE` |
| `repo_id` | `repos(id)` | `CASCADE` |
| `job_id` | `jobs(id)` | `SET NULL` |
| `created_by` | `users(id)` | (no action) |
| `updated_by` | `users(id)` | (no action) |
