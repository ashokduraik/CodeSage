# `qa_playbooks`

> **Status:** implemented (`20260717120000_qa_playbooks_investigation_trace.sql`)  
> **Domain:** QA (learned retrieval paths)

Project-scoped **investigation playbooks** — reusable tool sequences distilled from successful
agent QA runs (ADR 0027). Rows store retrieval strategy (steps + stable file/symbol anchors) and
a question embedding for similarity lookup; they do **not** store answer text. Evidence must
always be re-fetched at answer time (NFR-7). Soft-delete via `status = 'D'` when anchors go
stale after re-index (invalidation in plan 12). Promotion/merge logic is plan 11.

## Columns

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `project_id` | `uuid` | NO | — | FK → `projects.id`; playbooks never share across projects |
| `canonical_question` | `text` | NO | — | Normalized exemplar wording (display / dedup) |
| `question_embedding` | `halfvec(1024)` | YES | — | TEI embedding of the canonical question (same dim as `code_chunks`) |
| `intent_profile` | `text` | NO | — | `symbol_lookup`, `conceptual`, or `balanced` |
| `steps` | `jsonb` | NO | — | Ordered tool sequence with `{term:…}` / `{anchor:…}` placeholders |
| `evidence_anchors` | `jsonb` | NO | — | Stable `filePath` / `symbol` / `graphNodeId` anchors from a successful run |
| `success_count` | `int` | NO | `1` | Times this playbook reinforced a successful answer |
| `last_success_at` | `timestamptz` | NO | `now()` | Last successful use (UTC) |
| `source_message_id` | `uuid` | YES | — | FK → `messages.id`; provenance of the promoting turn |
| `created_at` | `timestamptz` | NO | `now()` | Row creation time (UTC) |
| `updated_at` | `timestamptz` | NO | `now()` | Last update (UTC); set by `BEFORE UPDATE` trigger |
| `created_by` | `uuid` | NO | — | FK → `users.id`; actor who created the row |
| `updated_by` | `uuid` | NO | — | FK → `users.id`; actor who last updated the row |
| `status` | `char(1)` | NO | `'A'` | Row visibility: `A` = active, `D` = soft-deleted |

## Constraints

- `status` must be `A` or `D` (`qa_playbooks_status_check`).
- `intent_profile` must be `symbol_lookup`, `conceptual`, or `balanced`.

## Indexes

| Name | Columns | Notes |
|---|---|---|
| `idx_qa_playbooks_project_active` | `(project_id, last_success_at DESC)` | Partial `WHERE status = 'A'` — recent playbooks |
| `idx_qa_playbooks_question_embedding` | `question_embedding` | HNSW (`halfvec_cosine_ops`), partial `WHERE status = 'A'` |

## Foreign keys

| Column | References | On delete |
|---|---|---|
| `project_id` | `projects(id)` | `CASCADE` |
| `source_message_id` | `messages(id)` | `SET NULL` |
| `created_by` / `updated_by` | `users(id)` | — |

## Caps (application)

Active playbooks per project are capped at `QA_PLAYBOOK_MAX_PER_PROJECT` (default 500) in the
learning service (plan 11). This table has no DB-level cap.

See [`data-model.md`](../data-model.md) §2.5 and [ADR 0027](../adr/0027-qa-investigation-playbooks.md).
