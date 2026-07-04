# PostgreSQL schema — column reference

One file per table. The **source of truth for the actual DDL** is
`apps/api/src/platform/migrations/` (applied automatically at API startup).

Update the matching file here in the **same change** as any migration. Keep
[`data-model.md`](../data-model.md) updated when domains, relationships, or high-level
rules change.

## Implemented tables

| Table | Domain | File |
|---|---|---|
| `users` | Identity | [`users.md`](./users.md) |
| `projects` | Identity | [`projects.md`](./projects.md) |
| `repos` | Identity | [`repos.md`](./repos.md) |
| `graph_nodes` | Code knowledge | [`graph_nodes.md`](./graph_nodes.md) |
| `graph_edges` | Code knowledge | [`graph_edges.md`](./graph_edges.md) |
| `code_chunks` | Code knowledge | [`code_chunks.md`](./code_chunks.md) |
| `jobs` | Operations | [`jobs.md`](./jobs.md) |
| `audit_log` | Operations | [`audit_log.md`](./audit_log.md) |
| `schema_migrations` | Operations (runner) | [`schema_migrations.md`](./schema_migrations.md) |

## Planned tables (no migration yet)

| Table | Domain | File |
|---|---|---|
| `workflows` | Derived knowledge | [`workflows.md`](./workflows.md) |
| `page_map` | Derived knowledge | [`page_map.md`](./page_map.md) |
| `permission_rules` | Derived knowledge | [`permission_rules.md`](./permission_rules.md) |
| `data_flows` | Derived knowledge | [`data_flows.md`](./data_flows.md) |
| `expert_questions` | Expert-in-the-loop | [`expert_questions.md`](./expert_questions.md) |
| `expert_answers` | Expert-in-the-loop | [`expert_answers.md`](./expert_answers.md) |
| `conversations` | QA | [`conversations.md`](./conversations.md) |
| `messages` | QA | [`messages.md`](./messages.md) |

## Enums

| Type | Values | Used by |
|---|---|---|
| `user_role` | `admin`, `expert`, `developer`, `end_user`, `system` | `users.role` (`system` is internal only; see ADR 0018) |
| `repo_provider` | `github`, `gitlab` | `repos.provider` |
| `project_status` | `active`, `indexed`, `indexing`, `stale`, `connecting`, `error` | `projects.lifecycle_status` |
| `job_status` | `pending`, `running`, `done`, `failed` | `jobs.job_status` |

## Column table legend

| Column header | Meaning |
|---|---|
| **Null** | `NO` = `NOT NULL`, `YES` = nullable |
| **Default** | `—` = no default (or implicit PK default shown) |

## Mandatory audit columns (ADR 0018)

Every **domain table** includes `status`, `created_at`, `created_by`, `updated_at`, and
`updated_by`. Excluded: `schema_migrations`, `audit_log`.

| Column | Set by |
|---|---|
| `created_at` | DB default on insert |
| `created_by` | Application (`JWT sub`, or service user — see [`users.md`](./users.md)) |
| `updated_at` | PostgreSQL `BEFORE UPDATE` trigger (`set_row_updated_at`) |
| `updated_by` | Application on every update |

New migrations must add these columns and triggers from the start (see
`apps/api/src/platform/migrations/_TEMPLATE.sql`).
