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
- **Keyword / exact search** via `pg_trgm` trigram (GIN) indexes for hybrid code retrieval (ADR 0020).
  Query-time ranking refinements (dynamic weights, prune, hybrid confidence) are ADR 0021 — no
  additional schema for M3.2.
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
| `code_chunks` | RAG retrieval units + vectors (+ `pg_trgm` keyword search) | [`schema/code_chunks.md`](./schema/code_chunks.md) |
| `graph_nodes` | Files / symbols / HTTP API signals (backs symbol search) | [`schema/graph_nodes.md`](./schema/graph_nodes.md) |
| `graph_edges` | Calls / imports / callers | [`schema/graph_edges.md`](./schema/graph_edges.md) |

### 2.3 Derived product knowledge (end-user layer)

> Every row carries **`confidence`** and **source citations**. Expert answers create
> high-trust overrides that win over LLM-inferred values and survive re-indexing.

| Table | Purpose | Column reference |
|---|---|---|
| `workflows` | Derived business/user flows | [`schema/workflows.md`](./schema/workflows.md) |
| `page_map` | UI pages/routes | [`schema/page_map.md`](./schema/page_map.md) |
| `permission_rules` | Per page/action permission | [`schema/permission_rules.md`](./schema/permission_rules.md) |
| `data_flows` | Per-page data origin/freshness | [`schema/data_flows.md`](./schema/data_flows.md) |

### 2.4 Expert-in-the-loop

| Table | Purpose | Column reference |
|---|---|---|
| `expert_questions` | Clarification queue | [`schema/expert_questions.md`](./schema/expert_questions.md) *(planned)* |
| `expert_answers` | Authoritative overrides | [`schema/expert_answers.md`](./schema/expert_answers.md) *(planned)* |

### 2.5 QA, operations, audit

| Table | Purpose | Column reference |
|---|---|---|
| `jobs` | Postgres-backed job queue (ADR 0006); supersession via row `status = 'D'` | [`schema/jobs.md`](./schema/jobs.md) |
| `repo_indexing_events` | Per-repo indexing progress timeline (user-facing) | [`schema/repo_indexing_events.md`](./schema/repo_indexing_events.md) |
| `audit_log` | Security/audit trail | [`schema/audit_log.md`](./schema/audit_log.md) |
| `conversations` | QA chat sessions (private per user) | [`schema/conversations.md`](./schema/conversations.md) |
| `messages` | Turns within a conversation | [`schema/messages.md`](./schema/messages.md) |
| `qa_playbooks` | Learned investigation paths (ADR 0027) | [`schema/qa_playbooks.md`](./schema/qa_playbooks.md) |

## 3. Relationships (high level)

```
projects 1───* repos
projects 1───* code_chunks / graph_nodes / workflows / page_map / permission_rules / data_flows
projects 1───* qa_playbooks
graph_nodes *──* graph_nodes        (via graph_edges; edges may cross repos within a project)
expert_questions 1───* expert_answers
conversations 1───* messages
messages 0..1───* qa_playbooks      (optional source_message_id provenance)
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
