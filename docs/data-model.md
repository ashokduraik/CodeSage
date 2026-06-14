# CodeSage — Data Model Reference (PostgreSQL)

> All persistence lives in **one PostgreSQL instance** (with the `pgvector` extension).
> This doc is the human/agent-readable reference. The **source of truth for the actual
> schema is `db/migrations/`** (versioned SQL) — scaffolded now, with the first migrations
> written in Phase 0. This file must be kept in sync with those migrations.

## 1. Why a single datastore

Postgres covers everything the MVP needs, eliminating extra services:

- **Relational metadata + KB** (with JSONB for flexible derived artifacts).
- **Vectors** via `pgvector` (HNSW index, `halfvec`/fp16 storage).
- **Code graph** via adjacency tables + recursive CTEs.
- **Job queue** via `SELECT … FOR UPDATE SKIP LOCKED` (or Procrastinate).
- **Encrypted repo tokens** (app-level envelope encryption).

## 2. Tables

### 2.1 Identity & projects

| Table | Purpose | Key columns / notes |
|---|---|---|
| `users` | Accounts and roles | roles: `admin`, `expert`, `developer`, `end_user` |
| `projects` | A logical system (one per microservice system) | `name`, `status` |
| `repos` | Repos belonging to a project (**many per project**) | `project_id`, `repo_url`, `provider`, `branch`, `role` (`frontend`/`backend`/`iam`/…), `token_enc` (encrypted), `last_indexed_sha` |

### 2.2 Code knowledge (developer layer)

| Table | Purpose | Key columns / notes |
|---|---|---|
| `code_chunks` | RAG retrieval units + vectors | `embedding halfvec(N)` (HNSW index), `file_path`, `span`, `repo_id`, `project_id`, `symbol_refs` |
| `graph_nodes` | Files / classes / functions / routes | `kind`, `name`, `repo_id`, `file_path`, `span` |
| `graph_edges` | Calls / imports / callers | `src_id`, `dst_id`, `kind`; **may be cross-repo** (scoped per project) |

### 2.3 Derived product knowledge (end-user layer)

> Every row carries **`confidence`** and **source citations**. Expert answers create
> high-trust overrides that win over LLM-inferred values and survive re-indexing.

| Table | Purpose | Key columns / notes |
|---|---|---|
| `workflows` | Derived business/user flows | `name`, `steps[]` (code refs), `confidence` |
| `page_map` | UI pages/routes | `route`, `components[]`, `data_sources[]`, `confidence` |
| `permission_rules` | Per page/action permission | `target`, `required_permission`, `source_refs[]`, `confidence` |
| `data_flows` | Per-page data origin/freshness | `source_chain[]`, `freshness_type` (sync/async/cached/polled/event-driven), `confidence` |

### 2.4 Expert-in-the-loop

| Table | Purpose | Key columns / notes |
|---|---|---|
| `expert_questions` | Clarification queue | `context_ref`, `question`, `status`, `confidence_trigger` |
| `expert_answers` | Authoritative overrides | `question_id`, `author`, `answer`, `is_override = true` |

### 2.5 QA, operations, audit

| Table | Purpose | Key columns / notes |
|---|---|---|
| `conversations` / `messages` | QA history | `audience` (`dev` \| `end_user`), `citations[]` |
| `jobs` | Postgres-backed job queue (ADR 0006) | `type` (sync/parse/embed/xrepo/distill), `payload` (JSONB, see `contracts/jobs.schema.json`), `status` (`pending`/`running`/`done`/`failed`), `attempts`, `locked_at`; partial index on `status = 'pending'` for fast worker scans |
| `audit_log` | Security/audit trail | `actor_id` (FK to users), `action`, `target`, `ts`; indexed on `actor_id` and `ts` |

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

- **One concern = one place:** schema changes go **only** through `db/migrations/`.
- Keep this reference doc updated in the **same PR** as any migration.
- Prefer explicit columns over giant JSON blobs except for genuinely flexible KB artifacts.
- Every derived-knowledge table **must** keep `confidence` + citation columns — trust is a
  first-class product feature (NFR-7).
