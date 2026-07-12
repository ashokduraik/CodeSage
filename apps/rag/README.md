# apps/rag — CodeSage Python Backend

Single Python deployable for MVP. **All application code lives under `src/`**; project root holds
config, tests, and docs only.

> **Status:** **Phases 1–2 implemented in `services/`** — indexing pipeline (`sync` → `parse` →
> `embed` → `xrepo`), developer RAG with citations + abstain, and cross-repo graph linking.
> Layers `config/`, `models/`, `repositories/`, `api/`, and `workers/` are wired with ≥ 80%
> test coverage. Phases 3+ (webhooks, distillation, expert loop) are not started.

Setup (deps, env, tests): root [`README.md`](../../README.md) — `npm run setup`, `npm run sync:python`,
`npm run test:python`.

## How it works (end to end)

CodeSage RAG runs in **two phases**: an offline **indexing** phase (when a repo is attached
or pushed) that turns source code into searchable vectors + a symbol graph, and an online
**query** phase (when a user asks a question) that retrieves the most relevant code and asks
an LLM to answer *only* from it.

```mermaid
flowchart TB
  subgraph INDEX["Indexing phase — background worker (jobs queue)"]
    direction TB
    A["Repo attached / pushed<br/>(Node enqueues sync job)"] --> S["1 · sync<br/>git clone/fetch<br/>list .ts/.js files"]
    S --> P["2 · parse<br/>tree-sitter → chunks + graph"]
    P --> E["3 · embed<br/>chunk text → vector"]
    P --> G[("graph_nodes /<br/>graph_edges")]
    E --> V[("code_chunks.embedding<br/>pgvector")]
    E -. "multi-repo" .-> X["xrepo · link<br/>http_call → route"]
  end

  subgraph QUERY["Query phase — POST /rag/query (SSE)"]
    direction TB
    Q["User question<br/>(via Node proxy)"] --> H{"hybrid retrieval<br/>(run in parallel)"}
    H --> SYM["symbol search<br/>graph_nodes / symbol_refs"]
    H --> KW["keyword search<br/>pg_trgm over content"]
    H --> VEC["vector search<br/>embed question → pgvector"]
    SYM --> RRF["merge + re-rank<br/>Reciprocal Rank Fusion"]
    KW --> RRF
    VEC --> RRF
    RRF --> GX["graph expand<br/>(cross-repo neighbors)"]
    GX --> PRUNE["prune or rerank<br/>(ADR 0021)"]
    PRUNE --> GATE{"hybrid confidence?<br/>(ADR 0021)"}
    GATE -- "no" --> AB["abstain<br/>(never guess)"]
    GATE -- "yes" --> PACK["pack context to window<br/>+ prior turns"]
    PACK --> LLM["LLM stream (vLLM/Ollama)<br/>answer ONLY from excerpts"]
    LLM --> SSE["SSE: citations →<br/>tokens → metrics → done"]
  end

  V -. "reads" .-> VEC
  G -. "reads" .-> SYM
  G -. "reads" .-> GX
```

> **Retrieval:** hybrid symbol + keyword (`pg_trgm`) + vector search fused with **intent-aware
> weighted RRF**, graph expansion, **heuristic prune or optional TEI cross-encoder rerank**, and
> **hybrid confidence** abstain ([ADR 0020](../../docs/adr/0020-hybrid-retrieval.md),
> [ADR 0021](../../docs/adr/0021-retrieval-quality-pass.md)).

### 1. Indexing — from repo to pgvector

The Node API never does heavy work; it enqueues a `sync` job in the `jobs` table. The RAG
worker thread (`workers/consumer.py`) runs three steps per repo:

| Step | Code | What happens |
|---|---|---|
| **1 · sync** | `services/sync/run_sync.py`, `git_ops.py` | Clone (first time) or fetch into `REPO_CLONE_DIR/<repo_id>/`, resolve the changed file list (`.ts/.tsx/.js/.jsx/.mjs/.cjs`). |
| **2 · parse** | `services/parsing/run_parse.py` | For each file: delete stale chunks, extract the **symbol graph** (`services/graph/extract.py`), then split the file into sections with `chunk_source(...)`. Each section is written to **`code_chunks`** (content + `span` + `symbol_refs`) **without a vector yet**, and an `embed` job is enqueued with the new chunk ids (batched). |
| **3 · embed** | `services/embedding/run_embed.py`, `tei_client.py` | `EmbeddingClient.embed_texts([chunk.content, …])` calls the OpenAI-compatible embeddings endpoint (Ollama/TEI) and writes each vector to **`code_chunks.embedding`** (pgvector). When every chunk for the repo has a vector, the project is marked `INDEXED`. |
| **xrepo** | `services/xrepo/run_xrepo.py` | Multi-repo projects only: match frontend `http_call` graph nodes to backend `route` nodes and write cross-repo edges. |

After step 3, the code is **searchable**: each chunk is a row in `code_chunks` with a 1024-dim
(default) embedding, scoped by `project_id`/`repo_id`.

### 2. Where tree-sitter comes in

tree-sitter is used **only during the `parse` step** — it never runs at query time. It does two
jobs (`services/parsing/tree_sitter_parser.py`):

1. **Smart chunk boundaries** (`chunker.py` → `chunk_source`). Instead of blindly splitting every
   N lines, tree-sitter parses the file to an AST and extracts top-level
   **function / class / method** spans (`extract_symbol_spans`). Each symbol becomes one chunk
   (large symbols are sub-split into 40–60 line windows), so a chunk is a *whole function* rather
   than an arbitrary slice — which embeds and retrieves with much better signal.
   - **Fallback:** unsupported extension, a syntax error (`root_node.has_error`), or no
     extractable symbols → plain fixed line-window chunking, so indexing always succeeds.
2. **The symbol graph** (`services/graph/extract.py`). The same AST symbols become `graph_nodes`
   (file/function/class), and API signals (route definitions, HTTP calls) become `graph_edges`.
   This graph powers cross-repo linking (`xrepo`) and query-time graph expansion.

Grammars are chosen per file extension (`tree_sitter_javascript` / `tree_sitter_typescript`) and
parsers are cached (`functools.lru_cache`).

### 3. Query — how an answer is produced

`POST /rag/query` (`api/routes/query.py` → `services/qa/stream_answer.py`) streams the answer as
Server-Sent Events. Order of operations:

1. **Title (optional)** — first message in a conversation emits a `title` chunk.
2. **Small-talk short-circuit** (`services/router/small_talk.py`) — greetings like "hi"/"thanks"
   get a friendly reply with **no retrieval** (avoids irrelevant citations).
3. **Audience gate** (`services/router/classify.py`) — Phase 1 only answers `developer` questions;
   `end_user` requests `abstain`.
4. **Retrieval** (`services/retrieval/search.py`) — **hybrid + quality pass**
   ([ADR 0020](../../docs/adr/0020-hybrid-retrieval.md), [ADR 0021](../../docs/adr/0021-retrieval-quality-pass.md)):
   - **Intent classification** — `query_intent.py` picks a weight profile (`symbol_lookup`,
     `conceptual`, `balanced`) from identifier and phrasing heuristics.
   - **Adaptive top-k** — per-leg candidate counts scale with indexed project size (small/medium/large).
   - **Vector search** — embed the **question**; `similarity_search` runs pgvector cosine distance.
   - **Keyword / exact search** — `pg_trgm` trigram match over `code_chunks.content`.
   - **Symbol search** — name lookup over `graph_nodes` joined back via `symbol_refs`.
   - **Merge + re-rank** — weighted **Reciprocal Rank Fusion (RRF)** by intent profile.
   - `augment_matches_with_graph` walks `http_call` edges from fused top hits.
   - **Prune or rerank** — default: heuristic prune to `RETRIEVAL_CONTEXT_TOP_K` (10). Optional:
     TEI `POST /rerank` on top 25 candidates when `RETRIEVAL_RERANKER_ENABLED=true`.
5. **Confidence gate** (`is_confident_match` + `hybrid_confidence.py`) — composite score
   (retrieval + graph connectivity + symbol exactness + citation coverage). Abstains when below
   `RETRIEVAL_MIN_CONFIDENCE` (NFR-7).
6. **Context packing** (`_pack_context`) — detect the model's context window, trim oldest
   conversation turns first when needed, then pack as many retrieved excerpts as fit (top hit
   always kept, truncated if necessary).
7. **Grounded generation** (`services/llm/vllm_client.py`, `prompts.py`) — build
   `[system, …history, user(question + code excerpts)]` and stream tokens from the
   OpenAI-compatible LLM. The system prompt forbids inventing anything not in the excerpts. If no
   LLM is configured or it errors, a deterministic **excerpt fallback** returns the top snippets.
8. **SSE frames** — the stream emits `citation` chunks (the exact files/spans used), then `token`
   chunks (the answer), then a `metrics` chunk (context tokens used vs. window, tokens/sec), then
   `done`. Node forwards these to the browser and persists the assistant message.

> **So "how does it respond?"** It never answers from the LLM's own memory — it retrieves the
> most relevant stored code chunks via hybrid symbol + keyword + vector fusion, optionally
> expands via the symbol graph, and asks the LLM to answer strictly from those excerpts (or
> abstains). Debugging tip: set `LOG_LEVEL=debug` to see the `QA retrieval` (fused ranks +
> retriever sources) and `QA prompt` (excerpts + tokens packed) lines for every query.

### Data it reads/writes

| Table | Written by | Read by |
|---|---|---|
| `code_chunks` (`+ embedding` pgvector, `+ pg_trgm` keyword) | parse (rows), embed (vectors) | hybrid vector + keyword + symbol retrieval |
| `graph_nodes` / `graph_edges` | parse | symbol search, xrepo linking, query graph expansion |
| `conversations` / `messages` | Node API (chat persistence) | multi-turn history for the prompt |
| `jobs` | Node (enqueue) + worker | worker claim loop |

## Configuration

Copy `.env.example` → `.env` and adjust values. Pydantic Settings reads from the environment (see `src/config/__init__.py`). Phase 0 `/health` does not require Postgres; repository tests use mocks — **pytest needs no running database**.

Config is split into two homes (see [`.cursor/rules/rag-config.mdc`](../../.cursor/rules/rag-config.mdc)):

- **`.env.example` / `.env`** — environment-specific values (connections, secrets, endpoints, model ids, ports), the cross-service `WORKER_STALE_JOB_SECONDS`, and per-deploy **feature toggles**. These are the only variables listed below.
- **[`src/config/constants.py`](src/config/constants.py)** — standard tuning defaults (retrieval weights, top-k, timeouts, worker timings, context-window sizing, sync limits). They rarely change per deployment, so they are not in `.env.example`. Each is still a `Settings` field, so you can override any of them via env if needed (e.g. `RETRIEVAL_VECTOR_TOP_K=20`, `RETRIEVAL_MIN_CONFIDENCE=0.55`) — they just aren't documented as env knobs.

### Environment variables (`.env.example`)

| Variable | Default | Used today | Purpose |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://codesage_dba:change-me@localhost:5432/codesage_db` | yes | SQLAlchemy connection string. |
| `RAG_PORT` | `8001` | Docker only | Host port mapping in Compose (not read by app yet). |
| `REPO_CLONE_DIR` | `/var/codesage/repos` | yes | Where `sync` jobs clone repositories. |
| `TOKEN_ENC_KEY` | *(empty)* | yes | base64 32-byte AES key; must match `apps/api`. |
| `WORKER_STALE_JOB_SECONDS` | `600` | yes | Cross-service: stale reclaim (RAG) + re-index throttle (API); must match root `.env`. |
| `LOG_LEVEL` | `info` | yes | Indexing log verbosity (`info` or `debug` for per-file detail). |
| `VLLM_BASE_URL`, `VLLM_MODEL` | see `.env.example` | yes | LLM inference via any OpenAI-compatible server (Ollama/vLLM); excerpt fallback when unset. |
| `EMBEDDING_DIMENSION` | `1024` | yes | pgvector column width; must match the embedding model's output dimension. |
| `TEI_BASE_URL`, `TEI_EMBED_MODEL` | see `.env.example` | yes | Embeddings via any OpenAI-compatible server (Ollama/TEI); deterministic dev fallback when unset. |
| `LLM_CONTEXT_DETECT_ENABLED` | `true` | yes | Toggle: auto-detect the model's context window (vLLM `max_model_len` / Ollama `/api/show`). |
| `RETRIEVAL_GRAPH_ENABLED` | `true` | yes | Toggle: expand QA retrieval along cross-repo `http_call` edges. |
| `FRESHNESS_POLL_ENABLED` | `true` | yes | Toggle: background `git ls-remote` poll when webhooks miss pushes. |
| `RETRIEVAL_RERANKER_ENABLED` | `false` | yes | Toggle: enable TEI cross-encoder rerank (M3.3). |
| `RETRIEVAL_RERANKER_BASE_URL` | *(empty)* | yes | TEI reranker base URL (e.g. `http://localhost:8081`); empty = disabled path. |

### Tuning defaults (`src/config/constants.py`)

Retrieval weights and top-k, RRF smoothing, hybrid-confidence weights, adaptive tiers, graph depth, reranker model/limits, worker timings (`WORKER_POLL_SECONDS`, `WORKER_IDLE_SECONDS`, `WORKER_MAX_JOB_ATTEMPTS`), timeouts (`*_TIMEOUT_SECONDS`), context-window sizing (`LLM_MAX_CONTEXT_TOKENS`, `LLM_COMPLETION_RESERVE_TOKENS`, `LLM_MAX_HISTORY_TURNS`), `FRESHNESS_POLL_INTERVAL_SECONDS`, and `SYNC_MAX_FILE_BYTES` all live in [`src/config/constants.py`](src/config/constants.py) with an inline purpose comment each. Edit that file to change a default; set the matching env var to override for a single deployment.

### Optional cross-encoder reranker (M3.3)

Reranking requires a **second TEI container** with a cross-encoder model — the embedding TEI
instance cannot serve both embedding and rerank models. Ollama does not expose `/rerank`.

With GPU Compose overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml --profile gpu up -d tei-rerank
```

Enable in `apps/rag/.env`:

```dotenv
RETRIEVAL_RERANKER_ENABLED=true
RETRIEVAL_RERANKER_BASE_URL=http://localhost:8081
```

When disabled or unreachable, retrieval falls back to M3.2 heuristic prune automatically.

### Local inference with Ollama (low-spec friendly)

Both the embedding and LLM clients speak the OpenAI API, so [Ollama](https://ollama.com) works
as a drop-in local backend — no code changes. This is the `.env.example` default. Pull small
models once, then point both `*_BASE_URL` at Ollama's OpenAI endpoint:

```bash
ollama pull qwen2.5:7b           # chat model (VLLM_MODEL); lighter option: llama3.2:1b
ollama pull mxbai-embed-large    # 1024-dim embeddings (TEI_EMBED_MODEL) — matches EMBEDDING_DIMENSION
```

```dotenv
VLLM_BASE_URL=http://localhost:11434/v1
VLLM_MODEL=qwen2.5:7b
TEI_BASE_URL=http://localhost:11434/v1
TEI_EMBED_MODEL=mxbai-embed-large
EMBEDDING_DIMENSION=1024
```

On boot the service probes both backends (`GET {base}/models`, non-fatal) and logs one line each:

```text
INFO   [RAG]  LLM backend ready — "qwen2.5:7b" available at localhost
INFO   [RAG]  Embedding backend ready — "mxbai-embed-large" available at localhost
```

If a backend is down or a model is not pulled, it logs a **warning** and keeps running on the
fallbacks (it never exits):

```text
WARNING [RAG]  LLM backend unreachable — cannot reach localhost: ... Is the model server (e.g. Ollama) running? Answers will use excerpt fallback.
WARNING [RAG]  Embedding model "mxbai-embed-large" not found at localhost — run: ollama pull mxbai-embed-large. Indexing and search will fail until the model is available.
```

Tune the probe timeout with `STARTUP_PROBE_TIMEOUT_SECONDS` (default `5`).

### Context window & answer metrics

Grounded answers pack as many retrieved code excerpts as fit the connected model's context
window instead of a fixed count. The window is auto-detected (vLLM `max_model_len`, then
Ollama `POST /api/show`), falling back to `LLM_MAX_CONTEXT_TOKENS` when detection is disabled
or unavailable. `LLM_COMPLETION_RESERVE_TOKENS` is held back for the answer, and excerpt sizes
are measured with `tiktoken` (`o200k_base` — model-agnostic and approximate, kept safe by the
reserve). `RETRIEVAL_TOP_K` sets how many candidates are retrieved for the packer to choose from.

On the grounded path the stream emits a `metrics` chunk (before `done`) with the context window
used vs max, chunks packed, total tokens, and tokens/sec. The chat UI renders these under each
assistant reply. Small-talk, abstain, and excerpt-fallback paths omit token/speed metrics.

Notes:

- **Dimension must match.** `mxbai-embed-large` outputs 1024 dims, matching the pgvector column.
  A different model (e.g. `nomic-embed-text` = 768, `all-minilm` = 384) requires changing
  `EMBEDDING_DIMENSION` **and** a migration for `code_chunks.embedding`.
- **Running in Docker?** Use `http://host.docker.internal:11434/v1` so the container reaches
  Ollama on your host.
- **Even lower spec?** Leave `TEI_*`/`VLLM_*` empty to use the built-in deterministic embedding
  fallback and excerpt-only answers (no model server needed).

For a local database matching the defaults, start Postgres from the repo root:

```bash
docker compose up -d db migrate
# DATABASE_URL in .env should point at localhost:5432 (see .env.example)
```

## Running

### Local dev server

From the repo root:

```bash
npm run dev:rag
```

Or from `apps/rag`:

```bash
uv run python -m api.run --reload --host 127.0.0.1 --port 8001
```

All stdout lines use one format: `TIMESTAMP  LEVEL  [RAG]  message` (uvicorn included).

- **`--reload`** — restart on file changes (dev only).
- The app starts a **background worker thread** in the same process (see `api/main.py`); there
  is no separate worker binary in Phase 0.
- Health check: [http://127.0.0.1:8001/health](http://127.0.0.1:8001/health) →
  `{"status":"ok","service":"rag"}`.

Load env vars from `.env` automatically when using `uv run` (uv loads `.env` from the project
directory). To override inline:

```bash
DATABASE_URL=postgresql://codesage:change-me@localhost:5432/codesage \
  uv run python -m api.run --host 127.0.0.1 --port 8001
```

### Docker — RAG service only

From the **repository root** (build context is the monorepo root):

```bash
docker compose up -d --build rag
curl http://localhost:8001/health
```

Compose sets `DATABASE_URL` to the `db` service and waits for migrations to finish.

## Worker & job queue

The RAG process is a single deployable: HTTP API and background worker run together.

| Topic | Detail |
|---|---|
| **Entry file** | `src/api/run.py` (dev) / `src/api/main.py` (app) — `npm run dev:rag` |
| **Worker start** | FastAPI `lifespan` in `create_app()` spawns a daemon thread → `workers/worker.py` → `workers/consumer.py`. |
| **Queue table** | `jobs` — not `repos`. Worker claims the oldest `job_status = 'pending'` row (`ORDER BY created_at`, `FOR UPDATE SKIP LOCKED`). |
| **How a repo is indexed** | API attach enqueues `sync` `{ repoId }` → worker runs `sync` → `parse` → `embed`. Multi-repo projects also enqueue `xrepo` when every repo finishes embedding. |
| **Poll frequency** | Processes jobs back-to-back while the queue has work. When empty, sleeps `WORKER_IDLE_SECONDS` (default **10 s**). |
| **Orphan reclaim** | On startup and before each claim, `reclaim_orphaned_running_jobs()` resets active `running` → `pending` (previous worker died). |
| **Stale reclaim** | `reclaim_stale_running_jobs()` after `WORKER_STALE_JOB_SECONDS` (default **600 s**) during normal operation. |
| **Failed jobs** | Never auto-requeued; startup logs them as history only. |
| **Manual re-index** | API returns **409** when active jobs for the repo are younger than `WORKER_STALE_JOB_SECONDS`; then cancels pending jobs and enqueues a fresh sync. |
| **Freshness poll** | Background thread runs `git ls-remote` every `FRESHNESS_POLL_INTERVAL_SECONDS` (default 900 s) on indexed repos; enqueues `cron_poll` sync when remote HEAD diverges. Set `FRESHNESS_POLL_ENABLED=false` to disable. |

Indexing pipeline (per file, then project-level linking):

1. **sync** — clone to `REPO_CLONE_DIR/<repo_id>/`, list indexable `.ts`/`.js` files.
2. **parse** — tree-sitter chunking → `code_chunks` + `graph_nodes` / `graph_edges` (symbols + HTTP/route API signals).
3. **embed** — write vectors to `code_chunks.embedding`; mark repo index-complete when all chunks embedded.
4. **xrepo** (multi-repo only) — match `http_call` nodes to `route` nodes across repos; write cross-repo edges.

Verify progress:

```sql
SELECT id, type, job_status, error_message, created_at
FROM jobs
WHERE payload->>'repoId' = '<repo_id>' OR payload->>'projectId' = '<project_id>'
ORDER BY created_at;
```

## Logging

Indexing logs use plain English and the unified `[RAG]` tag on **every** line
(application, indexing worker, and uvicorn). Watch them in the terminal running
`npm run dev:rag` or via `docker compose logs -f rag`.

Set `LOG_LEVEL=info` (default) for the three-step story; `LOG_LEVEL=debug` adds per-file
lines. Logs never contain tokens, passwords, or source code.

### The three steps

| Step | Job type | What you see |
|---|---|---|
| 1/3 | `sync` | Downloading the repository |
| 2/3 | `parse` | Reading and splitting source files into code sections |
| 3/3 | `embed` | Making code sections searchable |
| — | `xrepo` | Linking frontend API calls to backend routes (multi-repo projects) |

### Glossary

| Technical term | Plain meaning in logs |
|---|---|
| `sync` | Downloading repository |
| `parse` | Reading source files |
| `embed` | Making code searchable |
| `xrepo` | Linking repos in a project (cross-repo graph) |
| code section | A chunk of source used for search |
| commit | Short git revision id (7 characters) |
| symbols | Functions/classes found in a file |

### Example output

```
2026-07-04 17:03:00  INFO   [RAG]  Connected to PostgreSQL at localhost:5432/codesage_db
2026-07-04 17:03:00  INFO   [RAG]  Database schema ready — service users verified
2026-07-04 17:03:00  INFO   [RAG]  RAG service started — background indexing worker is running
2026-07-04 17:03:00  INFO   [RAG]  Worker ready — clone directory D:\codesage\repos, poll every 10s
2026-07-04 17:03:00  INFO   [RAG]  Job queue: 1 pending (1 sync) — processing now
2026-07-04 17:03:01  INFO   [RAG]  Job claimed — project "My App" / repo github.com/org/repo (branch main) — Step 1/3 downloading repository
2026-07-04 17:03:01  INFO   [RAG]  Step 1/3 started — downloading repository for project "My App" / repo github.com/org/repo (branch main)
2026-07-04 17:03:01  INFO   [RAG]  Cloning repository (first sync)
2026-07-04 17:03:15  INFO   [RAG]  Step 1/3 finished — repository download complete (commit a1b2c3d)
2026-07-04 17:03:15  INFO   [RAG]  Queued Step 2/3 — reading 42 files for project "My App" / repo github.com/org/repo (branch main)
2026-07-04 17:03:20  INFO   [RAG]  Step 2/3 progress — read 10 of 42 files (24%)
2026-07-04 17:04:02  INFO   [RAG]  Indexing complete — project "My App" is ready for code questions
```

Set `LOG_LEVEL=debug` for per-file lines. If you only see startup lines, check the `jobs` table
or attach a repo from the UI.

Implementation rules: [`.cursor/rules/rag-indexing-logs.mdc`](../../.cursor/rules/rag-indexing-logs.mdc)
and [`docs/rag-indexing-logs.md`](../../docs/rag-indexing-logs.md).

## Testing

All tests live in `tests/` (outside `src/`). From the repo root:

```bash
npm run test:python
```

Or from `apps/rag`:

```bash
uv run pytest
```

CI (`.github/workflows/ci.yml`): `uv lock && uv sync --dev && uv run pytest`.

### Coverage gate

**≥ 80% line + branch coverage** on: `api`, `config`, `models`, `repositories`, `services`, `workers`.

Omitted from coverage until later phases:

- `src/workers/queue.py`, `src/workers/worker.py`
- `src/api/__init__.py`, `src/workers/__init__.py`, `src/services/__init__.py`

### Useful pytest commands

```bash
uv run pytest tests/test_health.py
uv run pytest -k test_health_ok
uv run pytest tests/db/
uv run pytest -v -s
uv run pytest --no-cov    # skip gate locally only
```

### Test layout

```
tests/
├── test_config.py      # settings / env overrides
├── test_health.py      # FastAPI /health (TestClient)
├── test_jobs.py        # job type registry
└── db/                 # models, repos, session, pgvector, graph SQL
    ├── test_models.py
    ├── test_session.py
    ├── test_repositories_*.py
    └── …
```

Tests exercise the **public surface** of each layer; they do not require GPU, vLLM, TEI, or a
live database for unit tests (mocks and SQLite/in-memory patterns where applicable).

Phase plans: [`../../docs/plans/phase-1-mvp-code-qa.md`](../../docs/plans/phase-1-mvp-code-qa.md) ·
[`../../docs/plans/phase-2-multi-repo.md`](../../docs/plans/phase-2-multi-repo.md).

## Project layout

```
apps/rag/
├── src/                # ★ all Python code
│   ├── api/            # HTTP — FastAPI app, routes (thin)
│   ├── workers/        # Background jobs — Procrastinate consumer loop
│   ├── services/       # Business logic — parsing, graph, xrepo, retrieval, LLM, distill, …
│   ├── models/         # ORM — SQLAlchemy tables, enums
│   ├── repositories/   # Data access — repos, session, pgvector/graph queries
│   └── config/         # Settings and env
├── tests/              # pytest (outside src)
├── .env.example        # documented env vars (copy to .env)
├── pyproject.toml      # deps, pytest/coverage config, package mapping
├── uv.lock             # lockfile (generate with `uv lock`; commit when present)
└── Dockerfile          # production image (repo root build context)
```

## Layer rules

| Layer | Responsibility | Calls |
|---|---|---|
| `src/api/` | HTTP only — routes, streaming, no business rules | `services/` |
| `src/workers/` | Job dispatch only — no algorithms inline | `services/` |
| `src/services/` | Business logic — orchestrates repos + external clients | `repositories/`, `config/` |
| `src/repositories/` | Postgres/pgvector/graph data access | `models/` |
| `src/models/` | ORM definitions | — |
| `src/config/` | Settings, env, secrets | — |

**Dependency direction:** `api/` and `workers/` → `services/` → `repositories/` → `models/`.

Only **`apps/api`** (Node) should call this service over HTTP — not the browser directly.

## Repo indexing progress (`repo_indexing_events`)

The worker appends user-facing rows to `repo_indexing_events` for every indexing run (initial attach, manual re-index, webhook push). Each run is grouped by `run_id` (the sync job UUID) with step events for `sync` → `parse` → `embed` (`started`, `finished`, `failed`, `skipped`). Messages mirror `[RAG]` log wording; `failure_reason` uses `explain_failure()` for plain-English hints. Full history is retained. UI/API read path is planned — storage is live now.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `RAG startup configuration is incomplete` | Set `DATABASE_URL` and `REPO_CLONE_DIR` in `apps/rag/.env` (copy from `.env.example`). |
| `Cannot connect to PostgreSQL` | Run `docker compose up -d db migrate` from repo root; confirm `DATABASE_URL` host/port match. |
| Connects as wrong DB user (e.g. `codesage` not your user) | Ensure `apps/rag/.env` exists — RAG loads repo-root `.env` then `apps/rag/.env`. Restart after edits. |
| `DATABASE_URL looks malformed` | URL-encode `@` in passwords (`Test@123` → `Test%40123`). |
| `ModuleNotFoundError: No module named 'api'` | Run via `uv run …` from `apps/rag`, or set `PYTHONPATH=src`. |
| `uv: command not found` | Install [uv](https://docs.astral.sh/uv/) — see root [`README.md`](../../README.md). |
| Wrong Python version | `requires-python = ">=3.12"`. With uv: `uv python install 3.12 && uv sync --dev`. |
| Port 8001 in use | `uvicorn … --port 8002` or stop the other process. |
| Coverage failure | Run `uv run pytest` (no `--no-cov`); check `--cov-report=term-missing` output. Ensure `test_health.py` uses `with TestClient(…)` so lifespan is covered. |
| Only startup logs, no indexing activity | Check `jobs` table for `pending`/`failed` rows; attach a repo or retry sync in the UI; confirm API and RAG share the same `DATABASE_URL`; set writable `REPO_CLONE_DIR` on Windows (e.g. `D:\codesage\repos`). |
| Re-index returns 409 / duplicate indexing | Wait until active jobs are older than `WORKER_STALE_JOB_SECONDS` (default 10 min), or restart RAG to reclaim orphaned `running` jobs. Ensure API and RAG use the same `WORKER_STALE_JOB_SECONDS`. |
| `uv.lock` missing | Run `uv lock` once, then commit the generated file. |

## Related docs

- [`PLAN.md`](./PLAN.md) · [`TODO.md`](./TODO.md) · [`AGENTS.md`](./AGENTS.md)
- Architecture: [`../../docs/architecture.md`](../../docs/architecture.md)
- Data model: [`../../docs/data-model.md`](../../docs/data-model.md)
- Dev workflow (Definition of Done): [`../../docs/development-workflow.md`](../../docs/development-workflow.md)
