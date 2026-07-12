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

- **Document every function and class** with a docstring: start with 2–4 plain-English
  sentences (purpose, when to call, domain context), then `@param` / `@returns` / `@raises`
  as full sentences. Add inline **why** comments (1–3 sentences each) on non-obvious
  control flow. See `.cursor/rules/python-docstrings-rag.mdc`.
- Keep **routes thin** in `src/api/`; **job handlers thin** in `src/workers/`.
- Put **all business logic** in `src/services/` (`sync`, `parse`, `embed`, `xrepo`, `retrieval`, `qa`, …).
- Use **repositories** for DB access; **models** for ORM shapes only.
- **Stream** QA answers with **citations**; implement abstain path (NFR-7).
- Jobs: **idempotent**, **incremental**, isolate per-file failures.
- Use generated Pydantic models from `contracts/`.
- **Indexing logs:** follow [`docs/rag-indexing-logs.md`](../../docs/rag-indexing-logs.md) — uniform `[RAG]` format via `log_event()`; start with `python -m api.run`.

## Don't

- Don't put code outside `src/` (except `tests/`).
- Don't put algorithms in `api/` or `workers/`.
- Don't expose HTTP to the browser — only `apps/api` calls this service.
- Don't commit secrets.
- Don't add standard tuning defaults to `.env.example` — they belong in `src/config/constants.py`
  (env-specific vars + feature toggles stay in `.env.example`). See `.cursor/rules/rag-config.mdc`.

## Before finishing

Layer boundaries respected; tests + lint clean; update `TODO.md`/`README.md`.
See `docs/development-workflow.md` §7.
