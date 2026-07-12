# packages/shared-types — TODO

Checklist. (Global sequencing: `docs/final-solution.md` §12 — this lands in Phase 0.)

## Setup
- [x] Choose OpenAPI/JSON-Schema → TS generator — **openapi-typescript** (`scripts/codegen.mjs`).
- [x] Add codegen script in `scripts/` + root one-liner — `npm run codegen` / `npm run codegen:check`.
- [x] Define a clean public surface (`index.ts`) — exports `NodeApi` and `EngineApi` namespaces.

## Generation targets
- [x] Generate from `contracts/openapi.node.yaml` (public Node API) → `src/generated/node.ts`.
- [x] Generate job payload types from `contracts/jobs.schema.json` → `src/generated/jobs.ts` (+ Python in `apps/engine/src/generated/`).
- [x] Include RAG-facing types from `openapi.engine.yaml` → `src/generated/engine.ts` (`EngineApi`); wired into consumers when chat proxy lands (Phase 1).

## Guardrails
- [x] CI check: regenerate and fail on diff (no drift) — `npm run codegen:check` in `.github/workflows/ci.yml`.
- [x] Document "edit contracts, not here" prominently — `README.md`, `AGENTS.md`, generated file headers.

## Consumers
- [x] `apps/web` imports from public surface only — `@codesage/shared-types` (`NodeApi`).
- [x] `apps/api` imports from public surface only — `@codesage/shared-types` (`NodeApi`).
