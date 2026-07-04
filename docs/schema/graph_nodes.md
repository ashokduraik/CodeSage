# `graph_nodes`

> **Status:** implemented  
> **Domain:** Code knowledge (developer layer)

AST-derived graph vertices: files, classes, functions, routes, and similar symbols.

## Columns

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `project_id` | `uuid` | NO | — | FK → `projects.id`; project scope |
| `repo_id` | `uuid` | NO | — | FK → `repos.id`; source repo |
| `kind` | `text` | NO | — | Node type, e.g. `file`, `class`, `function`, `route` |
| `name` | `text` | NO | — | Symbol or file name |
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

## Foreign keys

| Column | References | On delete |
|---|---|---|
| `project_id` | `projects(id)` | `CASCADE` |
| `repo_id` | `repos(id)` | `CASCADE` |
| `created_by` | `users(id)` | (no action) |
| `updated_by` | `users(id)` | (no action) |
