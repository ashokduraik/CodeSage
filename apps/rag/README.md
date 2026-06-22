# apps/rag — CodeSage Python Backend

Single Python deployable for MVP. **All application code lives under `src/`**; project root holds
config, tests, and docs only.

> **Status:** **Phase 1 started** — `config/`, `models/`, and `repositories/` implemented with
> 100%-coverage tests; `api/` + `workers/` skeleton in place. Business modules land in `services/`.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| **Python** | 3.12+ | Required for local dev and tests (`requires-python` in `pyproject.toml`). |
| **[uv](https://docs.astral.sh/uv/)** | latest | Installs deps and runs commands in an isolated env. |
| **Docker + Compose** | optional | Easiest way to run PostgreSQL + migrations + the full stack. Not required for unit tests. |

Install **uv** (pick one):

```powershell
# Windows (PowerShell)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Verify:

```bash
uv --version
python --version   # must be 3.12+
```

## Installation

All commands below assume you are in **`apps/rag`**:

```bash
cd apps/rag
```

### 1. Environment file

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

```bash
# macOS / Linux / Git Bash
cp .env.example .env
```

Edit `.env` if needed. Phase 0 `/health` does not require Postgres; repository tests use mocks — **pytest needs no running database**.

### 2. Python dependencies (uv — recommended)

Requires [uv](https://docs.astral.sh/uv/) installed (see Prerequisites).

```bash
uv lock          # creates/updates uv.lock — commit when it changes
uv sync --dev    # creates .venv/ and installs runtime + dev deps
```

`pyproject.toml` sets `pythonpath = ["src"]` for pytest and maps `src/*` to import names (`api`, `config`, `models`, …). Use **`uv run …`** for all commands — no manual `pip install -e .`.

### 2b. Python dependencies (venv — if uv is not installed)

Verified on Windows with system Python 3.12+:

```powershell
cd apps\rag
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install fastapi "uvicorn[standard]" procrastinate "psycopg[binary]" pydantic pydantic-settings sqlalchemy pgvector pytest pytest-cov httpx
$env:PYTHONPATH = "src"
```

Then use `pytest` and `uvicorn` from the activated venv (see Running / Testing). Prefer **uv** when available — it matches CI.

## Configuration

Copy `.env.example` → `.env` (see Installation §1) and adjust values. Pydantic Settings reads from the environment (see `src/config/__init__.py`).

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

```bash
cd apps/rag
uv run uvicorn api.main:app --host 127.0.0.1 --port 8001 --reload
```

```powershell
# venv fallback
$env:PYTHONPATH = "src"
uvicorn api.main:app --host 127.0.0.1 --port 8001 --reload
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

### Docker — full local stack

From the repository root:

```bash
docker compose up -d --build
# api -> http://localhost:3000/health
# rag -> http://localhost:8001/health
# web -> http://localhost:8080
docker compose down    # stop
```

See the root [`README.md`](../../README.md) for JS workspace setup (`npm install`, codegen, etc.).

## Testing

All tests live in `tests/` (outside `src/`). From `apps/rag`:

```bash
# with uv (matches CI)
uv run pytest
```

```powershell
# with venv fallback (PYTHONPATH must include src/)
$env:PYTHONPATH = "src"
pytest
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
# with uv
uv run pytest tests/test_health.py
uv run pytest -k test_health_ok
uv run pytest tests/db/
uv run pytest -v -s
uv run pytest --no-cov    # skip gate locally only
```

```powershell
# with venv
$env:PYTHONPATH = "src"; pytest tests/test_health.py
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
| `ModuleNotFoundError: No module named 'api'` | Run from `apps/rag` via `uv run …`, or set `PYTHONPATH=src` (PowerShell: `$env:PYTHONPATH = "src"`). |
| `uv: command not found` | Install uv (Prerequisites) **or** use the venv fallback in Installation §2b. |
| Wrong Python version | `requires-python = ">=3.12"`. With uv: `uv python install 3.12 && uv sync --dev`. |
| Port 8001 in use | `uvicorn … --port 8002` or stop the other process. |
| Coverage failure | Run `uv run pytest` (no `--no-cov`); check `--cov-report=term-missing` output. Ensure `test_health.py` uses `with TestClient(…)` so lifespan is covered. |
| `uv.lock` missing | Run `uv lock` once, then commit the generated file. |

## Related docs

- [`PLAN.md`](./PLAN.md) · [`TODO.md`](./TODO.md) · [`AGENTS.md`](./AGENTS.md)
- Architecture: [`../../docs/architecture.md`](../../docs/architecture.md)
- Data model: [`../../docs/data-model.md`](../../docs/data-model.md)
- Dev workflow (Definition of Done): [`../../docs/development-workflow.md`](../../docs/development-workflow.md)
