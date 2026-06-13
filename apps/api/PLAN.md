# apps/api — Implementation Plan

How we will build the Node API so it stays **easy to maintain** and **AI-friendly**. No code yet.

## Guiding notes (maintainability + AI-friendliness)

- **Module-per-domain.** Each module = `routes + service + repository + tests`, exposing a public
  surface only. No cross-imports of another module's internals.
- **Thin controllers, logic in services, data access in repositories.** Predictable layering an
  agent can rely on.
- **Generated types from `contracts/`.** Request/response and job payloads are generated, never
  hand-written. Validate inputs at the edge.
- **Never block.** Long work is enqueued (Postgres jobs) or proxied to `services/rag`. If a
  handler would do CPU/GPU work, that is a design error — move it to Python.
- **`platform/` holds cross-cutting concerns** (db client, queue enqueue, config, logging, error
  handling) so modules stay focused.
- **Small files, descriptive names; colocated `*.test.ts`.**

## Build order (by module, independent of global phases)

1. **Platform + http** — server bootstrap, middleware, config, logging, error handling, DB
   client, OpenAPI wiring, queue-enqueue helper.
2. **auth** — Auth.js/JWT, RBAC middleware, role model.
3. **users** — account CRUD.
4. **projects** — project CRUD.
5. **repos** — attach repo, **encrypt token at rest**, branch/role config; enqueue initial index.
6. **webhooks** — provider push intake → enqueue incremental re-index job.
7. **chat** — WebSocket gateway proxying to `services/rag`, streaming answers + citations.
8. **knowledge** — read endpoints for workflows/pages/permissions/data-flows.
9. **questions** — expert queue read + answer (writes authoritative overrides).

## Security notes (see `docs/final-solution.md` §10)

- Repo tokens **encrypted at rest** (app-level envelope encryption); least-privilege read-only.
- RBAC enforced per project; **audit-log** sensitive actions.

## Definition of Done (api-specific)

- No blocking/heavy work in any handler; heavy work enqueued or proxied.
- Shapes generated from `contracts/`; inputs validated.
- Token encryption + RBAC + audit logging in place for sensitive routes.
- Tests colocated and passing; lint/typecheck clean; `TODO.md`/`README.md` updated.
