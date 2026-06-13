# apps/api — TODO

Checklist organized by module. (Global sequencing lives in `docs/final-solution.md` §12.)

## Platform & HTTP
- [x] Server bootstrap + middleware + error handling (`platform/errors.ts` — global `{ error: { code, message } }` handler + 404 handler).
- [x] Config + structured logging (`platform/config.ts` adds `nodeEnv`; `platform/logger.ts` builds Pino options: debug in dev, info in prod).
- [x] PostgreSQL client (shared single datastore) — `platform/db.ts` using postgres.js; decorated on Fastify as `app.db`; pool closed on `onClose`.
- [ ] Job-enqueue helper (Postgres queue, payloads from `contracts/jobs.schema.json`).
- [x] OpenAPI wiring from `contracts/openapi.node.yaml` (`/health` endpoint defined; `HealthResponse` generated into `@codesage/shared-types`).

## auth
- [ ] Auth.js / JWT login + session.
- [ ] RBAC middleware (admin / expert / developer / end_user).
- [ ] Audit logging for sensitive actions.

## users
- [ ] User CRUD + role assignment.

## projects
- [ ] Project CRUD.
- [ ] Project-level status (index health).

## repos
- [ ] Attach repo (URL + provider + branch + role).
- [ ] **Encrypt token at rest** (envelope encryption).
- [ ] Enqueue initial index job on attach.

## webhooks
- [ ] `POST /webhooks/:provider` push intake.
- [ ] Enqueue incremental re-index job per repo.

## chat
- [ ] WebSocket gateway.
- [ ] Proxy/stream to `services/rag` with citations.
- [ ] Pass audience + optional page context through.

## knowledge
- [ ] Read workflows / pages / permissions / data-flows for a project.

## questions
- [ ] Read expert question queue.
- [ ] Submit answer → store authoritative override.

## Cross-cutting
- [ ] Colocated tests per module.
- [ ] Lint + typecheck clean in CI.
