# services/worker — TODO

Checklist by job type. Workers stay thin; algorithmic items live in `py-core`'s TODO. (Global
sequencing: `docs/final-solution.md` §12.)

## Worker runtime
- [ ] Queue consumer loop (`SKIP LOCKED` / Procrastinate).
- [ ] Job dispatch + retries/attempts + locking.
- [ ] Structured logging + graceful shutdown.
- [ ] Concurrency caps (don't starve interactive QA).
- [ ] Typed payloads from `contracts/jobs.schema.json`.

## sync
- [ ] Decrypt token + clone/fetch repo to filesystem.
- [ ] Changed-file detection (`git diff` vs `last_indexed_sha`).
- [ ] Record `last_indexed_sha` after success.

## parse
- [ ] tree-sitter parse changed files (via `py-core/parsing`).
- [ ] Upsert `graph_nodes` / `graph_edges` (via `py-core/graph`).
- [ ] AST-aware chunking.
- [ ] Delete removed entities.

## embed
- [ ] Embed chunks via TEI (via `py-core/embedding`).
- [ ] Upsert into `code_chunks` (pgvector, `halfvec`).

## xrepo
- [ ] Match frontend calls ↔ backend routes ↔ IAM.
- [ ] Create confident cross-repo edges.
- [ ] Raise expert questions for low-confidence matches.

## distill
- [ ] Walk graph from entrypoints.
- [ ] LLM-derive workflows / page_map / permission_rules / data_flows w/ citations + confidence.
- [ ] Mark stale artifacts on change; re-derive only those.
- [ ] Raise expert questions below confidence threshold.

## Observability
- [ ] Job status + index health.
- [ ] Per-job timing / token-cost metrics.

## Cross-cutting
- [ ] Idempotency / retry-safety tests.
- [ ] Lint + typecheck clean.
