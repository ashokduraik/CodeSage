# `page_map`

> **Status:** planned (no migration yet)  
> **Domain:** Derived product knowledge (end-user layer)

Derived map of UI pages and routes inferred from front-end code and routing config within a project.
Rows link each page to its components, entry files, and known API or data dependencies so end-user
QA can explain “what this screen does” without reading source. Like other derived-knowledge tables,
each entry carries confidence and citations; low-confidence pages may surface as expert questions
instead of definitive chat answers.

## Intended columns

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `project_id` | `uuid` | NO | — | FK → `projects.id`; owning project |
| `route` | `text` | NO | — | URL path or route pattern |
| `components` | `jsonb` | NO | — | UI components tied to this page |
| `data_sources` | `jsonb` | NO | — | APIs, stores, or queries feeding the page |
| `confidence` | `numeric` | NO | — | Model confidence score (0–1) |
| `source_refs` | `jsonb` | NO | — | Citation pointers to code chunks or graph nodes |
| `created_at` | `timestamptz` | NO | `now()` | Row creation time (UTC) |
| `updated_at` | `timestamptz` | NO | `now()` | Last distillation or expert override (UTC); set by `BEFORE UPDATE` trigger |
| `created_by` | `uuid` | NO | — | FK → `users.id`; actor who created the row |
| `updated_by` | `uuid` | NO | — | FK → `users.id`; actor who last updated the row |
| `status` | `char(1)` | NO | `'A'` | Row visibility: `A` = active, `D` = soft-deleted |

> Types and extra columns may change when the migration is written. See [`data-model.md`](../data-model.md) §2.3.
