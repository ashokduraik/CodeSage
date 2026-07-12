# contracts/ — Single source of truth for cross-service APIs

Node (TS) and Python don't share code, so the API/job **contract is the one thing that must not
drift** (ADR 0001). It is defined **once** here and types are **generated**, never hand-written.

> **Status:** Scaffolded with **placeholder skeletons**. The real shapes are defined during
> Phase 0 as endpoints/jobs are built. **No implementation code exists yet.**

## Files

| File | Defines | Generated into |
|---|---|---|
| `openapi.node.yaml` | Public Node REST/WS API (browser ↔ Node). | `packages/shared-types` (TS) |
| `openapi.engine.yaml` | Internal Python RAG API (Node ↔ RAG service). | `apps/engine` (Pydantic) + `shared-types` if used in TS |
| `jobs.schema.json` | Job-queue payloads (Node enqueues → Python consumes). | both TS + Pydantic |

## The workflow (mandatory)

```
1. Edit the relevant file here.
2. Run codegen  (scripts/codegen — added in Phase 0).
3. TS types → packages/shared-types ; Pydantic models → apps/engine/.
4. Implement against the generated types on both sides.
```

- **Never hand-write or hand-edit generated types** — they are overwritten on the next codegen.
- **Never guess a shape** elsewhere in the codebase — read it here.
- A CI check regenerates and **fails on drift** so the contract and generated code can't diverge.

See `docs/development-workflow.md` §3 and `.cursor/rules/contracts-first.mdc`.
