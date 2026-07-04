# `messages`

> **Status:** planned (no migration yet)  
> **Domain:** QA, operations, audit

Individual turns within a QA conversation, with grounded citations on assistant replies.

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
