# CodeSage — Technology & Learning Guide

> **Purpose:** Onboarding map for contributors. For each technology in the locked stack
> ([`final-solution.md`](./final-solution.md)), this doc explains **what it is**, **why you need
> it here**, **how CodeSage uses it**, and **what to study**.

---

## How to read this guide

CodeSage is a **monorepo** with a strict boundary:

```
React (apps/web) → Node API (apps/api) → Python (apps/rag) → PostgreSQL
```

Learn the layer you will touch first, then read upstream/downstream sections so you understand
data flow. Start with [`docs/README.md`](./README.md), then use this doc for depth on specific
tools.

---

## 1. Monorepo & shared tooling

### TypeScript

TypeScript is JavaScript with static types. It catches shape mismatches at compile time and
makes large refactors safer.

**Why here:** Both `apps/web` and `apps/api` are TypeScript-only. Shared API shapes come from
generated types in `packages/shared-types`.

**How used:** All frontend and Node backend code; strict typing on routes, hooks, and DB
repositories.

**Learn:** Basic types, interfaces, generics, `async`/`await`, ES modules (`import`/`export`),
strict null checks, and reading compiler errors.

---

### OpenAPI + contracts-first codegen

OpenAPI describes REST APIs in a machine-readable YAML file. Codegen turns that into TypeScript
(and Python Pydantic) types so callers and servers agree on shapes.

**Why here:** Node and Python do not share code. `contracts/` is the **single source of truth**
— drift between services is a production bug.

**How used:** Edit `contracts/openapi.node.yaml`, `openapi.rag.yaml`, or `jobs.schema.json` →
run `npm run codegen` → import from `@codesage/shared-types` (TS) or generated Pydantic models
(Python).

**Learn:** OpenAPI path/method/schema basics, JSON Schema, and the workflow “edit contract →
codegen → implement against generated types.”

---

## 2. Frontend — `apps/web`

### React

React is a library for building UIs from reusable components. State changes trigger efficient
re-renders via a virtual DOM.

**Why here:** The product is chat, project setup, expert queue, and explorer UIs — all
interactive, stateful screens.

**How used:** Feature folders under `src/features/` (projects, chat, auth, dashboard). Thin
components; logic lives in hooks.

**Learn:** JSX, functional components, `useState`, `useEffect`, `useContext`, component
composition, and controlled forms.

---

### React Router

React Router maps URLs to page components and supports protected routes.

**Why here:** Multi-page app: login, dashboard, projects, chat, explorer — without full page
reloads.

**How used:** `react-router-dom` in `main.tsx`; `ProtectedRoute` guards authenticated pages;
`AuthProvider` wraps the tree.

**Learn:** `BrowserRouter`, `Routes`/`Route`, `Navigate`, route params, and layout routes.

---

### TanStack React Query

React Query manages **server state**: fetching, caching, refetching, and mutations against the
API.

**Why here:** Projects, repos, and chat data come from the API. Manual `fetch` + `useEffect`
leads to stale data and duplicate loading logic.

**How used:** `QueryClientProvider` in `main.tsx`; hooks like `useCreateProject`, `useAttachRepo`
wrap typed `apiFetch` calls.

**Learn:** `useQuery`, `useMutation`, query keys, loading/error states, and optimistic updates.

---

### Tailwind CSS

Tailwind is utility-first CSS: small classes (`flex`, `p-4`, `text-sm`) composed in JSX instead
of large custom stylesheets.

**Why here:** Consistent design tokens and fast UI iteration without a separate CSS file per
component.

**How used:** `src/index.css` theme tokens; `src/shared/ui/` primitives; layout components
(`AppLayout`, `Sidebar`).

**Learn:** Utility classes, responsive prefixes (`md:`), and composing layouts from utilities.

---

### WebSocket client

WebSockets keep a persistent connection so the server can **stream** tokens (LLM answers) to the
browser.

**Why here:** QA answers are streamed from `apps/rag` via the Node gateway — not a single
JSON response.

**How used:** `apps/web` opens `WS /chat`; Node proxies to Python RAG; UI appends chunks and
renders citations.

**Learn:** WebSocket API in the browser, reconnection, message framing, and distinguishing
stream events (token vs citation vs done).

---

## 3. Node API — `apps/api`

### Node.js

Node.js runs JavaScript/TypeScript on the server with a non-blocking I/O model: one thread handles
many concurrent connections via the event loop.

**Why here:** CodeSage needs a **fast, non-blocking gateway** for auth, CRUD, webhooks, and
WebSocket proxying — not CPU-heavy indexing.

**How used:** `apps/api` serves REST under `/api`, runs migrations on startup, enqueues jobs, and
proxies RAG streaming.

**Learn:** Node event loop, modules, `process.env`, and why blocking the event loop is forbidden
in this project (“Node never blocks on heavy work”).

---

### async / await, Promises, and callbacks

JavaScript concurrency is built on **Promises** (future values) and **async functions** that
`await` them. Callbacks are the older pattern; modern code prefers async/await.

**Why here:** Every route handler, DB query, and JWT check is asynchronous. Mixing styles causes
subtle bugs.

**How used:** Fastify route handlers are `async (request, reply) => { ... }`; postgres.js and
JWT verification return Promises.

**Learn:** Promise states, `async`/`await`, error handling with `try/catch`, `Promise.all`, and
how the event loop schedules microtasks.

---

### Fastify

Fastify is a low-overhead Node web framework focused on speed, schema validation, and plugins.

**Why here:** The Node API layer — REST routes, JWT plugin, CORS, and middleware hooks.

**How used:** `buildApp()` in `http/app.ts`; modules register routes; `platform/` holds db,
config, and queue; global JWT middleware on `/api/*`.

**Learn:** Route registration, hooks (`onRequest`), decorators (`app.db`, `app.jwt`), reply
status codes, and plugin registration order.

---

### JWT & bcrypt auth

JWT (JSON Web Token) is a signed token proving identity. bcrypt hashes passwords for storage.

**Why here:** Self-hosted auth with RBAC roles: admin, expert, developer, end_user.

**How used:** `POST /auth/login` verifies bcrypt hash, signs JWT via `@fastify/jwt`; middleware
in `auth.middleware.ts` verifies tokens; web stores token in localStorage.

**Learn:** JWT structure (header/payload/signature), expiry, password hashing, and RBAC
middleware patterns.

---

### postgres.js

postgres.js is a lightweight PostgreSQL client for Node using tagged template literals for
parameterized queries.

**Why here:** Fast CRUD and job enqueue without ORM overhead on the Node side.

**How used:** `platform/db.ts` creates the pool; repositories in each module; migrations in
`platform/migrations/` applied at startup.

**Learn:** SQL basics, parameterized queries (never string-concat SQL), connection pooling, and
transactions.

---

### Job enqueue (Postgres queue)

Instead of Redis/RabbitMQ, CodeSage stores jobs as rows in PostgreSQL. Workers claim rows with
`SELECT … FOR UPDATE SKIP LOCKED`.

**Why here:** Single datastore — no separate message broker.

**How used:** `platform/queue.ts` inserts into `jobs`; Python workers consume via
`JobRepository.claim_next()` in `repositories/`.

**Learn:** Job payload design, idempotency, status transitions (pending → running → done/failed),
and why Node only **enqueues**, never runs sync/parse/embed.

---

### WebSocket gateway

The browser talks only to Node; Node proxies streaming QA to `apps/rag`.

**How used:** `modules/chat/` — WS upgrade, forward to Python internal API, stream citations
back to the client.

**Learn:** WebSocket upgrade handling, backpressure, and timeout handling in a proxy layer.

---

## 4. Python — `apps/rag` (layered)

### Python 3.12+

Python is the language for CPU/GPU-heavy work: parsing, embedding, graph building, LLM calls,
retrieval.

**Why here:** Ecosystem for ML, tree-sitter bindings, SQLAlchemy, and FastAPI — poor fit for
Node’s single-threaded model for long jobs.

**How used:** Layered backend — `api/` + `workers/` (I/O), `services/` (logic), `repositories/` + `models/` (persistence).

**Learn:** Type hints, `async` Python (for FastAPI), packaging (`pyproject.toml`), and virtual
environments.

---

### Pydantic & pydantic-settings

Pydantic validates and parses data into typed models. pydantic-settings loads config from
environment variables.

**Why here:** Cross-service job payloads and RAG request bodies must be validated at boundaries.

**How used:** `config/` (`Settings`, `load_settings`); generated models from contracts.

**Learn:** `BaseModel`, field validators, settings classes, and env var naming.

---

### SQLAlchemy 2.0

SQLAlchemy is Python’s ORM/query builder for relational databases.

**Why here:** All Python persistence goes through `repositories/` + `models/` — ORM, repos, vector
and graph queries.

**How used:** Models for `users`, `projects`, `repos`, `jobs`, `code_chunks`, `graph_nodes`,
`graph_edges`; repository classes per table group; `session_scope` for transactions.

**Learn:** Declarative models, `Session`, `select()`, relationships, and how ORM maps to SQL
migrations in `db/migrations/`.

---

### FastAPI

FastAPI is a modern Python web framework with automatic OpenAPI docs and async support.

**Why here:** Internal `POST /rag/query` service — streaming responses, typed bodies from
contracts.

**How used:** `apps/rag/api/` wires HTTP to `services/` retrieval + LLM modules; **not** exposed
to the browser directly.

**Learn:** Path operations, dependency injection, streaming responses (SSE), and mounting
routers.

---

### Procrastinate

Procrastinate is a PostgreSQL-backed task queue for Python (alternative to raw `SKIP LOCKED`).

**Why here:** Worker job dispatch with retries and concurrency control.

**How used:** `apps/rag` background consumers for `sync`, `parse`, `embed`, `xrepo`, `distill` job
types.

**Learn:** Task definitions, retries, concurrency limits, and idempotent job handlers.

---

## 5. Database & persistence

### PostgreSQL

PostgreSQL is an open-source relational database: tables, indexes, transactions, JSONB, and
extensions.

**Why here:** **Single datastore** for metadata, knowledge base, vectors, graph edges, job
queue, and audit log.

**How used:** Schema via `db/migrations/`; Node uses postgres.js; Python uses SQLAlchemy.

**Learn:** SQL CRUD, joins, indexes, foreign keys, `timestamptz` (UTC), JSONB, enums, and
connection strings (`DATABASE_URL`).

---

### pgvector

pgvector adds vector similarity search to PostgreSQL (embeddings for semantic code retrieval).

**Why here:** Store code chunk embeddings and run nearest-neighbor search without a separate
vector database.

**How used:** `code_chunks.embedding vector(1024)` with HNSW index; `similarity_search()` in
`repositories/vector.py`; cosine distance.

**Learn:** Embeddings concept, vector dimensions, HNSW indexes, cosine vs L2 distance.

---

### SQL migrations

Migrations are versioned SQL files applied in order — never edit applied migrations.

**Why here:** Schema source of truth is `db/migrations/`; `docs/data-model.md` mirrors it.

**How used:** `-- migrate:up` / `-- migrate:down` blocks; Docker `migrate` service (dbmate); API
also applies copies from `apps/api/src/platform/migrations/` on startup.

**Learn:** Writing safe migrations, rollback strategy, and keeping docs in sync.

---

### Graph as adjacency tables

The code graph (`graph_nodes`, `graph_edges`) lives in Postgres; multi-hop traversal uses
**recursive CTEs**.

**Why here:** Cross-repo links (frontend → backend → IAM) without a dedicated graph database.

**How used:** `expand_graph_neighbors()` in `repositories/graph_queries.py`; populated by worker
`parse` jobs.

**Learn:** Adjacency list model, recursive CTEs, and graph traversal for call/import edges.

---

## 6. Indexing, parsing & AI

### tree-sitter

tree-sitter parses source code into concrete syntax trees incrementally — fast and error-tolerant.

**Why here:** Extract functions, classes, routes, imports from MEAN/MERN (JS/TS/TSX + templates)
at scale.

**How used:** `services/parsing/` — grammar registry, chunkers, entity extraction →
`graph_nodes` / `graph_edges` / `code_chunks`.

**Learn:** AST vs CST, tree-sitter queries, language grammars, and chunking strategies
(function-level, ~40–60 LOC windows).

---

### Repo sync (clone & diff)

Workers clone repos with deploy tokens and compute `git diff` against `last_indexed_sha` for
incremental indexing.

**How used:** `sync` job clones to filesystem; only changed files are re-parsed and re-embedded.

**Learn:** Shallow clone, branch tracking, commit SHAs, and excluding vendored/build directories.

---

### TEI (Text Embeddings Inference)

TEI serves open embedding models via HTTP — turns text chunks into vectors.

**Why here:** Self-hosted embeddings; private code never leaves the network.

**How used:** `services/embedding/` client → TEI → upsert vectors into pgvector.

**Learn:** Embedding model choice for code, batching, normalization, and matching
`EMBEDDING_DIMENSION` (1024) to the DB column width.

---

### vLLM & Ollama

vLLM serves large open-weight LLMs efficiently on GPU (production). Ollama simplifies local dev.

**Why here:** Grounded answers and distillation require an LLM; no commercial API.

**How used:** `services/llm/` provider abstraction; RAG assembly and distillation call vLLM; dev
uses Ollama.

**Learn:** OpenAI-compatible API shape, prompt templates, token limits, streaming completions,
and GPU memory basics.

---

### RAG (Retrieval-Augmented Generation)

RAG retrieves relevant context (code chunks + graph) before asking the LLM to answer — reducing
hallucinations.

**Why here:** Core product value: cited, codebase-grounded answers.

**How used:** `services/retrieval/` + `api/` — vector search, optional rerank, context
assembly, citation attachment, abstain when unsupported.

**Learn:** Chunking, retrieval metrics, context window budgeting, citation format, and abstain
/ “unknown” paths.

---

### Router (code vs product questions)

A classifier routes questions to code retrieval vs structured product knowledge (workflows,
permissions, data flows).

**How used:** `services/router/`; page-scoped context for end-user questions.

**Learn:** Intent classification, few-shot prompts, and separate retrieval paths.

---

### Distillation

LLM walks the graph from entrypoints to derive workflows, page maps, permission rules, and data
flows — each with confidence + citations.

**How used:** `services/distill/` + worker `distill` jobs.

**Learn:** Structured extraction prompts, confidence scoring, stale artifact recomputation.

---

### Expert-in-the-loop

Low-confidence facts become `expert_questions`; expert answers override LLM-inferred knowledge.

**How used:** `services/experts/`, `apps/web` expert-queue feature, API questions module.

**Learn:** Human-in-the-loop UX, authoritative overrides, and trust models.

---

## 7. DevOps & runtime

### Docker

Docker packages each service as an image with its dependencies.

**Why here:** Reproducible dev and on-prem deployment; Python/Node/Postgres versions pinned.

**How used:** Dockerfiles for `api`, `web`, `rag`, `worker`; `docker compose up` for local stack.

**Learn:** Dockerfile basics, layers, multi-stage builds, and `.dockerignore`.

---

### Docker Compose

Compose orchestrates multi-container apps on one or two machines.

**Why here:** Deployment topology: database machine + application/GPU machine.

**How used:** Root `docker-compose.yml` (dev); `deploy/db` and `deploy/app` for production.

**Learn:** Services, `depends_on`, healthchecks, volumes, env files, and container networking.

---

## 8. Target codebases (what CodeSage indexes)

Understanding the **domains** CodeSage parses helps you debug indexing and QA.

| Stack | Pieces | Why it matters |
|---|---|---|
| **MERN** | MongoDB, Express, React, Node | Default first-target repos; Express routes ↔ React fetch calls |
| **MEAN** | MongoDB, Express, Angular, Node | Angular templates, `HttpClient`, guards, `*ngIf` roles |
| **Languages** | JavaScript, TypeScript, TSX, HTML, CSS, SCSS | tree-sitter Layer A/B grammars |

Recognizing **routes, components, middleware, and API calls** helps when working on cross-repo
linking and distillation.

---

## 9. Suggested learning paths by role

### Frontend contributor (`apps/web`)

1. TypeScript → React → React Router → React Query  
2. Tailwind  
3. OpenAPI/generated types + `apiClient.ts`  
4. WebSockets (chat streaming)

### API contributor (`apps/api`)

1. Node event loop + async/await  
2. Fastify + JWT + RBAC  
3. PostgreSQL + postgres.js + migrations  
4. Job enqueue pattern  
5. WebSocket proxy

### Python / indexing contributor (`apps/rag`)

1. Python typing + Pydantic  
2. SQLAlchemy + pgvector  
3. tree-sitter + repo sync (clone/diff)  
4. TEI embeddings + vLLM/Ollama  
5. RAG pipeline + citations + abstain logic

### DevOps / infra

1. Docker + Compose + env configuration  
2. PostgreSQL + pgvector tuning + backups  
3. GPU box: vLLM + TEI

---

## 10. Related docs

| Doc | Use when |
|---|---|
| [`final-solution.md`](./final-solution.md) | Locked architecture and roadmap |
| [`architecture.md`](./architecture.md) | Component map and boundaries |
| [`data-model.md`](./data-model.md) | Tables and relationships |
| [`development-workflow.md`](./development-workflow.md) | Branching, Definition of Done |
| [`adr/README.md`](./adr/README.md) | Why each major decision was made |
| Root [`AGENTS.md`](../AGENTS.md) | Non-negotiable rules for all contributors |
