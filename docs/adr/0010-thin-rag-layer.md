# ADR 0010 — Thin custom RAG layer + LlamaIndex primitives

- **Status:** Accepted
- **Date:** 2026-06-13
- **Related:** `intermediate-solution.md` §3.9, `final-solution.md` §8

## Context

The QA path needs retrieval (hybrid symbol + keyword + vector, fused with RRF, then graph
expansion — ADR 0020), a **question router** (code vs product), context assembly, optional
reranking, and grounded answer generation with citations. The router and the
**expert-question loop** are core IP and must remain explicit and owned, not buried in a
framework.

## Decision

Build a **thin custom retrieval layer** (in `py-core/retrieval` + `py-core/router`), optionally
using **LlamaIndex** for index/retriever primitives. Keep the router and expert-question loop as
explicit, owned code.

## Consequences

- Full control over the core QA logic; minimal framework bloat; easy to reason about.
- More code to build/maintain than adopting a full framework end-to-end.
- Grounding + citation behavior is first-class and testable.

## Alternatives considered

- **LlamaIndex end-to-end:** strong abstractions but opinionated/heavy; would obscure core IP.
  Used only for primitives.
- **LangChain / LangGraph:** broad ecosystem (LangGraph good for agentic loops) but churny API
  and abstraction overhead. Rejected as the backbone.

## Escape hatch

Because retrieval and routing are isolated modules, we can adopt more of a framework later (or
swap primitives) without rewriting the QA contract.
