# `graph_nodes`

> **Status:** implemented  
> **Domain:** Code knowledge (developer layer)

AST-derived vertices in the code knowledge graph: files, classes, functions, routes, and similar
symbols extracted during parse. Nodes are scoped to a project and repo and keyed by a stable symbol
identity so re-indexing can upsert rather than duplicate. They power developer-facing navigation,
impact analysis, **symbol search at query time** (joined to `code_chunks` via `symbol_refs`, ADR 0020),
and inputs to LLM distillation of higher-level product knowledge.

## Columns

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `project_id` | `uuid` | NO | — | FK → `projects.id`; project scope |
| `repo_id` | `uuid` | NO | — | FK → `repos.id`; source repo |
| `kind` | `text` | NO | — | Node type: `file`, AST symbol kinds, `http_call` (client API call), `route` (Express route) |
| `name` | `text` | NO | — | Symbol/file name, or `METHOD /path` for `http_call` / `route` nodes |
| `file_path` | `text` | YES | — | Repo-relative file path when applicable |
| `span` | `jsonb` | YES | — | Source location, e.g. start/end line and column |
| `created_at` | `timestamptz` | NO | `now()` | Row creation time (UTC) |
| `updated_at` | `timestamptz` | NO | `now()` | Last row update (UTC); set by `BEFORE UPDATE` trigger |
| `created_by` | `uuid` | NO | — | FK → `users.id`; actor who created the row (typically `rag-worker`) |
| `updated_by` | `uuid` | NO | — | FK → `users.id`; actor who last updated the row |
| `status` | `char(1)` | NO | `'A'` | Row visibility: `A` = active, `D` = soft-deleted |

## Constraints

- `status` must be `A` or `D` (`graph_nodes_status_check`).

## Indexes

| Name | Columns | Notes |
|---|---|---|
| `idx_graph_nodes_project_id` | `project_id` | Project-scoped graph queries |
| `idx_graph_nodes_repo_id` | `repo_id` | Per-repo node lookups |
| `idx_graph_nodes_file_path` | `repo_id`, `file_path` | Nodes in a file |
| `idx_graph_nodes_name_trgm` | `name` | GIN `gin_trgm_ops` for symbol name search (ADR 0020) |
| `idx_graph_nodes_symbol_lookup` | `project_id`, `kind`, `name` | Active function/class/method lookup |

## Foreign keys

| Column | References | On delete |
|---|---|---|
| `project_id` | `projects(id)` | `CASCADE` |
| `repo_id` | `repos(id)` | `CASCADE` |
| `created_by` | `users(id)` | (no action) |
| `updated_by` | `users(id)` | (no action) |
