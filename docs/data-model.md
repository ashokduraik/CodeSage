# CodeSage — Data Model Reference (PostgreSQL)

> All persistence lives in **one PostgreSQL instance** (with the `pgvector` extension).
> This doc is the human/agent-readable **overview** (domains, relationships, rules). The
> **source of truth for DDL** is `apps/api/src/platform/migrations/` (versioned SQL). For
> every table and column see [`schema/`](./schema/README.md). Update both in the same change
> as any migration.

## 1. Why a single datastore

Postgres covers everything the MVP needs, eliminating extra services:

- **Relational metadata + KB** (with JSONB for flexible derived artifacts).
- **Vectors** via `pgvector` (HNSW index, `halfvec`/fp16 storage).
- **Code graph** via adjacency tables + recursive CTEs.
- **Job queue** via `SELECT … FOR UPDATE SKIP LOCKED` (or Procrastinate).
- **Encrypted repo tokens** (app-level envelope encryption).

## 2. Tables

### 2.1 Identity & projects

| Table | Purpose | Column reference |
|---|---|---|
| `users` | Accounts and roles | [`schema/users.md`](./schema/users.md) |
| `projects` | A logical system (one per microservice system) | [`schema/projects.md`](./schema/projects.md) |
| `repos` | Repos belonging to a project (**many per project**) | [`schema/repos.md`](./schema/repos.md) |

### 2.2 Code knowledge (developer layer)

| Table | Purpose | Column reference |
|---|---|---|
| `code_chunks` | RAG retrieval units + vectors | [`schema/code_chunks.md`](./schema/code_chunks.md) |
| `graph_nodes` | Files / symbols / HTTP API signals | [`schema/graph_nodes.md`](./schema/graph_nodes.md) |
| `graph_edges` | Calls / imports / callers | [`schema/graph_edges.md`](./schema/graph_edges.md) |

### 2.3 Derived product knowledge (end-user layer)

> Every row carries **`confidence`** and **source citations**. Expert answers create
> high-trust overrides that win over LLM-inferred values and survive re-indexing.

| Table | Purpose | Column reference |
|---|---|---|
| `workflows` | Derived business/user flows | [`schema/workflows.md`](./schema/workflows.md) *(planned)* |
| `page_map` | UI pages/routes | [`schema/page_map.md`](./schema/page_map.md) *(planned)* |
| `permission_rules` | Per page/action permission | [`schema/permission_rules.md`](./schema/permission_rules.md) *(planned)* |
| `data_flows` | Per-page data origin/freshness | [`schema/data_flows.md`](./schema/data_flows.md) *(planned)* |

### 2.4 Expert-in-the-loop

| Table | Purpose | Column reference |
|---|---|---|
| `expert_questions` | Clarification queue | [`schema/expert_questions.md`](./schema/expert_questions.md) *(planned)* |
| `expert_answers` | Authoritative overrides | [`schema/expert_answers.md`](./schema/expert_answers.md) *(planned)* |

### 2.5 QA, operations, audit

| Table | Purpose | Column reference |
|---|---|---|
| `conversations` | QA chat sessions | [`schema/conversations.md`](./schema/conversations.md) *(planned)* |
| `messages` | Turns within a conversation | [`schema/messages.md`](./schema/messages.md) *(planned)* |
| `jobs` | Postgres-backed job queue (ADR 0006); supersession via row `status = 'D'`; see [`schema/jobs.md`](./schema/jobs.md) | [`schema/jobs.md`](./schema/jobs.md) |
| `repo_indexing_events` | Per-repo indexing progress timeline (user-facing) | [`schema/repo_indexing_events.md`](./schema/repo_indexing_events.md) |
| `audit_log` | Security/audit trail | [`schema/audit_log.md`](./schema/audit_log.md) |

## 3. Relationships (high level)

```
projects 1───* repos
projects 1───* code_chunks / graph_nodes / workflows / page_map / permission_rules / data_flows
graph_nodes *──* graph_nodes        (via graph_edges; edges may cross repos within a project)
expert_questions 1───* expert_answers
conversations 1───* messages
```

## 4. Scale expectations (sizing assumptions, not facts)

Target: up to **10 projects × ~3M LOC** (≈30M LOC). Derived estimates:

- Vectors: ~0.5M–1.5M chunks → ~5–20 GB with `halfvec` + HNSW.
- Graph: ~5M nodes / ~20M edges.
- Postgres total: ~150–400 GB including indexes + headroom.

Keep the HNSW index + hot data in RAM (Machine 1 has 64–128 GB). See `final-solution.md` §11.

## 5. Maintainability rules for this schema

- **One concern = one place:** schema changes go **only** through `apps/api/src/platform/migrations/`.
- Keep [`schema/`](./schema/README.md) and this overview updated in the **same PR** as any migration.
- Prefer explicit columns over giant JSON blobs except for genuinely flexible KB artifacts.
- **Every table** has row `status char(1) DEFAULT 'A'` (`A` = Active, `D` = Deleted) — see
  `.cursor/rules/row-status.mdc`. Domain lifecycle uses a differently named column.
- **Every domain table** has mandatory audit columns (`created_by`, `updated_at`, `updated_by`)
  per [ADR 0018](./adr/0018-mandatory-audit-columns.md); `audit_log` and `schema_migrations`
  are excluded.
- Every derived-knowledge table **must** keep `confidence` + citation columns — trust is a
  first-class product feature (NFR-7).
