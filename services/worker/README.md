# services/worker — CodeSage Workers

Python queue consumers that do the **heavy/blocking** indexing and understanding work. Like
`services/rag`, this is a **thin** deployable: it pulls jobs from the Postgres queue and delegates
to [`packages/py-core`](../../packages/py-core/README.md).

> **Status:** **Phase 0 skeleton implemented** — package layout, a job-type registry with
> ≥ 80%-coverage tests, and a worker entrypoint that stays alive. Real Procrastinate job
> consumption (the table below) lands in Phase 3.

## Responsibilities (job consumers)

| Job | What it does | py-core modules |
|---|---|---|
| `sync` | Decrypt token, clone/fetch repo to filesystem, compute changed files vs `last_indexed_sha`. | `db`, `config` |
| `parse` | tree-sitter parse changed files → extract `graph_nodes` / `graph_edges` + AST-aware chunks. | `parsing`, `graph` |
| `embed` | Embed chunks via TEI → upsert into `code_chunks` (pgvector, `halfvec`). | `embedding` |
| `xrepo` | Cross-repo link resolver: match frontend calls ↔ backend routes ↔ IAM; create cross-repo edges or expert questions. | `graph`, `experts` |
| `distill` | Walk graph from entrypoints → LLM derives workflows/pages/permissions/data-flows with citations + confidence; mark stale artifacts and re-derive. | `distill`, `llm`, `experts` |

## Boundaries (what this service does NOT do)

- **No business logic of its own** — all of it lives in `py-core`. This service is the queue
  consumer + job dispatch wiring.
- **No HTTP API** — it is triggered by jobs (enqueued by `apps/api` from webhooks/cron or repo
  attach). It does not serve QA — that is `services/rag`.

## Job processing model (see ADR 0006, `docs/final-solution.md` §6)

- Jobs are rows in Postgres, consumed with `SKIP LOCKED` (or Procrastinate).
- **Survivable + retried** per unit; **concurrency-capped** so background work doesn't starve
  interactive QA; partial failures isolated per file (NFR-6).
- Payload shapes come from `contracts/jobs.schema.json`.

## Indexing flows

- **Initial index:** `sync` → `parse` → `embed` → record `last_indexed_sha`; then `xrepo` +
  `distill`.
- **Incremental:** webhook/cron enqueues `sync` with new SHA → `git diff` → re-`parse`/`embed`
  changed files → mark touched derived artifacts stale → `distill` only those.

## How to run

Stack: **Procrastinate** (Postgres queue) + **uv** (Python 3.12 in Docker), tests with **pytest**
at ≥ 80% coverage. Phase 0 is a skeleton that stays alive but consumes no jobs yet (real
Procrastinate startup lands in Phase 3).

```bash
# Local (requires uv): from services/worker
uv sync --dev
uv run pytest                        # tests + coverage
# or via Docker:
docker compose up -d --build worker
```

## Related docs

- [`PLAN.md`](./PLAN.md) · [`TODO.md`](./TODO.md) · [`AGENTS.md`](./AGENTS.md)
- Core library: [`../../packages/py-core/README.md`](../../packages/py-core/README.md)
- Architecture: [`../../docs/architecture.md`](../../docs/architecture.md)
