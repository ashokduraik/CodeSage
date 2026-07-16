# AGENTS.md — apps/engine

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
- **Agent QA retrieval tools** live in one module: `src/services/qa/tools.py` (not
  `services/retrieval/tools.py` and not a `tools/` package). They wrap repositories; the
  planner gets `TOOL_DEFINITIONS` / `execute_tool` only.
- Use **repositories** for DB access; **models** for ORM shapes only.
- **Stream** QA answers with **citations**; implement abstain path (NFR-7).
- Register FastAPI **global exception handlers** (`api/error_handlers.py`) so unhandled
  route errors return `EngineErrorResponse`. Mid-stream query failures must yield an SSE
  `error` chunk (see `.cursor/rules/error-handling.mdc`).
- Jobs: **idempotent**, **incremental**, isolate per-file failures.
- Use generated Pydantic models from `contracts/`.
- **Indexing logs:** follow [`docs/engine-indexing-logs.md`](../../docs/engine-indexing-logs.md) — uniform `[ENGINE]` format via `log_event()`; start with `python -m api.run`.
- **Every new repo process or activity must write a user-facing indexing event.** Any new job
  type or step that acts on a repo (or a project's repos) must record `started` and a terminal
  `finished`/`skipped`/`failed` event via `IndexingProgressRecorder` so it appears in the repo
  Indexing Logs modal — not just the `[ENGINE]` console log. Project-level jobs (no `repoId`, e.g.
  `distill`) fan out one event per active repo. Add the new step to the `IndexingEventStep` enum in
  `contracts/openapi.node.yaml`, widen the `repo_indexing_events.step` DB check constraint, and give
  it a plain-language UI label (technical term in parentheses) in `apps/web`.

## Don't

- Don't put code outside `src/` (except `tests/`).
- Don't put algorithms in `api/` or `workers/`.
- Don't expose HTTP to the browser — only `apps/api` calls this service.
- Don't commit secrets.
- Don't add standard tuning defaults to `.env.example` — they belong in `src/config/constants.py`
  (env-specific vars + feature toggles stay in `.env.example`). See `.cursor/rules/engine-config.mdc`.

## Before finishing

Layer boundaries respected; tests + lint clean; update `TODO.md`/`README.md`.
See `docs/development-workflow.md` §7.
