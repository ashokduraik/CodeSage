# services/rag — Implementation Plan

How we will build the RAG service so it stays **easy to maintain** and **AI-friendly**. No code
yet.

## Guiding notes (maintainability + AI-friendliness)

- **Stay thin.** This deployable wires HTTP → `py-core`. If you are writing retrieval/router/LLM
  logic *here*, stop — it belongs in `py-core` where it is unit-testable without a server.
- **Explicit pipeline.** The router and grounding/expert-question loop are **core IP** and must be
  explicit, owned code (ADR 0010) — not hidden inside a framework.
- **Stream by default.** Answers stream token-by-token for low perceived latency (NFR-4).
- **Ground or abstain.** Every answer cites sources; unsupported questions return "not certain"
  and may raise an expert question (NFR-7). No ungrounded answers, ever.
- **Typed boundaries.** Request/response shapes come from `contracts/openapi.rag.yaml`
  (generated Pydantic models).

## Build order (independent of global phases)

1. **Service skeleton** — HTTP server, config, health check, streaming response plumbing.
2. **`/rag/query` endpoint** — accept question + audience + optional page context (typed).
3. **Wire the router** (`py-core/router`) — code vs product, page-scoped detection.
4. **Wire code retrieval** — `py-core/retrieval` (pgvector + graph expansion, optional rerank).
5. **Wire product retrieval** — structured KB (`workflows`/`page_map`/`permissions`/`data_flows`).
6. **Wire answer assembly** — `py-core/llm` grounded prompt + citations, streamed.
7. **Grounding check + abstain path** — "not certain" + optional expert-question creation.
8. **Observability** — query logs, latency + token/cost metrics (NFR-9).

## Definition of Done (rag-specific)

- No business logic in this service — only wiring to `py-core`.
- All answers carry citations; abstain path implemented.
- Shapes from `contracts/`; responses stream.
- Tests (pipeline wiring) passing; lint/typecheck clean; `TODO.md`/`README.md` updated.
