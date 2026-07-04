# `graph_edges`

> **Status:** implemented  
> **Domain:** Code knowledge (developer layer)

Directed relationships between graph nodes: calls, imports, inheritance, etc. May connect nodes across repos within the same project.

## Columns

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `project_id` | `uuid` | NO | — | FK → `projects.id`; project scope |
| `src_id` | `uuid` | NO | — | FK → `graph_nodes.id`; edge source |
| `dst_id` | `uuid` | NO | — | FK → `graph_nodes.id`; edge target |
| `kind` | `text` | NO | — | Edge type, e.g. `calls`, `imports`, `extends` |
| `created_at` | `timestamptz` | NO | `now()` | Row creation time (UTC) |
| `updated_at` | `timestamptz` | NO | `now()` | Last row update (UTC); set by `BEFORE UPDATE` trigger |
| `created_by` | `uuid` | NO | — | FK → `users.id`; actor who created the row |
| `updated_by` | `uuid` | NO | — | FK → `users.id`; actor who last updated the row |
| `status` | `char(1)` | NO | `'A'` | Row visibility: `A` = active, `D` = soft-deleted |

## Constraints

- `src_id` must differ from `dst_id` (`graph_edges_distinct_endpoints`).
- `status` must be `A` or `D` (`graph_edges_status_check`).

## Indexes

| Name | Columns | Notes |
|---|---|---|
| `idx_graph_edges_project_id` | `project_id` | Project-scoped edge queries |
| `idx_graph_edges_src_id` | `src_id` | Outgoing edges from a node |
| `idx_graph_edges_dst_id` | `dst_id` | Incoming edges to a node |

## Foreign keys

| Column | References | On delete |
|---|---|---|
| `project_id` | `projects(id)` | `CASCADE` |
| `src_id` | `graph_nodes(id)` | `CASCADE` |
| `dst_id` | `graph_nodes(id)` | `CASCADE` |
| `created_by` | `users(id)` | (no action) |
| `updated_by` | `users(id)` | (no action) |
