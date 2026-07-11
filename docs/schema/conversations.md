# `conversations`

> **Status:** implemented (`20260711120000_chat_conversations_messages.sql`)  
> **Domain:** QA, operations, audit

QA chat sessions tying together a sequence of user and assistant turns for one project. Each
conversation selects an audience mode — `developer` (code-grounded, graph/chunk citations) or
`end_user` (product-knowledge layer) — so retrieval and prompting stay appropriate to the role.
Sessions belong to the authenticated user and persist history for resume, audit, and feedback on
answer quality. Soft-deleted conversations are hidden from list/detail queries (`status = 'D'`).

## Columns

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `project_id` | `uuid` | NO | — | FK → `projects.id`; project context |
| `user_id` | `uuid` | NO | — | FK → `users.id`; session owner (private per user) |
| `audience` | `text` | NO | — | `developer` or `end_user` — routes retrieval strategy |
| `title` | `text` | YES | — | Display title; LLM-generated on first message when available |
| `created_at` | `timestamptz` | NO | `now()` | Session start (UTC) |
| `updated_at` | `timestamptz` | NO | `now()` | Last message time (UTC); set by `BEFORE UPDATE` trigger |
| `created_by` | `uuid` | NO | — | FK → `users.id`; actor who created the row |
| `updated_by` | `uuid` | NO | — | FK → `users.id`; actor who last updated the row |
| `status` | `char(1)` | NO | `'A'` | Row visibility: `A` = active, `D` = soft-deleted |

## Indexes

| Index | Columns | Notes |
|---|---|---|
| `idx_conversations_user_active` | `(user_id, updated_at DESC)` | Partial `WHERE status = 'A'` — sidebar + dashboard |
| `idx_conversations_project_active` | `(project_id)` | Partial `WHERE status = 'A'` |

See [`data-model.md`](../data-model.md) §2.5 and [ADR 0019](../adr/0019-persist-chat-history-in-postgres.md).
