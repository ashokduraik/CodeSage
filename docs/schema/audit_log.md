# `audit_log`

> **Status:** implemented  
> **Domain:** QA, operations, audit

Append-only security audit trail for sensitive actions (who did what, to what, when).

## Columns

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `actor_id` | `uuid` | YES | — | FK → `users.id`; user who performed the action |
| `action` | `text` | NO | — | Action verb, e.g. `repo.attach`, `project.delete` |
| `target` | `text` | YES | — | Resource identifier or description of what was affected |
| `ts` | `timestamptz` | NO | `now()` | Event timestamp (UTC) |
| `status` | `char(1)` | NO | `'A'` | Row visibility: `A` = active, `D` = soft-deleted |

## Constraints

- `status` must be `A` or `D` (`audit_log_status_check`).

## Indexes

| Name | Columns | Notes |
|---|---|---|
| `idx_audit_log_actor` | `actor_id` | Filter by actor |
| `idx_audit_log_ts` | `ts` | Time-range queries |

## Foreign keys

| Column | References | On delete |
|---|---|---|
| `actor_id` | `users(id)` | `SET NULL` |
