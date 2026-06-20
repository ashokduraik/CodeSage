# packages/py-core — TODO

Checklist organized by module (the algorithmic heart of the system). (Global sequencing:
`docs/final-solution.md` §12.)

## config
- [x] Settings + env loading (`database_url`, `repo_clone_dir`, `embedding_dimension`).
- [ ] Secret access + repo-token decryption (envelope encryption).

## db
- [x] SQLAlchemy models for migrated tables (identity, operations, indexing).
- [x] Repositories per table group (public surface in `py_core.db`).
- [x] pgvector similarity search + recursive-CTE graph expansion helpers.
- [ ] Models/repos for derived-knowledge + expert + conversation tables (when migrations land).

## parsing
- [ ] tree-sitter grammar registry (pluggable).
- [ ] Layer A: JS/TS/TSX (incl. JSX) parsing.
- [ ] Layer B: HTML/CSS/SCSS + Angular template microsyntax.
- [ ] AST-aware chunker (~function / 40–60 LOC windows).
- [ ] Entity extraction → graph nodes/edges + chunks.
- [ ] Language injections for mixed-language files.

## graph
- [ ] Build/upsert `graph_nodes` / `graph_edges`.
- [ ] Recursive-CTE traversals.
- [ ] Cross-repo edge support (scoped per project).

## embedding
- [ ] TEI client.
- [ ] Chunk → vector → pgvector (`halfvec`) upsert.
- [ ] Delete vectors for removed entities.

## llm
- [ ] Provider abstraction (vLLM prod / Ollama dev).
- [ ] Prompt templates (kept only here + `distill`).
- [ ] Token budgeting; small router model vs large answer model.

## retrieval
- [ ] Vector retrieval over `code_chunks`.
- [ ] Graph expansion.
- [ ] Optional cross-encoder reranker (TEI).
- [ ] Context assembly with citations.

## router
- [ ] Code-vs-product classifier.
- [ ] Page-scoped detection (uses current route).

## distill
- [ ] Workflow extractor.
- [ ] Page-map extractor.
- [ ] Permission-rule extractor (guards/middleware/RBAC/`*ngIf` role checks).
- [ ] Data-flow / freshness extractor.
- [ ] Confidence scoring + source citations on every artifact.
- [ ] Stale-artifact recomputation on incremental updates.

## experts
- [ ] Confidence thresholds + contradiction detection.
- [ ] Expert-question generation (attached to code location).
- [ ] Override merge (authoritative, survives re-index, no duplicates).

## Cross-cutting
- [ ] Colocated `test_*.py` per module.
- [ ] Lint + typecheck clean.
