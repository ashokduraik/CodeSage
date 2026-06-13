# packages/py-core — Implementation Plan

How we will build the Python core so it stays **easy to maintain** and **AI-friendly**. No code
yet. This is the highest-leverage package — invest in clean boundaries here.

## Guiding notes (maintainability + AI-friendliness)

- **One module = one concern**, exposing a small public surface via `__init__.py`. No deep
  cross-module imports; depend on a module's public API only. This is what keeps AI edits safe at
  3M-LOC scale.
- **Isolate every external dependency** behind a module so escape hatches stay cheap: DB (`db`),
  vector store (`retrieval`/`embedding`), graph store (`graph`), LLM (`llm`), embeddings
  (`embedding`). Swapping pgvector→Qdrant or vLLM→TGI should touch one module.
- **Prompts live only in `llm/` + `distill/`.** One place to read/change prompt behavior.
- **Type hints everywhere**; Pydantic for cross-service payloads (generated from `contracts/`).
- **Pure functions where possible**; push I/O to the edges (`db`, clients) for easy testing.
- **Small files, descriptive names; colocated `test_*.py`.**

## Build order (by module, roughly dependency order)

1. **`config/`** — settings, env, secret access (token decryption). Everything depends on this.
2. **`db/`** — SQLAlchemy models + repositories per table group; the single datastore gateway.
3. **`parsing/`** — grammar registry (tree-sitter), chunkers, entity extraction (Layer A JS/TS,
   Layer B templates).
4. **`graph/`** — node/edge build + recursive-CTE queries; cross-repo edges.
5. **`embedding/`** — TEI client; chunk→vector; pgvector upserts.
6. **`llm/`** — provider abstraction (vLLM/Ollama), prompt templates, token budgeting.
7. **`retrieval/`** — vector + graph retrieval, reranker, context assembly.
8. **`router/`** — code-vs-product classifier + page-scoped detection.
9. **`distill/`** — workflow/page/permission/data-flow extractors with confidence + citations.
10. **`experts/`** — confidence thresholds, question generation, override merge.

## Maintainability rules specific to scale

- Re-indexing is **incremental** — modules must support upsert/delete of affected entities only.
- **Grounding + confidence are first-class** — `distill`/`retrieval`/`experts` always carry
  citations and confidence; never produce an artifact without them.
- New languages are added via the `parsing` grammar registry (NFR-8), not by forking logic.

## Definition of Done (per module)

- Public surface defined in `__init__.py`; no internal leakage.
- External deps isolated; escape hatch remains a single-module change.
- Type-hinted; `test_*.py` colocated and passing; lint/typecheck clean.
- `TODO.md`/`README.md` module entry updated.
