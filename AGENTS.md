# AGENTS.md — Repo-wide conventions & guardrails

This file orients **AI agents and humans** before any change. Each subfolder may have its own
`AGENTS.md` that adds local rules; this root file always applies.

## What CodeSage is

A self-hosted, codebase-aware QA platform. See [`docs/README.md`](./docs/README.md) and
[`docs/architecture.md`](./docs/architecture.md). Read those before non-trivial work.

## Non-negotiable boundaries

1. **Node never blocks on heavy work.** `apps/api` (Node) does auth, CRUD, static serving,
   WebSocket streaming, webhook intake, and **job enqueue**. All heavy/blocking work (sync,
   parse, embed, graph, distill, retrieve, QA) is **Python** in `apps/rag` (layered: `api/`, `services/`, …).
2. **Business logic lives in `apps/rag/src/services/`.** `src/api/` and `src/workers/` are **thin** I/O only.
3. **Contracts are the single source of truth.** Cross-service shapes live in `contracts/`
   and types are **generated**, never hand-written. Edit contract → run codegen → implement
   against generated types. Never guess request/response shapes.
4. **One concern, one place.** DB schema → `db/migrations/`. API shapes → `contracts/`.
   Prompts → `apps/rag/src/services/llm` + `apps/rag/src/services/distill`. Persistence reference → `docs/data-model.md` + `docs/schema/`.
5. **Single datastore = PostgreSQL.** No Redis, Qdrant, Neo4j, or separate broker in the MVP
   (see ADRs 0003–0006). If you think you need one, write an ADR first.

## Code style & structure

- **Small, single-purpose files** with descriptive names over large grab-bag files.
- **No deep cross-module imports.** Modules expose a public surface (`index.ts` / `__init__.py`);
  internals stay private. This is what makes large-codebase edits safe for an agent.
- **TypeScript everywhere on the JS side** (web + api); typed Python (type hints + Pydantic).
- **Tests colocated:** `*.test.ts` next to TS code, `test_*.py` next to Python code; cross-service
  tests in `tests/e2e/` (see [`tests/e2e/AGENTS.md`](./tests/e2e/AGENTS.md)).
- **Comments explain *why*, not *what*.** No narration comments.

## Trust & safety rules (product-critical)

- **Ground every answer** with citations; never ship a QA path that can hallucinate without an
  "unknown" fallback (NFR-7).
- Every derived-knowledge row carries **confidence + source citations**; expert answers are
  authoritative overrides.
- **Secrets never get committed.** Repo tokens are encrypted at rest. Use `.env.example` to
  document variables.

## Before you finish a change

Follow the **Definition of Done** in [`docs/development-workflow.md`](./docs/development-workflow.md)
§7. In short: respect the boundary, update contracts + codegen, keep `rag/` wiring thin, add
migration + update `docs/data-model.md` and `docs/schema/<table>.md` if schema changed, colocate tests, update the relevant
`README/TODO/PLAN`, write an ADR for new decisions, commit no secrets.

## Where to learn shapes & decisions

- API/job shapes → `contracts/` + `docs/architecture.md` §4.
- Data shapes → `docs/data-model.md` + `docs/schema/`.
- Phase sequencing & exit criteria → `docs/plans/phase-1-mvp-code-qa.md`, `docs/plans/phase-2-multi-repo.md`, … (see `docs/final-solution.md` §12).
- E2E journeys & env → [`tests/e2e/workflows.md`](./tests/e2e/workflows.md), [`tests/e2e/README.md`](./tests/e2e/README.md).
- *Why* something is the way it is → `docs/adr/`.
