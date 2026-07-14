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
React (apps/web)  →  Node non-blocking APIs (apps/api)  →  Python (`apps/engine` layers)
                                   │                                   │
                                   └────────── PostgreSQL (single datastore) ───────────┘
```

- **Node never blocks on heavy work.** It does auth, CRUD, static serving, WebSocket
  streaming. For heavy work it **enqueues a job** (row in Postgres) or **calls the Python RAG
  service** and streams the result back.
- **Python owns all heavy/blocking work:** repo sync, parsing, embedding, graph building,
  cross-repo linking, LLM distillation, retrieval, QA assembly.
- **Business logic lives in `apps/engine/src/services/`.** `src/api/` (HTTP) and `src/workers/` (jobs) are thin
  I/O layers only; `src/repositories/` + `src/models/` handle persistence.
- **RAG is internal-only at deploy time.** The browser talks to `apps/api`; Node proxies to
  `apps/engine` on the private network. Do not publish the RAG HTTP port publicly.

## 3. Component map

| Component | Folder | Runtime | Responsibility |
|---|---|---|---|
| Web | `apps/web` | React + TS | Project setup, QA chat, expert queue, workflow/page explorer. |
| API | `apps/api` | Node + TS | Auth/RBAC, user/project/repo CRUD, WS gateway, webhooks, job enqueue. |
| Python backend | `apps/engine` | Python | `src/` layers: `api/`, `workers/`, `services/`, `repositories/`, `models/`, `config/`. |
| Shared TS types | `packages/shared-types` | TS | Types **generated** from `contracts/`; shared by web + api. |
| Datastore | (deploy) | PostgreSQL + pgvector | Metadata, KB, vectors, graph adjacency, job queue, encrypted tokens. |
| Inference | (deploy) | vLLM + TEI | LLM generation + embeddings, self-hosted on GPU. |

## 4. Cross-service contract rule

Node (TS) and Python don't share code, so the API contract is the one thing that must not
drift. It is defined **once** in `contracts/` and **types are generated**, never hand-written:

- `contracts/openapi.node.yaml` — public Node REST/WS API.
- `contracts/openapi.engine.yaml` — internal Python RAG API.
- `contracts/jobs.schema.json` — job-queue payloads (Node enqueues → Python consumes).

Flow: **edit `contracts/` → run codegen → TS types land in `packages/shared-types`, Pydantic
models land in `apps/engine/` (when generated).** See [`development-workflow.md`](./development-workflow.md).

> `contracts/` is the single source of truth; types are **generated** into `packages/shared-types`
> (TS) and `apps/engine/src/generated/` (Pydantic). See each folder's `README.md` and
> [`development-workflow.md`](./development-workflow.md) §3.

## 5. Two knowledge layers

1. **Code knowledge** (for developers): `code_chunks` (pgvector) + `graph_nodes`/`graph_edges`.
2. **Derived product knowledge** (for end-users): `workflows`, `page_map`, `permission_rules`,
   `data_flows` — every row carries **confidence** + **source citations**.

QA routing: a small fast model classifies each question as **code** (→ hybrid retrieval + graph)
or **product** (→ structured KB), then a larger model answers with citations. Code retrieval is
**hybrid** (ADR 0020): symbol, keyword (`pg_trgm`), and vector (pgvector) search run in parallel,
fused with weighted RRF, graph expansion, then **prune to top 8–10** and a **hybrid confidence**
gate (ADR 0021). Optional **cross-encoder rerank** before packing (ADR 0021 M3.3). Unsupported
questions get an honest "unknown" and may raise an expert question.

## 6. Key runtime flows (summary)

- **Initial index:** clone → enumerate/filter files → tree-sitter parse (nodes/edges) →
  extract HTTP/route API signals → AST-aware chunk → TEI embed → store; record
  `last_indexed_sha`. When all repos in a multi-repo project finish embedding, enqueue
  **`xrepo`** to link frontend HTTP calls ↔ backend routes (cross-repo `graph_edges`).
- **Incremental freshness:** webhook/cron enqueues job → `git diff` vs SHA → re-parse/re-embed
  changed files → mark touched derived artifacts stale → re-distill only those (Phase 3+).
- **Cross-repo linking (Phase 2):** `xrepo` job matches `http_call` nodes to `route` nodes by
  method + path across repos; QA retrieval expands fused hits along those edges.
- **Distillation:** walk graph from entrypoints → LLM produces workflows/pages/perms/data-flows
  with citations + confidence.
- **QA serving:** route → **hybrid retrieve** (symbol + keyword + vector → weighted RRF) → graph
  expand → **prune / optional rerank** → hybrid confidence → grounded prompt → stream answer +
  citations (ADR 0020, ADR 0021).

See [`final-solution.md`](./final-solution.md) §6–§8 for full detail and the mermaid diagrams.

## 6b. Error handling (chat / cross-service)

- **REST:** Node uses Fastify `setErrorHandler`; Engine uses FastAPI
  `@app.exception_handler`. Both return `{ error: { code, message } }` (see
  `contracts/` `ApiError` / `EngineErrorResponse`).
- **Process (Node):** `unhandledRejection` is logged and the process stays up;
  `uncaughtException` logs and exits. Registered from `apps/api` entrypoint.
- **Chat SSE:** After `200` stream headers, failures must emit a terminal
  `type: "error"` chunk (contracts). The web client treats `error` or a truncated
  stream (no `done`/`abstain`/`error`) as a failed send and shows a localized alert.
- Conventions: `.cursor/rules/error-handling.mdc`.

## 7. Deployment shape (MVP)

Two on-prem machines, Docker Compose: **Machine 1** = PostgreSQL (+pgvector); **Machine 2** =
Node API + Python RAG + vLLM + TEI (1× 48 GB GPU). ~4 app services, 1 datastore. Kubernetes
is deferred until workers/inference need independent scaling.
