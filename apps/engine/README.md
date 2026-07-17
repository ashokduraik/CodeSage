# apps/engine — CodeSage Python Backend

Single Python deployable for MVP. **All application code lives under `src/`**; project root holds
config, tests, and docs only.

> **Status:** **Phases 1–4 implemented in `services/`** — indexing pipeline (`sync` → `parse` →
> `embed` → `xrepo` → `distill`), developer agent QA with bounded tools, citations, confidence
> abstention and investigation playbooks, cross-repo graph linking, freshness (webhooks + cron
> poll), and derived product knowledge (workflows, pages, permissions, data flows). Layers
> `config/`, `models/`, `repositories/`, `api/`, and `workers/` are wired with ≥ 80% test coverage.
> Phases 5+ (expert loop, end-user product QA) are not started.

Setup (deps, env, tests): root [`README.md`](../../README.md) — `npm run setup`, `npm run sync:python`,
`npm run test:python`.

## How it works (end to end)

CodeSage runs in **two phases**: an offline **indexing** phase (when a repo is attached or pushed)
that turns source code into searchable vectors + a symbol graph, and an online **agent-QA**
phase. In the QA architecture, the LLM plans bounded retrieval calls while application
code owns confidence, iteration limits, citations, and abstention.

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

  subgraph QUERY["Agent QA — POST /engine/query (SSE)"]
    direction TB
    Q["User question<br/>(via Node proxy)"] --> PLAN["Planner LLM<br/>select retrieval tools"]
    PLAN --> TOOLS["search_symbols · search_code<br/>search_vectors · search_hybrid<br/>graph_expand · read_symbol · read_chunk<br/>read_chunks_for_path"]
    TOOLS --> POOL["Deduplicated evidence pool<br/>bounded hits + token caps"]
    POOL --> GATE{"Evidence confidence ≥ 0.8?"}
    GATE -- "no; iteration < 5" --> PLAN
    GATE -- "no; iteration = 5" --> AB["abstain<br/>(never guess)"]
    GATE -- "yes" --> PACK["pack evidence + prior turns<br/>to detected context window"]
    PACK --> LLM["Final LLM stream<br/>answer ONLY from evidence"]
    LLM --> SSE["SSE: tool events · citations ·<br/>tokens · metrics · done"]
  end

  V -. "reads" .-> TOOLS
  G -. "reads" .-> TOOLS
```

> **Status:** this architecture is implemented by
> [agent-QA plan 05](../../docs/plans/agent-qa/05-agent-loop-and-stream-replace.md).
> `stream_answer.py` handles title/audience routing and delegates developer questions to the
> confidence-gated loop in `services/qa/agent_loop.py`. Agent-QA
> [plan 06](../../docs/plans/agent-qa/06-legacy-retrieval-cleanup.md) removed the superseded
> fixed-pipeline modules.

### 1. Indexing — from repo to pgvector

The Node API never does heavy work; it enqueues a `sync` job in the `jobs` table. The RAG
worker thread (`workers/consumer.py`) runs three steps per repo:

| Step | Code | What happens |
|---|---|---|
| **1 · sync** | `services/sync/run_sync.py`, `git_ops.py` | Clone (first time) or fetch into `REPO_CLONE_DIR/<repo_id>/`, resolve the changed file list (`.ts/.tsx/.js/.jsx/.mjs/.cjs`). |
| **2 · parse** | `services/parsing/run_parse.py` | For each file: delete stale chunks, extract the **symbol graph** (`services/graph/extract.py`), then split the file into sections with `chunk_source(...)`. Each section is written to **`code_chunks`** (content + `span` + `symbol_refs`) **without a vector yet**, and an `embed` job is enqueued with the new chunk ids (batched). |
| **3 · embed** | `services/embedding/run_embed.py`, `tei_client.py` | `EmbeddingClient.embed_texts([chunk.content, …])` calls the OpenAI-compatible embeddings endpoint (Ollama/TEI) and writes each vector to **`code_chunks.embedding`** (pgvector). When every chunk for the repo has a vector, the project is marked `INDEXED`. |
| **xrepo** | `services/xrepo/run_xrepo.py` | Multi-repo projects only: match frontend `http_call` graph nodes to backend `route` nodes and write cross-repo edges ([ADR 0023](../../docs/adr/0023-cross-repo-linking.md)). |

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

`POST /engine/query` (`api/routes/query.py` → `services/qa/stream_answer.py`) streams the answer as
Server-Sent Events.

#### Agent loop (ADR 0026)

1. **Title and audience** — the first request may emit `title`; Phase 1 continues to abstain for
   `end_user` until product QA is implemented.
2. **Planner** — an OpenAI-compatible tool-calling LLM chooses one or more retrieval tools. It
   never receives SQL, embeddings, or pgvector internals.
3. **Tools** (`services/qa/tools.py`) — bounded wrappers execute symbol, keyword, vector, hybrid,
   graph, symbol-read, or chunk-read operations. `graph_expand` is always available and is bounded
   by depth/extra-chunk constants; there is no `RETRIEVAL_GRAPH_ENABLED` toggle.
4. **Evidence pool** — merge tool hits by chunk id, retain provenance, cap total chunks and excerpt
   tokens, and emit citations only for evidence actually returned in this request.
5. **Application-owned confidence** — after every tool round, code runs
   `compute_hybrid_confidence` over the strongest evidence. Confidence inputs include
   chunk `symbol_refs` and excerpt–term overlap (path/unscored hits get a keyword-like
   overlap signal at gate time — never a fake `path: 1.0` leg). The LLM does **not**
   self-report the score. At confidence **≥0.8**, proceed to generation; otherwise
   repeat, up to **5 iterations**.
6. **Abstain** — after iteration 5 below threshold, emit `abstain`; do not ask the model to fill
   missing facts. When the gate fails but evidence is already in the pool, the loop first
   **nudges the planner** with concrete anchors (top pool file paths, spans, chunk ids) to call one
   more tool instead of accepting an idle "done gathering" turn (plan 15). The abstain copy is
   honest about pool state: empty pool → "couldn't find enough evidence"; related code found but
   below threshold → "found related code … not strong enough to answer confidently" (citations were
   already streamed). Two idle no-tool turns with an empty pool abstain early rather than idling to
   the iteration cap.
7. **Grounded generation** — pack only the evidence pool plus trimmed history into the detected
   model context window. The final model answers only from that evidence.
8. **SSE** — events are `tool_start`, `tool_result`, `citation`, `token`, `metrics`, and
   terminal `done` / `abstain` / `error`.

Successful traces are promoted to project-scoped investigation playbooks
([ADR 0027](../../docs/adr/0027-qa-investigation-playbooks.md)). A playbook is only a retrieval
hint: every answer must run fresh tools and cite current indexed evidence.

#### Playbooks (ADR 0027)

`services/qa/playbooks.py` promotes successful investigation traces after a grounded answer
and injects similar playbooks into the planner system prompt on iteration 1. After each
successful embed batch, playbooks whose anchors reference re-indexed file paths are
soft-deleted (`invalidate_playbooks_for_files`). Hints and warm-start skip playbooks whose
anchors no longer exist in active `code_chunks` / `graph_nodes`.

**Promotion rules (all required):**

| Rule | Condition |
|---|---|
| L1 | `finalConfidence >= QA_AGENT_MIN_CONFIDENCE` (0.8) |
| L2 | Not abstain; at least one citation |
| L3 | Trace contains ≥1 retrieval tool call |
| L4 | Same `project_id` (never cross-project) |
| L5 | Only active rows (`status = 'A'`) |

Near-duplicate questions merge at `QA_PLAYBOOK_MERGE_SIMILARITY` (0.95). Active rows are
capped at `QA_PLAYBOOK_MAX_PER_PROJECT` (500). Learning is controlled by
`QA_PLAYBOOK_LEARNING_ENABLED` in `constants.py` only — **not** in `.env.example`.
`QA_PLAYBOOK_WARM_START_ENABLED` defaults to **`false`**: when enabled and the best hint
similarity ≥ `QA_PLAYBOOK_WARM_START_SIMILARITY` (0.92), iteration 1 can replay playbook
tools deterministically (no planner LLM); otherwise the planner runs as usual.

#### Current implementation

- `services/qa/agent_loop.py`, retrieval tools, xlarge adaptive top-k, and `QA_AGENT_*` settings
  implement the developer QA path.
- `services/qa/playbooks.py` — promote, similarity hints, invalidation, optional warm-start
  (ADR 0027 plans 11–12).
- Social turns enter the same planner loop and use the narrow no-tools exception from ADR 0026.
- Full sequence: [`docs/plans/agent-qa/`](../../docs/plans/agent-qa/README.md).

### Data it reads/writes

| Table | Written by | Read by |
|---|---|---|
| `code_chunks` (`+ embedding` pgvector, `+ pg_trgm` keyword) | parse (rows), embed (vectors) | hybrid vector + keyword + symbol retrieval |
| `graph_nodes` / `graph_edges` | parse | symbol search, xrepo linking, agent `graph_expand` tool |
| `conversations` / `messages` | Node API (chat persistence) | multi-turn history for the prompt |
| `qa_playbooks` | successful agent investigations (promote) | similar-question retrieval hints; never answer ground truth |
| `jobs` | Node (enqueue) + worker | worker claim loop |

## Configuration

Copy `.env.example` → `.env` and adjust values. Pydantic Settings reads from the environment (see `src/config/__init__.py`). Phase 0 `/health` does not require Postgres; repository tests use mocks — **pytest needs no running database**.

Config is split into two homes (see [`.cursor/rules/engine-config.mdc`](../../.cursor/rules/engine-config.mdc)):

- **`.env.example` / `.env`** — environment-specific values (connections, secrets, endpoints, model ids, ports), the cross-service `WORKER_STALE_JOB_SECONDS`, and per-deploy **feature toggles**. These are the only variables listed below.
- **[`src/config/constants.py`](src/config/constants.py)** — standard tuning defaults (retrieval weights, top-k, timeouts, worker timings, context-window sizing, sync limits). They rarely change per deployment, so they are not in `.env.example`. Each is still a `Settings` field, so you can override any of them via env if needed (for example, `RETRIEVAL_VECTOR_TOP_K=20`) — they just aren't documented as env knobs.

### Environment variables (`.env.example`)

| Variable | Default | Used today | Purpose |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://codesage_dba:change-me@localhost:5432/codesage_db` | yes | SQLAlchemy connection string. |
| `ENGINE_PORT` | `8001` | Docker only | Host port mapping in Compose (not read by app yet). |
| `REPO_CLONE_DIR` | `/var/codesage/repos` | yes | Where `sync` jobs clone repositories. |
| `TOKEN_ENC_KEY` | *(empty)* | yes | base64 32-byte AES key; must match `apps/api`. |
| `WORKER_STALE_JOB_SECONDS` | `600` | yes | Cross-service: stale reclaim (RAG) + re-index throttle (API); must match root `.env`. |
| `LOG_LEVEL` | `info` | yes | Indexing log verbosity (`info` or `debug` for per-file detail). |
| `VLLM_BASE_URL`, `VLLM_MODEL` | see `.env.example` | yes | LLM inference via any OpenAI-compatible server (Ollama/vLLM); excerpt fallback when unset. |
| `EMBEDDING_DIMENSION` | `1024` | yes | pgvector column width; must match the embedding model's output dimension. |
| `TEI_BASE_URL`, `TEI_EMBED_MODEL` | see `.env.example` | yes | Embeddings via any OpenAI-compatible server (Ollama/TEI); deterministic dev fallback when unset. |
| `LLM_CONTEXT_DETECT_ENABLED` | `true` | yes | Toggle: auto-detect the model's context window (vLLM `max_model_len` / Ollama `/api/show`). |
| `FRESHNESS_POLL_ENABLED` | `true` | yes | Toggle: background `git ls-remote` poll when webhooks miss pushes. |

### Tuning defaults (`src/config/constants.py`)

Retrieval weights and top-k, RRF smoothing, hybrid-confidence weights, adaptive tiers (including
**xlarge** at ≥100k chunks), graph depth/extra-chunk caps, worker timings, timeouts, context-window
sizing, freshness poll interval, sync limits, and **agent QA** knobs all live in
[`src/config/constants.py`](src/config/constants.py) with an inline purpose comment each. Edit that
file to change a default; set the matching env var to override for a single deployment.

#### Agent QA (`QA_AGENT_*`, ADR 0026)

The agent loop consumes these settings. Graph expand is always
available as a retrieval **tool** — there is no `RETRIEVAL_GRAPH_ENABLED` kill-switch; only
`RETRIEVAL_GRAPH_MAX_DEPTH` / `RETRIEVAL_GRAPH_MAX_EXTRA_CHUNKS` cap walks.

#### QA retrieval tools (`services/qa/tools.py`)

Planner-facing wrappers over existing repositories used by the agent loop.
Call `execute_tool(...)` or pass `tool_definitions_for_planner()` to the LLM tools parameter.

| Tool | Backend |
|---|---|
| `search_symbols` | `repositories.symbols.symbol_search` |
| `search_code` | `repositories.keyword.keyword_search` + `extract_search_terms` |
| `search_vectors` | `EmbeddingClient` + `repositories.vector.similarity_search` |
| `search_hybrid` | Three legs + intent-aware RRF; graph traversal is a separate tool |
| `graph_expand` | `expand_graph_neighbors` → overlapping chunks |
| `read_symbol` | `qualified_name` (`symbol` or `path::symbol`) → graph node → chunk |
| `read_chunk` | `CodeChunkRepository.get_by_id` (project + active guard) |
| `read_chunks_for_path` | `CodeChunkRepository.list_active_by_project_path` (exact/basename, span order); **windowed** for large files — pass `around_line` / `chunk_id` (or `start_line`) from a prior citation so the hit cap covers the relevant region (ADR 0026 §Tools token-cap intent; plan 14) |

**Query intent (hybrid RRF):** ``how is/does …`` and domain acronyms (EMI, JWT, …) classify as
**balanced** (symbol + keyword + vector) so implementation code is preferred over UI copy.
**Conceptual** (vector-heavy) is reserved for overview-style questions without domain identifiers.
Symbol search expands ALLCAPS acronyms to symbol names containing that substring (e.g. EMI →
``calculateEmi``).

| Constant | Default | Purpose |
|---|---|---|
| `QA_AGENT_MAX_ITERATIONS` | `5` | Max planner loops per question |
| `QA_AGENT_MIN_CONFIDENCE` | `0.8` | Evidence gate before final answer |
| `QA_AGENT_CONFIDENCE_TOP_N` | `10` | Pool matches scored for confidence |
| `QA_AGENT_EXCERPT_OVERLAP_FUSED_SCALE` | `0.05` | Path/unscored fused floor from excerpt overlap |
| `QA_AGENT_MAX_POOL_CHUNKS` | `20` | Evidence pool hard cap |
| `QA_AGENT_MAX_TOOL_HITS` | `8` | Max hits per tool response |
| `QA_AGENT_MAX_EXCERPT_TOKENS` | `512` | Per-hit excerpt token cap |
| `QA_AGENT_PLANNER_TIMEOUT_SECONDS` | `180` | Planner LLM timeout per iteration |
| `QA_AGENT_FINAL_TIMEOUT_SECONDS` | `300` | Final answer stream timeout |
| `RETRIEVAL_ADAPTIVE_XLARGE_MIN_CHUNKS` | `100000` | xlarge tier lower bound |
| `RETRIEVAL_VECTOR_TOP_K_XLARGE` | `20` | Vector leg top-k at xlarge |
| `RETRIEVAL_KEYWORD_TOP_K_XLARGE` | `12` | Keyword leg top-k at xlarge |
| `RETRIEVAL_SYMBOL_TOP_K_XLARGE` | `5` | Symbol leg top-k at xlarge |

#### QA playbooks (`QA_PLAYBOOK_*`, ADR 0027)

Tuning defaults in `constants.py` only (not listed in `.env.example`). Still env-overridable
in an emergency via `Settings`.

| Constant | Default | Purpose |
|---|---|---|
| `QA_PLAYBOOK_MAX_PER_PROJECT` | `500` | Hard cap on active playbooks per project |
| `QA_PLAYBOOK_MIN_SIMILARITY` | `0.85` | Cosine floor for planner hint retrieval |
| `QA_PLAYBOOK_MERGE_SIMILARITY` | `0.95` | Merge into existing playbook vs insert |
| `QA_PLAYBOOK_LEARNING_ENABLED` | `true` | Kill-switch for promote + hint lookup |
| `QA_PLAYBOOK_WARM_START_ENABLED` | `false` | Deterministic iteration-1 tool replay |
| `QA_PLAYBOOK_WARM_START_SIMILARITY` | `0.92` | Cosine floor to warm-start without planner |

### Local inference with Ollama (low-spec friendly)

Both the embedding and LLM clients speak the OpenAI API, so [Ollama](https://ollama.com) works
as a drop-in local backend — no code changes. This is the `.env.example` default. Pull small
models once, then point both `*_BASE_URL` at Ollama's OpenAI endpoint:

> The agent loop requires a model/backend combination that supports OpenAI-compatible tool calls.
> A startup capability probe reports support through `/health`; do not assume every Ollama model
> supports tools.

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
INFO   [ENGINE]  LLM backend ready — "qwen2.5:7b" available at localhost
INFO   [ENGINE]  Embedding backend ready — "mxbai-embed-large" available at localhost
```

It also probes **planner tool calling** (`POST {base}/chat/completions` with a minimal
`tools` schema). Pass → `plannerTools: ok` on `GET /health`; fail → warning +
`plannerTools: unsupported`. Agent QA (ADR 0026) requires a model that accepts OpenAI-compatible
tools / function calling.

**Tool-calling models (documented; production ids validated in plans 08/09):**

| Backend | Notes |
|---|---|
| Ollama OpenAI shim (`…/v1`) | Prefer models with tool support (e.g. `qwen2.5:*`, `llama3.1:*`, `llama3.2:*`). CI uses mocked HTTP — no live model id is asserted yet. |
| vLLM OpenAI API | Primary path: `tools` + `tool_choice: auto` on `/chat/completions`. |
| Ollama native `/api/chat` | Used for thinking models (e.g. Qwen3) so `think: false` is honoured; tools are still sent on that path when configured. |

If a backend is down or a model is not pulled, it logs a **warning** and keeps running on the
fallbacks (it never exits):

```text
WARNING [ENGINE]  LLM backend unreachable — cannot reach localhost: ... Is the model server (e.g. Ollama) running? Answers will use excerpt fallback.
WARNING [ENGINE]  Embedding model "mxbai-embed-large" not found at localhost — run: ollama pull mxbai-embed-large. Indexing and search will fail until the model is available.
```

Tune the probe timeout with `STARTUP_PROBE_TIMEOUT_SECONDS` (default `30`).

### Context window & answer metrics

The model context window is auto-detected (vLLM `max_model_len`, then Ollama
`POST /api/show`), falling back to `LLM_MAX_CONTEXT_TOKENS` when detection is disabled or
unavailable. `LLM_COMPLETION_RESERVE_TOKENS` is held back for the answer, and text sizes are
measured with `tiktoken` (`o200k_base` — model-agnostic and approximate, kept safe by the
reserve).

The agent loop accumulates a bounded evidence pool across tool rounds, then packs only that pool
plus trimmed history after the 0.8 confidence gate passes.

On the grounded path the stream emits a `metrics` chunk (before `done`) with the context window
used vs max, chunks packed, total tokens, tokens/sec, iteration count, evidence confidence, and
tool-call count. The chat UI renders answer metrics under each assistant reply. Abstain and
excerpt-fallback paths may omit token/speed metrics.

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
npm run dev:engine
```

Or from `apps/engine`:

```bash
uv run python -m api.run --reload --host 127.0.0.1 --port 8001
```

All stdout lines use one format: `TIMESTAMP  LEVEL  [ENGINE]  message` (uvicorn included).

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
docker compose up -d --build rag api
docker compose exec api curl http://rag:8001/health
```

Compose does **not** publish RAG to the host by default. Use `npm run dev:engine` on the host when
you need direct access for debugging.

Compose sets `DATABASE_URL` to the `db` service and waits for migrations to finish.

## Worker & job queue

The RAG process is a single deployable: HTTP API and background worker run together.

| Topic | Detail |
|---|---|
| **Entry file** | `src/api/run.py` (dev) / `src/api/main.py` (app) — `npm run dev:engine` |
| **Worker start** | FastAPI `lifespan` in `create_app()` spawns a daemon thread → `workers/worker.py` → `workers/consumer.py`. |
| **Queue table** | `jobs` — not `repos`. Worker claims the oldest `job_status = 'pending'` row (`ORDER BY created_at`, `FOR UPDATE SKIP LOCKED`). |
| **How a repo is indexed** | API attach enqueues `sync` `{ repoId }` → worker runs `sync` → `parse` → `embed`. Multi-repo projects also enqueue `xrepo` when every repo finishes embedding. |
| **Poll frequency** | Processes jobs back-to-back while the queue has work. When empty, sleeps `WORKER_IDLE_SECONDS` (default **10 s**). |
| **Orphan reclaim** | On worker startup only, `reclaim_orphaned_running_jobs()` resets orphaned `running` → `pending` (or `failed` when attempts exhausted). |
| **Stale reclaim** | `reclaim_stale_running_jobs()` after `WORKER_STALE_JOB_SECONDS` (default **600 s**) during normal operation. |
| **Failed jobs** | Never auto-requeued; startup logs them as history only. |
| **Manual re-index** | API returns **409** when active jobs for the repo are younger than `WORKER_STALE_JOB_SECONDS`; then cancels pending jobs and enqueues a fresh sync. |
| **Freshness poll** | Background thread runs `git ls-remote` every `FRESHNESS_POLL_INTERVAL_SECONDS` (default 1800 s) on indexed repos; enqueues `cron_poll` sync when remote HEAD diverges. Set `FRESHNESS_POLL_ENABLED=false` to disable. |

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

Indexing logs use plain English and the unified `[ENGINE]` tag on **every** line
(application, indexing worker, and uvicorn). Watch them in the terminal running
`npm run dev:engine` or via `docker compose logs -f engine`.

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
2026-07-04 17:03:00  INFO   [ENGINE]  Connected to PostgreSQL at localhost:5432/codesage_db
2026-07-04 17:03:00  INFO   [ENGINE]  Database schema ready — service users verified
2026-07-04 17:03:00  INFO   [ENGINE]  RAG service started — background indexing worker is running
2026-07-04 17:03:00  INFO   [ENGINE]  Worker ready — clone directory D:\codesage\repos, poll every 10s
2026-07-04 17:03:00  INFO   [ENGINE]  Job queue: 1 pending (1 sync) — processing now
2026-07-04 17:03:01  INFO   [ENGINE]  Job claimed — project "My App" / repo github.com/org/repo (branch main) — Step 1/3 downloading repository
2026-07-04 17:03:01  INFO   [ENGINE]  Step 1/3 started — downloading repository for project "My App" / repo github.com/org/repo (branch main)
2026-07-04 17:03:01  INFO   [ENGINE]  Cloning repository (first sync)
2026-07-04 17:03:15  INFO   [ENGINE]  Step 1/3 finished — repository download complete (commit a1b2c3d)
2026-07-04 17:03:15  INFO   [ENGINE]  Queued Step 2/3 — reading 42 files for project "My App" / repo github.com/org/repo (branch main)
2026-07-04 17:03:20  INFO   [ENGINE]  Step 2/3 progress — read 10 of 42 files (24%)
2026-07-04 17:04:02  INFO   [ENGINE]  Indexing complete — project "My App" is ready for code questions
```

Set `LOG_LEVEL=debug` for per-file lines. If you only see startup lines, check the `jobs` table
or attach a repo from the UI.

Implementation rules: [`.cursor/rules/engine-indexing-logs.mdc`](../../.cursor/rules/engine-indexing-logs.mdc)
and [`docs/engine-indexing-logs.md`](../../docs/engine-indexing-logs.md).

## Testing

All tests live in `tests/` (outside `src/`). From the repo root:

```bash
npm run test:python
```

Or from `apps/engine`:

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

### Agent QA golden matrix

`tests/services/test_agent_qa_golden.py` runs the ADR 0026 developer-QA regressions against the
committed fixture in `tests/fixtures/agent_qa_repo/`. CI scripts planner turns and retrieval
results, so these cases require neither PostgreSQL nor a live LLM:

| ID | Question / path | Required result |
|---|---|---|
| G1 | `what does getMinEmi do?` | Symbol search; cite `src/loan.utils.ts`; answer |
| G2 | `how is EMI calculated?` | Hybrid evidence; loan citation; **no abstain**; `evidenceConfidence >= 0.8` |
| G2b | hybrid → `read_chunks_for_path` near formula | Formula excerpt; answer; no abstain |
| G3 | `where is UserService defined?` | Symbol search; cite `user.service.ts` |
| G4 | `hello` | Social reply; no retrieval; no abstain |
| G5 | Unknown `quantum_flux_capacitor` | Exhaust iterations and abstain |
| G-neg | `emi-calculator.module.ts` + weak vector | Gate fails / abstain (UI noise) |
| G6 | `LoanService` rate-policy call | `graph_expand`; cross-repo backend citation |

Run the focused agent gate:

```bash
uv run pytest \
  -o addopts="" \
  --cov=services.qa \
  --cov=services.llm.vllm_client \
  --cov-branch \
  --cov-report=term-missing \
  --cov-fail-under=80 \
  tests/services/test_agent_loop.py \
  tests/services/test_qa_tools.py \
  tests/services/test_agent_qa_golden.py \
  tests/services/test_vllm_tool_calling.py
```

`AGENT_QA_LIVE_LLM=1` is reserved for the optional nightly/integration variant that replaces the
scripted planner with the configured tool-calling model. Do not enable it in the default unit
suite; live runs require the model services and a migrated PostgreSQL fixture database.

### Manual 5M LOC benchmark

Do not synthesize a million-row fixture in CI. On recommended hardware:

1. Index a representative project with at least 1M chunks, or a 100k-chunk sample suitable for
   documented extrapolation.
2. Send `how is EMI calculated?` (G2) to `POST /engine/query`.
3. Run the fixed 20-question benchmark sheet enough times to calculate p95 end-to-end and
   per-tool latency.
4. Record p95 latency, agent iterations, tool-call count, and abstain rate.
5. Add measured results to `docs/plans/agent-qa/benchmark-results.md` (create it only after a real
   benchmark run).

### Test layout

```
tests/
├── test_config.py      # settings / env overrides
├── test_health.py      # FastAPI /health (TestClient)
├── test_jobs.py        # job type registry
├── fixtures/           # deterministic source trees and seed helpers
├── services/           # agent QA, retrieval, LLM, and indexing service tests
└── db/                 # models, repos, session, pgvector, graph SQL
    ├── test_models.py
    ├── test_session.py
    ├── test_repositories_*.py
    └── …
```

Tests exercise the **public surface** of each layer; they do not require GPU, vLLM, TEI, or a
live database for unit tests (mocks and SQLite/in-memory patterns where applicable). FastAPI route
fixtures stub startup model probes and background loops; those behaviors have dedicated tests and
must not make each `TestClient` contact configured services.

Phase plans: [`../../docs/plans/phase-1-mvp-code-qa.md`](../../docs/plans/phase-1-mvp-code-qa.md) ·
[`../../docs/plans/phase-2-multi-repo.md`](../../docs/plans/phase-2-multi-repo.md).

## Project layout

```
apps/engine/
├── src/                # ★ all Python code
│   ├── api/            # HTTP — FastAPI app, routes (thin)
│   ├── workers/        # Background jobs — Postgres queue consumer loop
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

### Network boundary (deployment)

RAG is an **internal service**. In Docker Compose it is **not** published to the host; only
`apps/api` reaches it on the internal network via `ENGINE_BASE_URL=http://engine:8001`. Do not expose
port 8001 to the internet or LAN without an additional auth layer.

For local debugging outside Compose, run `npm run dev:engine` or `uv run python -m api.run` on the
host — that binds `127.0.0.1:8001` explicitly for development only.

## Repo indexing progress (`repo_indexing_events`)

The worker appends user-facing rows to `repo_indexing_events` for every indexing run (initial attach, manual re-index, webhook push). Each run is grouped by `run_id` (the sync job UUID) with step events for `sync` → `parse` → `embed` (`started`, `finished`, `failed`, `skipped`). Messages mirror `[ENGINE]` log wording; `failure_reason` uses `explain_failure()` for plain-English hints. Full history is retained. UI/API read path is planned — storage is live now.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `RAG startup configuration is incomplete` | Set `DATABASE_URL` and `REPO_CLONE_DIR` in `apps/engine/.env` (copy from `.env.example`). |
| `Cannot connect to PostgreSQL` | Run `docker compose up -d db migrate` from repo root; confirm `DATABASE_URL` host/port match. |
| Connects as wrong DB user (e.g. `codesage` not your user) | Ensure `apps/engine/.env` exists — RAG loads repo-root `.env` then `apps/engine/.env`. Restart after edits. |
| `DATABASE_URL looks malformed` | URL-encode `@` in passwords (`Test@123` → `Test%40123`). |
| `ModuleNotFoundError: No module named 'api'` | Run via `uv run …` from `apps/engine`, or set `PYTHONPATH=src`. |
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
