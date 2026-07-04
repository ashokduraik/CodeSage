# `data_flows`

> **Status:** planned (no migration yet)  
> **Domain:** Derived product knowledge (end-user layer)

Per-page or per-feature data-flow summaries: where displayed data originates (API, cache, local
state), how it is fetched or mutated, and how fresh it is expected to be. Distillation connects
UI components to backend handlers and storage seen in the code graph so end-user answers can
explain “where does this number come from?” Every row includes confidence and citations; ambiguous
flows should lower confidence or spawn expert questions.

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
