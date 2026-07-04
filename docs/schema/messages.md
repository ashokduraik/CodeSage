# `messages`

> **Status:** planned (no migration yet)  
> **Domain:** QA, operations, audit

Individual turns within a `conversations` row: user prompts and assistant replies stored in order.
Assistant messages attach grounded citations (code chunks, graph nodes, or derived-knowledge sources)
so the UI can show “why” alongside each answer; when grounding is insufficient, the pipeline may
emit an uncertainty response or enqueue an `expert_question` instead of inventing detail. Messages are
append-only within a conversation for a clear audit trail of what was asked and answered.

## Intended columns

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `conversation_id` | `uuid` | NO | — | FK → `conversations.id` |
| `role` | `text` | NO | — | `user`, `assistant`, or `system` |
| `content` | `text` | NO | — | Message body |
| `citations` | `jsonb` | YES | — | Source refs for assistant answers |
| `created_at` | `timestamptz` | NO | `now()` | Message time (UTC) |
| `updated_at` | `timestamptz` | NO | `now()` | Last row update (UTC); set by `BEFORE UPDATE` trigger |
| `created_by` | `uuid` | NO | — | FK → `users.id`; actor who created the row |
| `updated_by` | `uuid` | NO | — | FK → `users.id`; actor who last updated the row |
| `status` | `char(1)` | NO | `'A'` | Row visibility: `A` = active, `D` = soft-deleted |

> Types may change when the migration is written. See [`data-model.md`](../data-model.md) §2.5.
