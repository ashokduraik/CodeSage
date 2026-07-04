# `expert_answers`

> **Status:** planned (no migration yet)  
> **Domain:** Expert-in-the-loop

Authoritative expert-authored responses linked to `expert_questions` (or standing knowledge topics).
Unlike LLM-derived rows, expert answers are treated as ground truth in QA and intentionally survive
re-indexing — they override or supplement inferred workflows, permissions, and page maps when code
alone is ambiguous. Each answer records the expert user, timestamp, and optional scope so audit and
RBAC remain intact.

## Intended columns

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `question_id` | `uuid` | NO | — | FK → `expert_questions.id` |
| `author_id` | `uuid` | NO | — | FK → `users.id`; answering expert |
| `answer` | `text` | NO | — | Authoritative answer text |
| `is_override` | `boolean` | NO | `true` | Whether this answer overrides distilled knowledge |
| `created_at` | `timestamptz` | NO | `now()` | Answer time (UTC) |
| `updated_at` | `timestamptz` | NO | `now()` | Last row update (UTC); set by `BEFORE UPDATE` trigger |
| `created_by` | `uuid` | NO | — | FK → `users.id`; actor who created the row |
| `updated_by` | `uuid` | NO | — | FK → `users.id`; actor who last updated the row |
| `status` | `char(1)` | NO | `'A'` | Row visibility: `A` = active, `D` = soft-deleted |

> Types may change when the migration is written. See [`data-model.md`](../data-model.md) §2.4.
