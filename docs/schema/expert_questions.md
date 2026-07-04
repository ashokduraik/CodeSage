# `expert_questions`

> **Status:** planned (no migration yet)  
> **Domain:** Expert-in-the-loop

Queue of clarification questions raised when the system lacks confident grounded answers.

## Intended columns

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `project_id` | `uuid` | NO | — | FK → `projects.id`; owning project |
| `context_ref` | `jsonb` | NO | — | What triggered the question (chunk, node, artifact) |
| `question` | `text` | NO | — | Question text shown to experts |
| `queue_status` | `text` | NO | `'open'` | Workflow state: `open`, `answered`, `dismissed` |
| `confidence_trigger` | `numeric` | YES | — | Confidence threshold that caused escalation |
| `created_at` | `timestamptz` | NO | `now()` | Row creation time (UTC) |
| `updated_at` | `timestamptz` | NO | `now()` | Last row update (UTC); set by `BEFORE UPDATE` trigger |
| `created_by` | `uuid` | NO | — | FK → `users.id`; actor who created the row |
| `updated_by` | `uuid` | NO | — | FK → `users.id`; actor who last updated the row |
| `status` | `char(1)` | NO | `'A'` | Row visibility: `A` = active, `D` = soft-deleted |

> `queue_status` is domain workflow state; row `status` is soft-delete visibility. Types may change when the migration is written. See [`data-model.md`](../data-model.md) §2.4.
