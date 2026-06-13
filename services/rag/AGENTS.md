# AGENTS.md — services/rag

Local rules for the RAG/QA service. Root [`/AGENTS.md`](../../AGENTS.md) also applies.

## The golden rule

**Stay thin.** This service wires HTTP endpoints to [`packages/py-core`](../../packages/py-core).
Business logic (router, retrieval, reranking, prompt assembly, grounding) lives in `py-core`, not
here. If you are writing that logic in this folder, move it.

## Do

- Wire `/rag/query` to the `py-core` pipeline: router → retrieval → assembly → grounding.
- **Stream** answers; always include **citations**.
- Implement the **abstain path**: if unsupported, return "not certain" and optionally raise an
  expert question — never hallucinate (NFR-7).
- Use generated Pydantic models from `contracts/openapi.rag.yaml`.

## Don't

- Don't implement retrieval/router/LLM logic here — that is `py-core`.
- Don't expose this service to the browser — only `apps/api` calls it.
- Don't do indexing/distillation here — that is `services/worker`.

## Before finishing

Service stays thin; citations + abstain path present; shapes generated; tests + lint clean; update
`TODO.md`/`README.md`. See `docs/development-workflow.md` §7.
