# apps/rag — CodeSage Python Backend

Single Python deployable for MVP. **All application code lives under `src/`**; project root holds
config, tests, and docs only.

> **Status:** **Phase 1 started** — `config/`, `models/`, and `repositories/` implemented with
> 100%-coverage tests; `api/` + `workers/` skeleton in place. Business modules land in `services/`.

Setup (deps, env, tests): root [`README.md`](../../README.md) — `npm run setup`, `npm run sync:python`,
`npm run test:python`.

## Configuration

Copy `.env.example` → `.env` and adjust values. Pydantic Settings reads from the environment (see `src/config/__init__.py`). Phase 0 `/health` does not require Postgres; repository tests use mocks — **pytest needs no running database**.

| Variable | Default | Used today | Purpose |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://codesage:change-me@localhost:5432/codesage` | yes | SQLAlchemy connection string. |
| `REPO_CLONE_DIR` | `/var/codesage/repos` | yes | Where `sync` jobs clone repositories (Phase 3+). |
| `EMBEDDING_DIMENSION` | `1024` | yes | pgvector column width; must match the TEI model. |
| `RAG_PORT` | `8001` | Docker only | Host port mapping in Compose (not read by app yet). |
| `WORKER_CONCURRENCY` | `2` | planned | Max parallel heavy jobs (Phase 3). |
| `VLLM_BASE_URL`, `VLLM_MODEL` | see `.env.example` | planned | LLM inference (Phase 1+). |
| `TEI_BASE_URL`, `TEI_EMBED_MODEL` | see `.env.example` | planned | Embeddings (Phase 1+). |

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
uv run uvicorn api.main:app --host 127.0.0.1 --port 8001 --reload
```

- **`--reload`** — restart on file changes (dev only).
- The app starts a **background worker thread** in the same process (see `api/main.py`); there
  is no separate worker binary in Phase 0.
- Health check: [http://127.0.0.1:8001/health](http://127.0.0.1:8001/health) →
  `{"status":"ok","service":"rag"}`.

Load env vars from `.env` automatically when using `uv run` (uv loads `.env` from the project
directory). To override inline:

```bash
DATABASE_URL=postgresql://codesage:change-me@localhost:5432/codesage \
  uv run uvicorn api.main:app --host 127.0.0.1 --port 8001
```

### Docker — RAG service only

From the **repository root** (build context is the monorepo root):

```bash
docker compose up -d --build rag
curl http://localhost:8001/health
```

Compose sets `DATABASE_URL` to the `db` service and waits for migrations to finish.

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

**100% line coverage** on: `api`, `config`, `models`, `repositories`, `workers`.

`services/` is **not** measured yet (placeholder only — add `--cov=services` in `pyproject.toml` when modules land).

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
live database for the current Phase 0/1 scaffold.

## Project layout

```
apps/rag/
├── src/                # ★ all Python code
│   ├── api/            # HTTP — FastAPI app, routes (thin)
│   ├── workers/        # Background jobs — Procrastinate consumer loop
│   ├── services/       # Business logic — parsing, retrieval, LLM, distill, …
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

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ModuleNotFoundError: No module named 'api'` | Run via `uv run …` from `apps/rag`, or set `PYTHONPATH=src`. |
| `uv: command not found` | Install [uv](https://docs.astral.sh/uv/) — see root [`README.md`](../../README.md). |
| Wrong Python version | `requires-python = ">=3.12"`. With uv: `uv python install 3.12 && uv sync --dev`. |
| Port 8001 in use | `uvicorn … --port 8002` or stop the other process. |
| Coverage failure | Run `uv run pytest` (no `--no-cov`); check `--cov-report=term-missing` output. Ensure `test_health.py` uses `with TestClient(…)` so lifespan is covered. |
| `uv.lock` missing | Run `uv lock` once, then commit the generated file. |

## Related docs

- [`PLAN.md`](./PLAN.md) · [`TODO.md`](./TODO.md) · [`AGENTS.md`](./AGENTS.md)
- Architecture: [`../../docs/architecture.md`](../../docs/architecture.md)
- Data model: [`../../docs/data-model.md`](../../docs/data-model.md)
- Dev workflow (Definition of Done): [`../../docs/development-workflow.md`](../../docs/development-workflow.md)
