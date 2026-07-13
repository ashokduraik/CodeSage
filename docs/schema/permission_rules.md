# `permission_rules`

> **Status:** migrated (`20260712200000_derived_knowledge_tables.sql`)  
> **Domain:** Derived product knowledge (end-user layer)

Inferred permission and authorization rules — which roles or claims are required to reach a page or
perform an action — distilled from middleware, guards, and config across repos. End-user chat uses
this layer to answer “who can do X?” with grounded references rather than guessing from generic
patterns. Rules are versioned with indexing runs and must record confidence plus source citations
for trust and auditability.

## Intended columns

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `project_id` | `uuid` | NO | — | FK → `projects.id`; owning project |
| `target` | `text` | NO | — | Page, route, or action being guarded |
| `required_permission` | `text` | NO | — | Role, scope, or claim required |
| `source_refs` | `jsonb` | NO | — | Citation pointers to enforcing code |
| `confidence` | `numeric` | NO | — | Model confidence score (0–1) |
| `is_stale` | `boolean` | NO | `false` | Set when incremental re-index touches cited files |
| `is_expert_override` | `boolean` | NO | `false` | When true, distillation skips this row (Phase 5) |
| `created_at` | `timestamptz` | NO | `now()` | Row creation time (UTC) |
| `updated_at` | `timestamptz` | NO | `now()` | Last distillation or expert override (UTC); set by `BEFORE UPDATE` trigger |
| `created_by` | `uuid` | NO | — | FK → `users.id`; actor who created the row |
| `updated_by` | `uuid` | NO | — | FK → `users.id`; actor who last updated the row |
| `status` | `char(1)` | NO | `'A'` | Row visibility: `A` = active, `D` = soft-deleted |

> Types and extra columns may change when the migration is written. See [`data-model.md`](../data-model.md) §2.3.
