# AGENTS.md — packages/py-core

Local rules for the Python core. Root [`/AGENTS.md`](../../AGENTS.md) also applies. **This is
where business logic belongs** — services are thin, this is the heart.

## Do

- Keep **one module = one concern**, exposing a small public surface via `__init__.py`. Import
  other modules through their public API only — **no deep imports into internals**.
- **Isolate external dependencies** so escape hatches stay cheap: DB in `db`, LLM in `llm`,
  embeddings in `embedding`, vector/graph access in `retrieval`/`graph`. A swap (pgvector→Qdrant,
  vLLM→TGI) should touch one module.
- Keep **prompts only in `llm/` and `distill/`**.
- Always carry **confidence + citations** on derived artifacts; never produce one without them.
- Support **incremental** upsert/delete (re-indexing touches only affected entities).
- Type hints everywhere; Pydantic for cross-service payloads (from `contracts/`); colocated
  `test_*.py`.

## Don't

- Don't add an HTTP server or a queue loop here — those live in `services/rag` / `services/worker`.
- Don't introduce a new data system — single datastore is PostgreSQL (write an ADR first if you
  truly need one).
- Don't scatter prompts, DB queries, or LLM calls across unrelated modules.
- Don't reach into another module's internals.

## Module responsibilities (quick reference)

`config` · `db` · `parsing` · `graph` · `embedding` · `llm` · `retrieval` · `router` · `distill`
· `experts` — see [`README.md`](./README.md) for the full table.

## Before finishing

Public surface clean; deps isolated; confidence/citations preserved; tests + lint clean; update
`TODO.md`/`README.md`. See `docs/development-workflow.md` §7.
