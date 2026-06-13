# services/rag — TODO

Checklist. The service stays thin; most logic items live in `py-core`'s TODO. (Global sequencing:
`docs/final-solution.md` §12.)

## Service skeleton
- [ ] HTTP server + config + health check.
- [ ] Streaming response plumbing (SSE/stream).
- [ ] Typed request/response from `contracts/openapi.rag.yaml`.

## QA endpoint
- [ ] `POST /rag/query` accepting question + audience + optional page context.
- [ ] Wire router (`py-core/router`): code vs product + page-scoped detection.
- [ ] Wire code path: pgvector retrieval + graph expansion (+ optional rerank).
- [ ] Wire product path: structured KB retrieval.
- [ ] Wire grounded answer assembly (`py-core/llm`) with citations, streamed.
- [ ] Grounding check + "not certain" abstain path.
- [ ] Optionally raise an expert question on unsupported answers.

## Observability
- [ ] Query logs.
- [ ] Latency + token/cost metrics.

## Cross-cutting
- [ ] Pipeline-wiring tests.
- [ ] Lint + typecheck clean.
