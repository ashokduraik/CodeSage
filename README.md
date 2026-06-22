# CodeSage

> **Self-hosted, codebase-aware QA platform.** Connect your GitLab/GitHub repositories;
> CodeSage indexes them, keeps the index fresh, uses a self-hosted LLM to understand the system
> and derive its business/user workflows, and answers questions through chat — for **both
> developers** (code questions) **and end-users** (navigation, permissions, data-timing). When
> uncertain, it asks domain experts and folds their answers back as authoritative knowledge.

**Status:** **Phase 0 (Foundation) implemented.** The monorepo builds, contracts codegen runs,
PostgreSQL migrations apply, the Node `api` and Python `rag` services expose `/health`, the React
`web` app builds, and CI is defined. All workspaces ship with tests at **≥ 80% coverage**. Real
auth/CRUD and indexing land in later phases (see [`docs/final-solution.md`](./docs/final-solution.md) §12).

## Quickstart

Prerequisites: Node 20+ (24 recommended), Docker + Docker Compose. (Python tooling runs inside
containers; local Python is not required.)

```bash
npm install            # install JS workspace deps
npm run codegen        # generate types from contracts/
npm run typecheck      # typecheck all workspaces
npm test               # run all JS tests (≥ 80% coverage gate)
npm run build          # build web + api + shared-types

docker compose up -d --build   # start db + migrate + api + rag + web
# api   -> http://localhost:3000/health
# rag   -> http://localhost:8001/health
# web   -> http://localhost:8080
docker compose down            # stop the stack
```

Python tests run via `uv` inside the `apps/rag` container; see [`apps/rag/README.md`](./apps/rag/README.md).

## Documentation lives in [`docs/`](./docs/README.md)

Start there. The canonical specs:

- [`docs/requirement.md`](./docs/requirement.md) — what & why (requirements).
- [`docs/intermediate-solution.md`](./docs/intermediate-solution.md) — options & trade-offs.
- [`docs/final-solution.md`](./docs/final-solution.md) — the locked technical solution.
- [`docs/architecture.md`](./docs/architecture.md) — implementation-facing architecture map.
- [`docs/data-model.md`](./docs/data-model.md) — PostgreSQL schema reference.
- [`docs/development-workflow.md`](./docs/development-workflow.md) — how we build it.
- [`docs/adr/`](./docs/adr/README.md) — Architecture Decision Records.

## Repository layout (current scaffolding)

```
codesage/
├─ README.md                 # you are here (pointer + overview)
├─ AGENTS.md                 # repo-wide conventions & guardrails for humans + AI agents
├─ docs/                     # all documentation (specs, architecture, ADRs, workflow)
├─ apps/
│  ├─ web/                   # React + TypeScript frontend
│  ├─ api/                   # Node + TypeScript non-blocking APIs
│  └─ rag/                   # Python RAG / QA + background job consumers
├─ packages/
│  └─ shared-types/          # TS types generated from contracts/
├─ contracts/                # SINGLE SOURCE OF TRUTH for cross-service APIs (generated types)
├─ db/                       # migrations/ (schema source of truth) + seed/
├─ deploy/                   # Docker Compose: db/ (Machine 1) + app/ (Machine 2)
├─ scripts/                  # dev/ops scripts (codegen, backup, reindex-cli)
└─ .env.example              # documented env vars (never commit a real .env)
```

> All folders from [`docs/final-solution.md`](./docs/final-solution.md) §4 are now scaffolded
> with documentation and **placeholder skeletons only** — there is still **no implementation
> code**. Real contracts, migrations, compose files, and scripts are filled in during Phase 0.

## The one rule to remember

**Node never blocks on heavy work.** React → Node (non-blocking APIs) → Python (heavy/blocking
work), with **PostgreSQL as the single datastore**. See [`AGENTS.md`](./AGENTS.md) before
editing anything.

## Tech stack (all open source / self-hostable)

React + TS · Node + TS · Python · PostgreSQL + pgvector · tree-sitter · TEI embeddings ·
vLLM LLM · Postgres-backed job queue · Docker Compose (two machines).

> The **adopted dependencies** are open source (NFR-10). CodeSage's **own** source is licensed
> separately — see License below.

## License

CodeSage is licensed under the **[PolyForm Noncommercial License 1.0.0](./LICENSE.md)** —
noncommercial use is permitted; **commercial use requires a separate license**.

Copyright © 2026 Ashok Durai Kannan. For commercial licensing, contact **ashokduraik@gmail.com**.
