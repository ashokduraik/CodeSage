# ADR 0001 — Single Git monorepo with a contracts-first cross-language API

- **Status:** Accepted
- **Date:** 2026-06-13
- **Related:** `final-solution.md` §4

## Context

CodeSage spans three languages (React/TS, Node/TS, Python) that must interoperate but cannot
share code. The biggest risk in such a system is **API drift** between Node and Python, which
is hard to catch and painful to debug. We also want the codebase to be easy for AI agents to
navigate, with predictable conventions and an unambiguous spec to read before editing.

## Decision

Use a **single Git monorepo** with strict module boundaries, and make `contracts/` the
**single source of truth** for all cross-service shapes:

- `openapi.node.yaml` (public Node API), `openapi.rag.yaml` (internal Python RAG API),
  `jobs.schema.json` (job-queue payloads).
- TS types and Python Pydantic models are **generated** from these contracts, never
  hand-written.

## Consequences

- One clone, one CI, atomic cross-language changes in a single PR.
- Node and Python stay in sync because both consume generated types.
- Requires a codegen step in the workflow (`scripts/` + `make codegen`).
- AI agents have a deterministic place to learn request/response shapes.

## Alternatives considered

- **Polyrepo (one repo per service):** independent versioning but high drift risk and painful
  cross-cutting changes. Rejected for a small team building tightly-coupled services.
- **Hand-written types on each side:** guaranteed to drift. Rejected.

## Escape hatch

If the monorepo grows unwieldy, individual deployables can be split out later; the contracts
package can be published as a versioned artifact to preserve the generate-don't-handwrite rule.
