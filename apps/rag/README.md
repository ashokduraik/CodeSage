# apps/rag — CodeSage Python Backend

Single Python deployable for MVP. **All application code lives under `src/`**; project root holds
config, tests, and docs only.

> **Status:** **Phases 1–2 implemented in `services/`** — indexing pipeline (`sync` → `parse` →
> `embed` → `xrepo`), developer RAG with citations + abstain, and cross-repo graph linking.
> Layers `config/`, `models/`, `repositories/`, `api/`, and `workers/` are wired with ≥ 80%
> test coverage. Phases 3+ (webhooks, distillation, expert loop) are not started.

Setup (deps, env, tests): root [`README.md`](../../README.md) — `npm run setup`, `npm run sync:python`,
`npm run test:python`.

## Configuration

Copy `.env.example` → `.env` and adjust values. Pydantic Settings reads from the environment (see `src/config/__init__.py`). Phase 0 `/health` does not require Postgres; repository tests use mocks — **pytest needs no running database**.

| Variable | Default | Used today | Purpose |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://codesage:change-me@localhost:5432/codesage` | yes | SQLAlchemy connection string. |
| `REPO_CLONE_DIR` | `/var/codesage/repos` | yes | Where `sync` jobs clone repositories. |
| `EMBEDDING_DIMENSION` | `1024` | yes | pgvector column width; must match the TEI model. |
| `RAG_PORT` | `8001` | Docker only | Host port mapping in Compose (not read by app yet). |
| `WORKER_IDLE_SECONDS` | `10` | yes | Sleep between polls when the `jobs` queue is empty. |
| `LOG_LEVEL` | `info` | yes | Indexing log verbosity (`info` or `debug` for per-file detail). |
| `WORKER_POLL_SECONDS` | `2` | no | Reserved; consumer uses `WORKER_IDLE_SECONDS` today. |
| `WORKER_CONCURRENCY` | `2` | planned | Max parallel heavy jobs (Phase 3). |
| `VLLM_BASE_URL`, `VLLM_MODEL` | see `.env.example` | yes | LLM inference (excerpt fallback when unset). |
| `TEI_BASE_URL`, `TEI_EMBED_MODEL` | see `.env.example` | yes | Embeddings (deterministic dev fallback when unset). |
| `RETRIEVAL_TOP_K` | `8` | yes | Vector search result count. |
| `RETRIEVAL_MAX_DISTANCE` | `0.55` | yes | Abstain when best match exceeds this cosine distance. |
| `RETRIEVAL_GRAPH_ENABLED` | `true` | yes | Expand QA retrieval along cross-repo `http_call` edges. |
| `RETRIEVAL_GRAPH_MAX_DEPTH` | `2` | yes | Max graph hops from vector hit seeds. |
| `RETRIEVAL_GRAPH_MAX_EXTRA_CHUNKS` | `4` | yes | Max additional chunks added via graph expansion. |

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
