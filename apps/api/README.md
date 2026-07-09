# apps/api — CodeSage Node API

Node.js + TypeScript service for all **non-blocking** APIs. It is the public boundary between the
browser and the system. It **never blocks on heavy work** — it enqueues jobs or proxies to the
Python RAG service.

> **Status:** **Phase 0 skeleton implemented** — Fastify app with `/health`, config, and
> ≥ 80%-coverage tests. The modules below (auth, users, projects, …) are the plan for later phases.

## Responsibilities

- **Auth & RBAC** — Auth.js / JWT; roles: admin, expert, developer, end_user (ADR 0011).
- **CRUD** — users, projects, repos (smart connect flow, AES-256-GCM token encryption, webhook registration).
- **Static serving** — serve the React bundle from `apps/web`.
- **WebSocket gateway** — stream QA answers (proxied from `apps/rag`).
- **Webhooks** — receive provider push events → **enqueue** a re-index job.
- **Job enqueue** — write job rows to Postgres for Python workers to consume.
- **Read derived knowledge** — expose workflows / pages / permissions / questions to the UI.

## Boundaries (what this app does NOT do)

- **No heavy/blocking work.** No parsing, embedding, graph building, distillation, or retrieval.
  Those are Python (`apps/rag`, layered — logic in `services/`).
- For QA, it **proxies** to the Python RAG service and streams the result; it does not run RAG.
- API and job shapes come from `contracts/` (generated types via `packages/shared-types`).

## Tech

- Node.js + TypeScript, **module-per-domain** structure, REST + WebSocket.
- PostgreSQL client (shared single datastore); job enqueue via the Postgres queue (ADR 0006).

## Planned structure (per `docs/final-solution.md` §4.3)

```
api/src/
├─ modules/          # each = routes + service + repository + tests; no cross-imports of internals
│  ├─ auth/          # Auth.js / JWT, RBAC
│  ├─ users/
│  ├─ projects/
│  ├─ repos/         # attach repo, token encryption, branch config
│  ├─ chat/          # WS gateway → proxies to apps/rag (streams)
│  ├─ knowledge/     # read workflows / pages / permissions / data-flows
│  ├─ questions/     # expert queue read + answer
│  └─ webhooks/      # provider push → enqueue re-index job
├─ platform/         # db client, queue (enqueue), config, logging, error handling
└─ http/             # server bootstrap, middleware, OpenAPI wiring
```

## API surface (high level, see `docs/final-solution.md` §9)

- `POST /auth/login`, `POST /users`
- `POST /projects`, `POST /projects/:id/repos`, `POST /repos/probe`
- `GET /projects/:id/workflows | pages | questions`
- `POST /projects/:id/questions/:qid/answer`
- `WS /chat` (proxied to Python RAG)
- `POST /webhooks/:provider`

## How to run

Stack: **Fastify + TypeScript**, build with **tsup**, dev with **tsx**, tests with **Vitest**
at ≥ 80% coverage. Phase 0 exposes `/health`.

```bash
npm install                 # from repo root (workspaces)
npm run dev -w @codesage/api    # tsx watch (http://localhost:3000/health)
npm run lint -w @codesage/api   # ESLint (Node/TS rules)
npm run build -w @codesage/api  # bundle -> apps/api/dist
npm run test -w @codesage/api   # tests + coverage
# or via Docker:
docker compose up -d --build api   # http://localhost:3000/health
```

## Webhooks (local development)

GitHub/GitLab must reach your CodeSage instance at `WEBHOOK_BASE_URL`. For local dev, expose the
API with a tunnel (e.g. ngrok, Cloudflare Tunnel) and set:

```bash
WEBHOOK_BASE_URL=https://your-tunnel.example.com
```

Push events hit `POST /api/webhooks/{provider}` (public route, no JWT). See
[`docs/plans/phase-3-freshness.md`](../../docs/plans/phase-3-freshness.md).

## Related docs

- [`PLAN.md`](./PLAN.md) · [`TODO.md`](./TODO.md) · [`AGENTS.md`](./AGENTS.md)
- Architecture: [`../../docs/architecture.md`](../../docs/architecture.md)
- Data model: [`../../docs/data-model.md`](../../docs/data-model.md) · [`../../docs/schema/`](../../docs/schema/README.md)
