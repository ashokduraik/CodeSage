# `jobs`

> **Status:** implemented  
> **Domain:** QA, operations, audit

Postgres-backed job queue (ADR 0006) that coordinates all heavy indexing work — sync, parse,
embed, and downstream distill steps. Node enqueues rows when a repo is attached, re-indexed, or
updated by webhook; Python workers claim work with `SELECT … FOR UPDATE SKIP LOCKED` so only one
worker processes a job at a time. Row `status` tracks visibility (including superseded runs), while
`job_status` tracks execution lifecycle from `pending` through `done` or `failed`.

## Columns

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `type` | `text` | NO | — | Job kind: `sync`, `parse`, `embed`, `xrepo`, `distill`, etc. |
| `payload` | `jsonb` | NO | — | Job input; shape per `contracts/jobs.schema.json` |
| `job_status` | `job_status` | NO | `'pending'` | Queue state: `pending`, `running`, `done`, `failed` |
| `attempts` | `int` | NO | `0` | Number of execution attempts so far |
| `locked_at` | `timestamptz` | YES | — | When a worker claimed this row (UTC) |
| `created_at` | `timestamptz` | NO | `now()` | Enqueue time (UTC) |
| `updated_at` | `timestamptz` | NO | `now()` | Last row update (UTC); set by `BEFORE UPDATE` trigger |
| `created_by` | `uuid` | NO | — | FK → `users.id`; actor who enqueued the job |
| `updated_by` | `uuid` | NO | — | FK → `users.id`; actor who last updated the row |
| `error_message` | `text` | YES | — | Last failure reason for debugging and UI |
| `status` | `char(1)` | NO | `'A'` | Row visibility: `A` = active, `D` = soft-deleted / cancelled (superseded by a newer indexing run) |

## Queue semantics

- Workers claim only `job_status = 'pending' AND status = 'A'`.
- **Supersession:** Node sets `status = 'D'` on pending jobs for a `repoId` before enqueueing a newer sync (manual re-index after the stale window, attach, or webhook). Cancelled rows keep history; `error_message` may be `Superseded by newer indexing run`.
- **Orphan reclaim:** On worker startup (and before each claim), RAG resets all active `running` jobs to `pending` — the previous process no longer holds the lock (single-worker MVP).
- **Stale reclaim:** Jobs stuck in `running` longer than `WORKER_STALE_JOB_SECONDS` are re-queued or marked `failed` during normal operation.
- **Manual re-index throttle:** API returns **409** when active jobs for the repo are younger than `WORKER_STALE_JOB_SECONDS` (default 600s). Failed jobs are never auto-cancelled or re-run.

## Constraints

- `status` must be `A` or `D` (`jobs_row_status_check`).

## Indexes

| Name | Columns | Notes |
|---|---|---|
| `idx_jobs_pending` | `created_at` | Partial: `WHERE job_status = 'pending' AND status = 'A'` — worker scan |
| `idx_jobs_repo_active` | `(payload->>'repoId'), created_at` | Partial: `WHERE status = 'A' AND job_status IN ('pending', 'running')` — supersession / throttle lookups |

## Foreign keys

| Column | References | On delete |
|---|---|---|
| `created_by` | `users(id)` | (no action) |
| `updated_by` | `users(id)` | (no action) |
