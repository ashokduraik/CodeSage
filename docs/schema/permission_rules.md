# `permission_rules`

> **Status:** planned (no migration yet)  
> **Domain:** Derived product knowledge (end-user layer)

Per-page or per-action permission requirements inferred from code and config.

## Intended columns

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `project_id` | `uuid` | NO | — | FK → `projects.id`; owning project |
| `target` | `text` | NO | — | Page, route, or action being guarded |
| `required_permission` | `text` | NO | — | Role, scope, or claim required |
| `source_refs` | `jsonb` | NO | — | Citation pointers to enforcing code |
| `confidence` | `numeric` | NO | — | Model confidence score (0–1) |
| `created_at` | `timestamptz` | NO | `now()` | Row creation time (UTC) |
| `updated_at` | `timestamptz` | NO | `now()` | Last distillation or expert override (UTC); set by `BEFORE UPDATE` trigger |
| `created_by` | `uuid` | NO | — | FK → `users.id`; actor who created the row |
| `updated_by` | `uuid` | NO | — | FK → `users.id`; actor who last updated the row |
| `status` | `char(1)` | NO | `'A'` | Row visibility: `A` = active, `D` = soft-deleted |

> Types and extra columns may change when the migration is written. See [`data-model.md`](../data-model.md) §2.3.
