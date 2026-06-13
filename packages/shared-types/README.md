# packages/shared-types — Generated TypeScript Types

Shared, non-deployable TypeScript types **generated from [`contracts/`](../../docs/architecture.md)**.
Consumed by `apps/web` and `apps/api` so both speak exactly the same API/job shapes.

> **Status:** **Phase 0 wired** — `npm run codegen` generates `src/generated/*` from the
> `contracts/` skeletons; a CI drift check enforces they stay in sync. Types are empty until the
> contracts define real paths.

## The one rule

**These types are generated, never hand-written.** The source of truth is `contracts/`
(`openapi.node.yaml`, `openapi.rag.yaml`, `jobs.schema.json`). To change a type:

```
1. Edit the relevant file in contracts/
2. Run codegen (scripts/ codegen — to be added in Phase 0)
3. The regenerated types land here
4. Use them in apps/web and apps/api
```

Editing files in this package by hand will be **overwritten** by the next codegen run.

## Why this package exists

Node (TS) and Python don't share code, so API drift is the biggest integration risk (ADR 0001).
Generating one canonical TS type set from the contracts eliminates that drift on the JS side and
gives AI agents an unambiguous, machine-checked spec to code against.

## What it contains (once generated)

- Request/response types for the public Node API (`openapi.node.yaml`).
- Types relevant to the browser↔Node↔RAG flow as needed.
- Job payload types mirrored from `jobs.schema.json` (Python's Pydantic models are generated
  separately into `py-core`).

## Related docs

- [`PLAN.md`](./PLAN.md) · [`TODO.md`](./TODO.md) · [`AGENTS.md`](./AGENTS.md)
- Contract-first workflow: [`../../docs/development-workflow.md`](../../docs/development-workflow.md) §3
- Decision: [`../../docs/adr/0001-monorepo-and-contracts-first.md`](../../docs/adr/0001-monorepo-and-contracts-first.md)
