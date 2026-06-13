# services/rag — CodeSage RAG / QA Service

Python service that answers questions. It exposes an **internal** HTTP API that the Node API
calls (and streams back to the browser). It is a **thin** deployable: it wires HTTP endpoints to
business logic in [`packages/py-core`](../../packages/py-core/README.md).

> **Status:** **Phase 0 skeleton implemented** — FastAPI app with `/health` and ≥ 80%-coverage
> tests. The QA pipeline below is the plan for Phase 1+.

## Responsibilities

- Expose `POST /rag/query` — accept a question + audience + optional page context, run the QA
  pipeline, and **stream** a grounded answer with citations (SSE/stream).
- Orchestrate the QA pipeline by calling `py-core`: **router → retrieval → context assembly →
  LLM answer → grounding check**.

## Boundaries (what this service does NOT do)

- **No business logic of its own.** Routing, retrieval, reranking, prompt assembly, and grounding
  live in `py-core` (`router`, `retrieval`, `llm`). This service is wiring only.
- **Internal only** — it is called by `apps/api`, not by the browser directly.
- It does not do indexing/distillation — that is `services/worker`.

## The QA pipeline (see `docs/final-solution.md` §8)

1. **Router** (small fast model) classifies the question: **code** vs **product**, and whether
   it is **page-scoped**.
2. **Code** → vector retrieval over `code_chunks` + graph expansion; optional rerank.
   **Product** → structured retrieval from `workflows`/`page_map`/`permission_rules`/`data_flows`.
3. **Assemble** a grounded prompt; the larger model answers **with citations**.
4. **Grounding check** — if unsupported by retrieved context, respond "not certain" and optionally
   raise an `expert_question` instead of hallucinating.

## Tech

- Python; HTTP server (streams responses). Talks to PostgreSQL (retrieval) and the inference
  services (vLLM for generation, TEI for embeddings/rerank) via `py-core` clients.

## How to run

Stack: **FastAPI + uvicorn**, managed with **uv** (Python 3.12 in Docker), tests with **pytest**
at ≥ 80% coverage. Phase 0 exposes `/health`.

```bash
# Local (requires uv): from services/rag
uv sync --dev
uv run pytest                       # tests + coverage
uv run uvicorn rag.main:app --port 8001
# or via Docker (no local Python/uv needed):
docker compose up -d --build rag    # http://localhost:8001/health
```

## Related docs

- [`PLAN.md`](./PLAN.md) · [`TODO.md`](./TODO.md) · [`AGENTS.md`](./AGENTS.md)
- Core library: [`../../packages/py-core/README.md`](../../packages/py-core/README.md)
- Architecture: [`../../docs/architecture.md`](../../docs/architecture.md)
