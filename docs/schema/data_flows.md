# `data_flows`

> **Status:** planned (no migration yet)  
> **Domain:** Derived product knowledge (end-user layer)

Per-page data origin and freshness: where data comes from and how it is updated.

## Intended columns

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `project_id` | `uuid` | NO | — | FK → `projects.id`; owning project |
| `page_ref` | `text` | NO | — | Page or route this flow describes |
| `source_chain` | `jsonb` | NO | — | Ordered chain of APIs, DBs, caches, events |
| `freshness_type` | `text` | NO | — | `sync`, `async`, `cached`, `polled`, or `event-driven` |
| `confidence` | `numeric` | NO | — | Model confidence score (0–1) |
| `source_refs` | `jsonb` | NO | — | Citation pointers to code chunks or graph nodes |
| `created_at` | `timestamptz` | NO | `now()` | Row creation time (UTC) |
| `updated_at` | `timestamptz` | NO | `now()` | Last distillation or expert override (UTC); set by `BEFORE UPDATE` trigger |
| `created_by` | `uuid` | NO | — | FK → `users.id`; actor who created the row |
| `updated_by` | `uuid` | NO | — | FK → `users.id`; actor who last updated the row |
| `status` | `char(1)` | NO | `'A'` | Row visibility: `A` = active, `D` = soft-deleted |

> Types and extra columns may change when the migration is written. See [`data-model.md`](../data-model.md) §2.3.
