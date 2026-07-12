# Architecture Decision Records (ADRs)

Each ADR captures **one decision**: its context, the choice, consequences, alternatives
considered, and the escape hatch if we outgrow it. ADRs are immutable once `Accepted` — to
change a decision, add a new ADR that supersedes the old one.

All decisions below were **finalized** in [`../final-solution.md`](../final-solution.md) and
[`../intermediate-solution.md`](../intermediate-solution.md); these ADRs record the *why* in
durable form.

## Format

We use a lightweight template (see any file below): **Status · Context · Decision ·
Consequences · Alternatives considered · Escape hatch**.

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](./0001-monorepo-and-contracts-first.md) | Single Git monorepo with a contracts-first cross-language API | Accepted |
| [0002](./0002-node-python-split.md) | Split work between Node (non-blocking) and Python (heavy/blocking) | Accepted |
| [0003](./0003-postgresql-single-datastore.md) | PostgreSQL as the single datastore | Accepted |
| [0004](./0004-pgvector-for-vectors.md) | pgvector for semantic code retrieval | Accepted |
| [0005](./0005-postgres-graph-adjacency.md) | Postgres adjacency tables for the code graph | Accepted |
| [0006](./0006-postgres-job-queue.md) | Postgres-backed job queue (no broker) | Accepted |
| [0007](./0007-tree-sitter-parsing.md) | tree-sitter for AST parsing | Accepted |
| [0008](./0008-self-hosted-embeddings-tei.md) | Self-hosted code embeddings via TEI | Accepted |
| [0009](./0009-vllm-llm-inference.md) | Open-weight LLM via vLLM on a 1× 48 GB GPU | Accepted |
| [0010](./0010-thin-rag-layer.md) | Thin custom RAG layer + LlamaIndex primitives | Accepted |
| [0011](./0011-authjs-jwt-auth.md) | Auth.js / JWT for MVP (SSO deferred) | Accepted |
| [0012](./0012-docker-compose-deployment.md) | Docker Compose on two machines (Kubernetes deferred) | Accepted |
| [0013](./0013-launch-identity-compliance-scale.md) | Launch posture: identity (SSO), compliance, and user scale | Accepted |
| [0014](./0014-phase0-implementation-tooling.md) | Phase 0 implementation tooling | Accepted |
| [0015](./0015-single-python-deployable-mvp.md) | Single Python deployable for MVP (`apps/rag`) | Accepted |
| [0016](./0016-repo-probe-in-node-api.md) | Repo probe runs in Node API | Accepted |
| [0017](./0017-webhook-registration-on-connect.md) | Webhook registration during repo connect | Accepted |
| [0018](./0018-mandatory-audit-columns.md) | Mandatory audit columns on domain tables | Accepted |
| [0019](./0019-persist-chat-history-in-postgres.md) | Persist chat history in PostgreSQL (multi-turn + stop) | Accepted |
| [0020](./0020-hybrid-retrieval.md) | Hybrid retrieval (symbol + keyword + vector) with rank fusion | Accepted |
| [0021](./0021-retrieval-quality-pass.md) | Retrieval quality pass — dynamic weights, prune, hybrid confidence, reranker | Accepted |

## Adding a new ADR

1. Copy the structure of an existing ADR.
2. Number it sequentially (`NNNN-short-title.md`).
3. Set `Status: Proposed`, fill the sections, open a PR.
4. On merge, set `Status: Accepted` and add it to the index above.
