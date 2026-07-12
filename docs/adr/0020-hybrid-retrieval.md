# ADR 0020 — Hybrid retrieval (symbol + keyword + vector) with rank fusion

- **Status:** Accepted
- **Date:** 2026-07-12
- **Related:** ADR 0003 (single datastore), ADR 0004 (pgvector), ADR 0005 (Postgres graph),
  ADR 0007 (tree-sitter), ADR 0010 (thin RAG layer), [ADR 0021](./0021-retrieval-quality-pass.md)
  (dynamic weights, prune, hybrid confidence, reranker); `final-solution.md` §8, `apps/engine/README.md` §3

## Context

Phase 1 code retrieval uses a **single signal**: pgvector cosine similarity over
`code_chunks.embedding`, followed by graph expansion along `http_call` edges. In practice this
is not precise enough for developer questions. Observed on a real repo (question: *"how is EMI
calculated?"*): the 20 nearest chunks all clustered in a narrow, mediocre distance band
(`0.31–0.36`) spanning eight loosely-related pages. The correct file (`loan.utils.ts`) was
retrieved but ranked #3 and buried among 19 broad neighbours, so the LLM produced a generic
codebase survey instead of tracing the formula.

Pure vector search is weak exactly where developers are precise:

- **Exact identifiers** — `getMinEmi`, `doCalc`, a constant name, a route path, an error string.
  Embeddings blur `camelCase`/`snake_case` tokens and rarely rank an exact name first.
- **Named symbols** — "what does `LoanService.doCalc` do?" is a lookup, not a semantic search.

We want accuracy closer to tools like Cursor/Copilot, which combine multiple retrieval signals.
The **single-datastore rule (ADR 0003)** still holds: no new search engine (Elasticsearch,
Qdrant, etc.) in the MVP.

## Decision

Adopt **hybrid retrieval** in `services/retrieval/`. Every code question runs **three retrievers
in parallel over PostgreSQL**, then fuses their ranked lists:

1. **Vector search** — pgvector cosine over `code_chunks.embedding` (semantic intent; unchanged).
2. **Keyword / exact search** — **`pg_trgm`** trigram matching over `code_chunks.content` (and
   symbol text). Best for identifiers, literals, and substrings the user typed verbatim.
3. **Symbol search** — name lookup over the **existing** `graph_nodes` (function/class/method
   nodes) joined back to their `code_chunks` via `symbol_refs`. **No new table** (ADR 0005, 0007).

Results are combined with **Reciprocal Rank Fusion (RRF)** — a parameter-free method that sums
`1 / (k + rank)` across each retriever's ranked list. RRF needs **no extra model** and is robust
to the different score scales of cosine distance vs. trigram similarity vs. exact-symbol hits.

The rest of the pipeline is unchanged: the fused top results feed the **existing graph
expansion** (`http_call` edges), then the **confidence gate**, **context packing**, and the
**grounded LLM stream** with citations / abstain (NFR-7).

Fixed at decision time:

- **Always fuse** — all three retrievers run every query; there is **no hard intent router** that
  picks one. (A lightweight classifier that only *reweights* retrievers may be added later.)
- **Keyword mechanism = `pg_trgm`** (a stock PostgreSQL extension), not `tsvector` full-text.
  Trigrams suit code identifiers better than word-stemmed FTS.
- **Merge = RRF** now. An open-source **cross-encoder reranker** (e.g. `bge-reranker`) is
  **deferred** to a later ADR — RRF first, measure, then decide.
- **Stored chunk snapshots** are the context source; we do **not** re-read files from the worktree
  at query time. Freshness comes from re-indexing on push (Phase 3), keeping the datastore the
  single source of truth.
- **tree-sitter stays index-time only.** Symbol search reads symbols already persisted during
  parse; no parsing happens on the query path.

## Consequences

- **Higher precision** on identifier/symbol questions without changing the embedding model — exact
  hits are no longer drowned out by semantically-similar neighbours.
- **New schema/config (implementation follow-up):**
  - Enable the `pg_trgm` extension and add a **GIN trigram index** on `code_chunks.content`
    (and/or a symbol-name index) via a migration.
  - New retrieval settings: per-retriever candidate counts, the RRF `k` constant, and optional
    per-retriever weights (documented in `.env.example`, mirrored to `.env`).
- **More query-time work**, but all inside Postgres and bounded by each retriever's top-k; no new
  service or network hop. Vectors, trigrams, and the graph are joined transactionally (ADR 0004).
- **Backward compatible** — the `/engine/query` SSE contract, citations, metrics, and abstain
  behaviour are unchanged; only ranking quality improves.

## Alternatives considered

- **Keep vector-only + just tune `top_k` / `max_distance`:** cheapest, but does not fix the core
  weakness (exact identifiers ranking poorly). A stop-gap, not a solution.
- **`tsvector` full-text search** instead of `pg_trgm`: good for prose/comments, weaker on
  `camelCase`/`snake_case` identifiers and substrings. Rejected as the primary keyword signal
  (may be added later for comment/doc search).
- **Hard intent router** (classify → pick one retriever, as in the originally sketched diagram):
  brittle — a misclassification loses the right signal entirely. Always-fuse is more robust and is
  what production code assistants do.
- **Cross-encoder reranker now:** highest accuracy but adds an open-source model + latency +
  serving concerns. Deferred behind RRF until we measure the fusion baseline.
- **Dedicated search engine (Qdrant hybrid, Elasticsearch/BM25):** violates the single-datastore
  rule (ADR 0003); Postgres `pg_trgm` covers the need at MVP scale.

## Escape hatch

Retrieval stays isolated behind `services/retrieval/` (ADR 0010), so we can, without changing the
QA contract: (a) add **dynamic RRF weights, post-fusion prune, hybrid confidence, and
cross-encoder reranker** per [ADR 0021](./0021-retrieval-quality-pass.md); (b) swap `pg_trgm`
for `tsvector`/BM25; or (c) migrate the vector leg to **Qdrant** (ADR 0004's escape hatch) if we
outgrow pgvector — while keeping symbol/keyword retrieval in Postgres.
