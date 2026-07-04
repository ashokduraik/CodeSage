# `conversations`

> **Status:** planned (no migration yet)  
> **Domain:** QA, operations, audit

QA chat sessions scoped to a project and audience (developer vs end-user).

## Intended columns

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `project_id` | `uuid` | NO | — | FK → `projects.id`; project context |
| `user_id` | `uuid` | NO | — | FK → `users.id`; session owner |
| `audience` | `text` | NO | — | `dev` or `end_user` — routes retrieval strategy |
| `title` | `text` | YES | — | Optional display title |
| `created_at` | `timestamptz` | NO | `now()` | Session start (UTC) |
| `updated_at` | `timestamptz` | NO | `now()` | Last message time (UTC); set by `BEFORE UPDATE` trigger |
| `created_by` | `uuid` | NO | — | FK → `users.id`; actor who created the row |
| `updated_by` | `uuid` | NO | — | FK → `users.id`; actor who last updated the row |
| `status` | `char(1)` | NO | `'A'` | Row visibility: `A` = active, `D` = soft-deleted |

> Types may change when the migration is written. See [`data-model.md`](../data-model.md) §2.5.
