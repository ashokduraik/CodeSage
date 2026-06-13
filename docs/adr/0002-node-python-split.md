# ADR 0002 — Split work between Node (non-blocking) and Python (heavy/blocking)

- **Status:** Accepted
- **Date:** 2026-06-13
- **Related:** `requirement.md` §5, `intermediate-solution.md` §3.1, `final-solution.md` §3

## Context

The product requirement fixes the web stack: **React** frontend and **Node.js** for all
non-blocking APIs. The heavy work (repo sync, AST parsing, embedding, indexing, LLM
distillation, RAG/QA) is CPU/GPU-bound and long-running, and the richest libraries for it live
in the **Python** ecosystem.

## Decision

Split by **blocking profile**:

- **Node.js** handles fast request/response: static serving, auth/RBAC, user/project/repo
  CRUD, request validation, WebSocket streaming, webhook intake, **job enqueue**.
- **Python** handles all heavy/blocking work: sync, parse, embed, graph, cross-repo link,
  distill, route, retrieve, QA assembly.
- **Contract between them:** Node calls Python's internal RAG API for synchronous QA
  (streamed) and enqueues jobs (Postgres rows) for async indexing/distillation. **Node never
  blocks on heavy work.**

## Consequences

- Clear ownership; each side plays to its ecosystem's strengths.
- Two runtimes to build/test/deploy and a cross-language contract to maintain (see ADR 0001).
- Interactive latency stays low because heavy work is off the request path.

## Alternatives considered

- **All-Python or all-Node:** rejected — Node lacks the ML/parsing ecosystem; Python is a poor
  fit for the high-concurrency non-blocking API tier, and the web stack is fixed by requirement.

## Escape hatch

The boundary is enforced by the queue + internal API, so either side can be re-scaled or
re-implemented independently without changing the other.
