# apps/api — TODO

Checklist organized by module. (Global sequencing lives in `docs/final-solution.md` §12.)

## Platform & HTTP
- [x] Server bootstrap + middleware + error handling (`platform/errors.ts` — global `{ error: { code, message } }` handler + 404 handler).
- [x] Config + structured logging (`platform/config.ts` adds `nodeEnv`, `jwtSecret`, `jwtTtl`, `encryptionKey`; `platform/logger.ts` builds Pino options: debug in dev, info in prod).
- [x] PostgreSQL client (shared single datastore) — `platform/db.ts` using postgres.js; decorated on Fastify as `app.db`; pool closed on `onClose`.
- [x] JWT plugin — `@fastify/jwt` registered in `buildApp`; secret + TTL from config; `app.config` decorated for access in plugins.
- [x] Job-enqueue helper — `platform/queue.ts`; fast `INSERT` into the `jobs` table; workers consume with `SELECT ... FOR UPDATE SKIP LOCKED`.
- [x] AES-256-GCM envelope encryption for repo tokens — `platform/encryption.ts`.
- [x] RBAC `requireAuth` preHandler factory — `platform/auth.plugin.ts`; checks JWT + optional role allowlist.
- [x] OpenAPI wiring from `contracts/openapi.node.yaml` (all Phase 0 paths defined; types generated into `@codesage/shared-types`).

## auth
- [x] JWT login (`POST /auth/login`) — bcrypt verify + `app.jwt.sign`.
- [x] RBAC middleware (`requireAuth` factory with `allowedRoles`).
- [ ] Audit logging for sensitive actions (table exists, writes not wired yet).
- [ ] `POST /auth/logout` (token blacklist or client-side only for now).

## users
- [x] User CRUD — `GET /users/me`, `POST /users` (admin-only).
- [ ] Role assignment (`PATCH /users/:id/role`).

## projects
- [x] Project CRUD — `GET /projects`, `POST /projects`, `GET /projects/:id`, `DELETE /projects/:id`.
- [ ] Project-level status (index health) — requires worker heartbeat writes.

## repos
- [x] Attach repo — `POST /projects/:id/repos` with token encryption + sync job enqueue.
- [x] List repos — `GET /projects/:id/repos`.
- [x] Detach repo — `DELETE /projects/:id/repos/:repoId`.
- [x] **Token encrypted at rest** (AES-256-GCM, `TOKEN_ENC_KEY` from env).
- [x] Enqueue initial sync job on attach.

## webhooks
- [ ] `POST /webhooks/:provider` push intake.
- [ ] Enqueue incremental re-index job per repo.

## chat
- [ ] WebSocket gateway.
- [ ] Proxy/stream to `apps/rag` with citations.
- [ ] Pass audience + optional page context through.

## knowledge
- [ ] Read workflows / pages / permissions / data-flows for a project.

## questions
- [ ] Read expert question queue.
- [ ] Submit answer → store authoritative override.

## Cross-cutting
- [x] Colocated tests per module; 100% line + branch coverage enforced by Vitest.
- [ ] Lint + typecheck clean in CI.
