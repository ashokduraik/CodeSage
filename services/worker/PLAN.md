# services/worker — Implementation Plan

How we will build the workers so they stay **easy to maintain** and **AI-friendly**. No code yet.

## Guiding notes (maintainability + AI-friendliness)

- **Stay thin.** Workers pull jobs and call `py-core`. Parsing/embedding/graph/distillation logic
  lives in `py-core`, where it is unit-testable without a queue.
- **Idempotent jobs.** Re-running a job must be safe (upserts, not blind inserts) — workers crash
  and retry by design (NFR-6).
- **Isolate failures per unit.** One bad file must not fail the whole repo; record and continue.
- **Incremental over full.** Always diff vs `last_indexed_sha`; never full re-index on update.
- **Concurrency control.** Cap heavy/GPU jobs so interactive QA stays responsive; prioritize
  accordingly (ADR 0006).
- **Typed payloads** from `contracts/jobs.schema.json` (generated Pydantic models).

## Build order (by job type, independent of global phases)

1. **Worker runtime** — queue consumer loop (`SKIP LOCKED`/Procrastinate), job dispatch,
   retries/attempts, structured logging, graceful shutdown.
2. **`sync`** — token decrypt, clone/fetch, changed-file detection vs SHA.
3. **`parse`** — tree-sitter parse changed files → nodes/edges + AST-aware chunks (via `py-core`).
4. **`embed`** — TEI embedding → pgvector upsert; delete removed entities.
5. **`xrepo`** — cross-repo link resolver; confident edges vs low-confidence expert questions.
6. **`distill`** — entrypoint walk → LLM workflows/pages/permissions/data-flows w/ confidence +
   citations; stale-artifact re-derivation; expert-question creation below threshold.
7. **Observability** — job status, index health, per-job timing/cost (NFR-9).

## Definition of Done (worker-specific)

- Jobs are idempotent and retry-safe; per-file failures isolated.
- Updates are incremental (diff-based), not full re-index.
- Concurrency caps respected; payloads typed from `contracts/`.
- Logic delegated to `py-core`; tests passing; lint/typecheck clean; `TODO.md`/`README.md` updated.
