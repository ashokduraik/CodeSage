# `messages`

> **Status:** implemented (`20260711120000_chat_conversations_messages.sql`)  
> **Domain:** QA, operations, audit

Individual turns within a `conversations` row: user prompts and assistant replies stored in order.
Assistant messages attach grounded citations (code chunks) in `citations` JSONB so the UI can show
“why” alongside each answer. When grounding is insufficient, the pipeline may emit an uncertainty
response (`needs_review`) instead of inventing detail. A `stopped` assistant message records a
user-initiated abort mid-stream (partial content is kept). Messages are append-only within a
conversation for a clear audit trail.

## Columns

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `conversation_id` | `uuid` | NO | — | FK → `conversations.id` |
| `role` | `text` | NO | — | `user`, `assistant`, or `system` |
| `content` | `text` | NO | — | Message body |
| `citations` | `jsonb` | YES | — | `CodeCitation[]` for assistant answers |
| `metrics` | `jsonb` | YES | — | `AnswerMetrics` from the RAG stream |
| `needs_review` | `boolean` | NO | `false` | True when the answer abstained or needs expert review |
| `stopped` | `boolean` | NO | `false` | True when the user stopped generation before completion |
| `created_at` | `timestamptz` | NO | `now()` | Message time (UTC) |
| `updated_at` | `timestamptz` | NO | `now()` | Last row update (UTC); set by `BEFORE UPDATE` trigger |
| `created_by` | `uuid` | NO | — | FK → `users.id`; actor who created the row |
| `updated_by` | `uuid` | NO | — | FK → `users.id`; actor who last updated the row |
| `status` | `char(1)` | NO | `'A'` | Row visibility: `A` = active, `D` = soft-deleted |

## Indexes

| Index | Columns | Notes |
|---|---|---|
| `idx_messages_conversation_active` | `(conversation_id, created_at)` | Partial `WHERE status = 'A'` |

See [`data-model.md`](../data-model.md) §2.5 and [ADR 0019](../adr/0019-persist-chat-history-in-postgres.md).
