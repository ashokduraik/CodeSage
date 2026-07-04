# `workflows`

> **Status:** planned (no migration yet)  
> **Domain:** Derived product knowledge (end-user layer)

LLM-distilled descriptions of business and user workflows discovered across one or more repos in a
project — the end-user layer of product knowledge (e.g. “checkout”, “invite teammate”). Each row
must include a confidence score and source citations back to code chunks or graph nodes (NFR-7) so
answers can show provenance or defer when uncertain. Workflows are regenerated on re-index but can
be overridden or refined by expert answers.

## Intended columns

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `project_id` | `uuid` | NO | — | FK → `projects.id`; owning project |
| `name` | `text` | NO | — | Flow name, e.g. `login`, `checkout` |
| `steps` | `jsonb` | NO | — | Ordered steps with code/graph citations |
| `confidence` | `numeric` | NO | — | Model confidence score (0–1) |
| `source_refs` | `jsonb` | NO | — | Citation pointers to code chunks or graph nodes |
| `created_at` | `timestamptz` | NO | `now()` | Row creation time (UTC) |
| `updated_at` | `timestamptz` | NO | `now()` | Last distillation or expert override (UTC); set by `BEFORE UPDATE` trigger |
| `created_by` | `uuid` | NO | — | FK → `users.id`; actor who created the row |
| `updated_by` | `uuid` | NO | — | FK → `users.id`; actor who last updated the row |
| `status` | `char(1)` | NO | `'A'` | Row visibility: `A` = active, `D` = soft-deleted |

> Types and extra columns may change when the migration is written. See [`data-model.md`](../data-model.md) §2.3.
