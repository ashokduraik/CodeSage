# packages/py-core — CodeSage Python Core

The **business-logic heart** of CodeSage. This shared, non-deployable Python library holds all
heavy/blocking logic. The deployables `services/rag` and `services/worker` stay **thin** and call
into here, which keeps logic testable without a server or a queue.

> **Status:** **Phase 0 skeleton implemented** — packaged with uv; the `config` module
> (settings) exists with 100%-coverage tests. The remaining modules in the map below are added
> in later phases.

## Why a shared core

- **One home for logic.** Both Python deployables need the same capabilities (DB access, LLM
  client, retrieval). Putting logic here avoids duplication and keeps services small.
- **Testable in isolation.** Logic can be unit-tested directly, no HTTP/queue needed.
- **Clean boundaries = safe AI edits.** Each module exposes a public surface (`__init__.py`);
  internals stay private, so large-codebase edits stay localized.

## Module map (per `docs/final-solution.md` §4.4)

| Module | Responsibility | Used by |
|---|---|---|
| `db/` | SQLAlchemy models + repositories (one module per table group). Single datastore access. | all |
| `parsing/` | tree-sitter: grammar registry, chunkers, entity extraction (JS/TS/TSX + HTML/CSS/Angular). | worker `parse` |
| `graph/` | Build/query `graph_nodes` & `graph_edges` (incl. cross-repo); recursive-CTE traversals. | worker `parse`/`xrepo`, rag |
| `embedding/` | TEI client; chunk → vector; pgvector (`halfvec`) upserts. | worker `embed`, rag |
| `llm/` | Provider abstraction (vLLM/Ollama), prompt templates, token budgeting. | rag, worker `distill` |
| `distill/` | Extractors for `workflows`, `page_map`, `permission_rules`, `data_flows` (w/ confidence + citations). | worker `distill` |
| `retrieval/` | Vector + graph retrieval, optional reranker, context assembly. | rag |
| `router/` | Code-vs-product question classifier + page-scoped detection. | rag |
| `experts/` | Confidence thresholds, expert-question generation, override merge. | worker, rag |
| `config/` | Settings, env, secrets access (incl. token decryption). | all |

## Boundaries

- **No HTTP server / no queue loop here** — those live in `services/rag` and `services/worker`.
- **Single datastore:** all persistence goes through `db/` (PostgreSQL + pgvector); no other
  data systems (ADR 0003–0006).
- **Prompts live only in `llm/` + `distill/`** — one place for prompt changes.

## Cross-cutting design notes

- **Provider abstraction for the LLM** (`llm/`) so the model/runtime can change without rewrites
  (ADR 0009). Same isolation for embeddings (`embedding/`, ADR 0008) and retrieval store
  (`retrieval/`, ADR 0004) so escape hatches stay cheap.
- **Generated Pydantic models** from `contracts/` are used for any cross-service payloads.

## Related docs

- [`PLAN.md`](./PLAN.md) · [`TODO.md`](./TODO.md) · [`AGENTS.md`](./AGENTS.md)
- Data model: [`../../docs/data-model.md`](../../docs/data-model.md)
- Architecture: [`../../docs/architecture.md`](../../docs/architecture.md)
