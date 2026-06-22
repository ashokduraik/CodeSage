# CodeSage — Architecture Overview

> Consolidated, implementation-facing view. The authoritative source remains
> [`final-solution.md`](./final-solution.md); this doc is the quick map contributors and
> AI agents read before touching code.

## 1. One-paragraph mental model

CodeSage connects an organization's Git repositories, indexes them (AST graph + vector
chunks) into **one PostgreSQL datastore**, uses a self-hosted LLM to **distill** the system
into business/user knowledge (workflows, page map, permissions, data-flows), and answers
questions over chat — grounded with citations. When confidence is low it asks **experts**
clarifying questions and folds the answers back as authoritative overrides.

## 2. The hard boundary (memorize this)

```
React (apps/web)  →  Node non-blocking APIs (apps/api)  →  Python (`apps/rag` layers)
                                   │                                   │
                                   └────────── PostgreSQL (single datastore) ───────────┘
```

- **Node never blocks on heavy work.** It does auth, CRUD, static serving, WebSocket
  streaming. For heavy work it **enqueues a job** (row in Postgres) or **calls the Python RAG
  service** and streams the result back.
- **Python owns all heavy/blocking work:** repo sync, parsing, embedding, graph building,
  cross-repo linking, LLM distillation, retrieval, QA assembly.
- **Business logic lives in `apps/rag/src/services/`.** `src/api/` (HTTP) and `src/workers/` (jobs) are thin
  I/O layers only; `src/repositories/` + `src/models/` handle persistence.

## 3. Component map

| Component | Folder | Runtime | Responsibility |
|---|---|---|---|
| Web | `apps/web` | React + TS | Project setup, QA chat, expert queue, workflow/page explorer. |
| API | `apps/api` | Node + TS | Auth/RBAC, user/project/repo CRUD, WS gateway, webhooks, job enqueue. |
| Python backend | `apps/rag` | Python | `src/` layers: `api/`, `workers/`, `services/`, `repositories/`, `models/`, `config/`. |
| Shared TS types | `packages/shared-types` | TS | Types **generated** from `contracts/`; shared by web + api. |
| Datastore | (deploy) | PostgreSQL + pgvector | Metadata, KB, vectors, graph adjacency, job queue, encrypted tokens. |
| Inference | (deploy) | vLLM + TEI | LLM generation + embeddings, self-hosted on GPU. |

## 4. Cross-service contract rule

Node (TS) and Python don't share code, so the API contract is the one thing that must not
drift. It is defined **once** in `contracts/` and **types are generated**, never hand-written:

- `contracts/openapi.node.yaml` — public Node REST/WS API.
- `contracts/openapi.rag.yaml` — internal Python RAG API.
- `contracts/jobs.schema.json` — job-queue payloads (Node enqueues → Python consumes).

Flow: **edit `contracts/` → run codegen → TS types land in `packages/shared-types`, Pydantic
models land in `apps/rag/` (when generated).** See [`development-workflow.md`](./development-workflow.md).

> `contracts/`, `db/`, `deploy/`, and `scripts/` are now scaffolded with READMEs and
> **placeholder skeletons only** (no implementation code). See each folder's `README.md`; the
> real contracts/migrations/compose/scripts are filled in during Phase 0.

## 5. Two knowledge layers

1. **Code knowledge** (for developers): `code_chunks` (pgvector) + `graph_nodes`/`graph_edges`.
2. **Derived product knowledge** (for end-users): `workflows`, `page_map`, `permission_rules`,
   `data_flows` — every row carries **confidence** + **source citations**.

QA routing: a small fast model classifies each question as **code** (→ vector + graph) or
**product** (→ structured KB), then a larger model answers with citations. Unsupported
questions get an honest "unknown" and may raise an expert question.

## 6. Key runtime flows (summary)

- **Initial index:** clone → enumerate/filter files → tree-sitter parse (nodes/edges) →
  AST-aware chunk → TEI embed → store; record `last_indexed_sha`.
- **Incremental freshness:** webhook/cron enqueues job → `git diff` vs SHA → re-parse/re-embed
  changed files → mark touched derived artifacts stale → re-distill only those.
- **Cross-repo linking:** match frontend HTTP calls ↔ Express routes ↔ IAM calls; confident →
  cross-repo edge, low-confidence → expert question.
- **Distillation:** walk graph from entrypoints → LLM produces workflows/pages/perms/data-flows
  with citations + confidence.
- **QA serving:** route → retrieve → assemble grounded prompt → stream answer + citations.

See [`final-solution.md`](./final-solution.md) §6–§8 for full detail and the mermaid diagrams.

## 7. Deployment shape (MVP)

Two on-prem machines, Docker Compose: **Machine 1** = PostgreSQL (+pgvector); **Machine 2** =
Node API + Python RAG + vLLM + TEI (1× 48 GB GPU). ~4 app services, 1 datastore. Kubernetes
is deferred until workers/inference need independent scaling.
