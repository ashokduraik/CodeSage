# AGENTS.md — apps/rag

Local rules for the layered Python backend. Root [`/AGENTS.md`](../../AGENTS.md) also applies.

## Layout

**All Python code lives under `src/`.** Project root holds `tests/`, `pyproject.toml`, docs only.
Do not add application modules outside `src/`.

## Layers (under `src/`)

```
src/api/  src/workers/     → thin I/O (HTTP, queue)
src/services/              → business logic (only place for algorithms)
src/repositories/          → data access
src/models/                → SQLAlchemy ORM
src/config/                → settings, env
```

**Dependency direction:** `api/` and `workers/` → `services/` → `repositories/` → `models/`.

## Do

- Keep **routes thin** in `src/api/`; **job handlers thin** in `src/workers/`.
- Put **all business logic** in `src/services/`.
- Use **repositories** for DB access; **models** for ORM shapes only.
- **Stream** QA answers with **citations**; implement abstain path (NFR-7).
- Jobs: **idempotent**, **incremental**, isolate per-file failures.
- Use generated Pydantic models from `contracts/`.

## Don't

- Don't put code outside `src/` (except `tests/`).
- Don't put algorithms in `api/` or `workers/`.
- Don't expose HTTP to the browser — only `apps/api` calls this service.
- Don't commit secrets.

## Before finishing

Layer boundaries respected; tests + lint clean; update `TODO.md`/`README.md`.
See `docs/development-workflow.md` §7.
