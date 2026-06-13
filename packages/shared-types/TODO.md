# packages/shared-types — TODO

Checklist. (Global sequencing: `docs/final-solution.md` §12 — this lands in Phase 0.)

## Setup
- [ ] Choose OpenAPI/JSON-Schema → TS generator.
- [ ] Add codegen script in `scripts/` + root one-liner (`make/just codegen`).
- [ ] Define a clean public surface (`index.ts`).

## Generation targets
- [ ] Generate from `contracts/openapi.node.yaml` (public Node API).
- [ ] Generate job payload types from `contracts/jobs.schema.json`.
- [ ] Include RAG-facing types needed by the chat flow (from `openapi.rag.yaml`) if used in TS.

## Guardrails
- [ ] CI check: regenerate and fail on diff (no drift).
- [ ] Document "edit contracts, not here" prominently (done in README/AGENTS).

## Consumers
- [ ] `apps/web` imports from public surface only.
- [ ] `apps/api` imports from public surface only.
