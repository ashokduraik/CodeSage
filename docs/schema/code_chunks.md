# `code_chunks`

> **Status:** implemented  
> **Domain:** Code knowledge (developer layer)

Retrieval units for hybrid search: contiguous source text spans (functions, blocks, docs) with
metadata tying each chunk to file, symbol, and repo. After embed jobs run, rows store pgvector
embeddings used by the RAG service to ground chat answers with citations. The same `content` is
also used for **keyword/exact retrieval** via `pg_trgm` trigram matching, and `symbol_refs` links
chunks to `graph_nodes` for **symbol search** — the three signals are fused at query time
(ADR 0020). Chunks are rebuilt on re-index; stale vectors for a repo are replaced rather than
accumulated indefinitely.

## Columns

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `project_id` | `uuid` | NO | — | FK → `projects.id`; project scope |
| `repo_id` | `uuid` | NO | — | FK → `repos.id`; source repo |
| `file_path` | `text` | NO | — | Repo-relative path of the chunk source |
| `span` | `jsonb` | NO | — | Byte or line range within the file |
| `content` | `text` | NO | — | Chunk text used for retrieval and citation |
| `embedding` | `vector(1024)` | YES | — | pgvector embedding for cosine similarity search |
| `symbol_refs` | `jsonb` | NO | `'[]'` | Linked graph node IDs or symbol identifiers |
| `created_at` | `timestamptz` | NO | `now()` | Row creation time (UTC) |
| `updated_at` | `timestamptz` | NO | `now()` | Last re-embed or content update (UTC); set by `BEFORE UPDATE` trigger |
| `created_by` | `uuid` | NO | — | FK → `users.id`; actor who created the row (typically `rag-worker`) |
| `updated_by` | `uuid` | NO | — | FK → `users.id`; actor who last updated the row |
| `status` | `char(1)` | NO | `'A'` | Row visibility: `A` = active, `D` = soft-deleted |

## Constraints

- `status` must be `A` or `D` (`code_chunks_status_check`).

## Indexes

| Name | Columns | Notes |
|---|---|---|
| `idx_code_chunks_project_id` | `project_id` | Project-scoped chunk queries |
| `idx_code_chunks_repo_id` | `repo_id` | Per-repo chunk lookups |
| `idx_code_chunks_file_path` | `repo_id`, `file_path` | Chunks in a file |
| `idx_code_chunks_embedding` | `embedding` | HNSW (`vector_cosine_ops`) for ANN search |
| `idx_code_chunks_content_trgm` | `content` | GIN `gin_trgm_ops` for `pg_trgm` keyword/exact retrieval (ADR 0020) |

## Foreign keys

| Column | References | On delete |
|---|---|---|
| `project_id` | `projects(id)` | `CASCADE` |
| `repo_id` | `repos(id)` | `CASCADE` |
| `created_by` | `users(id)` | (no action) |
| `updated_by` | `users(id)` | (no action) |
