# `projects`

> **Status:** implemented  
> **Domain:** Identity & projects

A logical product or codebase under analysis — one project may attach many Git repos that together
form the knowledge base. `lifecycle_status` reflects indexing pipeline health (`active`, `indexing`,
`indexed`, `stale`, etc.) for dashboards and gating QA. Row `status` is separate: soft-deleting a
project hides it from lists without erasing derived knowledge until an explicit purge.

## Columns

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `name` | `text` | NO | — | Human-readable project name |
| `lifecycle_status` | `project_status` | NO | `'active'` | Indexing pipeline state: `active`, `indexed`, `indexing`, `stale`, `connecting`, `error` |
| `created_at` | `timestamptz` | NO | `now()` | Project creation time (UTC) |
| `updated_at` | `timestamptz` | NO | `now()` | Last row update (UTC); set by `BEFORE UPDATE` trigger |
| `created_by` | `uuid` | NO | — | FK → `users.id`; actor who created the row |
| `updated_by` | `uuid` | NO | — | FK → `users.id`; actor who last updated the row |
| `status` | `char(1)` | NO | `'A'` | Row visibility: `A` = active, `D` = soft-deleted |

## Constraints

- `status` must be `A` or `D` (`projects_status_check`).

## Indexes

| Name | Columns | Notes |
|---|---|---|
| `idx_projects_active` | `created_at DESC` | Partial: `WHERE status = 'A'` — fast list of active projects |

## Foreign keys

| Column | References | On delete |
|---|---|---|
| `created_by` | `users(id)` | (no action) |
| `updated_by` | `users(id)` | (no action) |
