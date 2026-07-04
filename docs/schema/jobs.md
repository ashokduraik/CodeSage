# `jobs`

> **Status:** implemented  
> **Domain:** QA, operations, audit

Postgres-backed job queue (ADR 0006). Workers claim rows with `SELECT … FOR UPDATE SKIP LOCKED`.

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
| `status` | `char(1)` | NO | `'A'` | Row visibility: `A` = active, `D` = soft-deleted / cancelled |

## Constraints

- `status` must be `A` or `D` (`jobs_row_status_check`).

## Indexes

| Name | Columns | Notes |
|---|---|---|
| `idx_jobs_pending` | `created_at` | Partial: `WHERE job_status = 'pending' AND status = 'A'` — worker scan |

## Foreign keys

| Column | References | On delete |
|---|---|---|
| `created_by` | `users(id)` | (no action) |
| `updated_by` | `users(id)` | (no action) |
