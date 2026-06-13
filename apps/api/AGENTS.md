# AGENTS.md — apps/api

Local rules for the Node API. Root [`/AGENTS.md`](../../AGENTS.md) also applies.

## The golden rule

**Node never blocks on heavy work.** If a handler would parse, embed, build a graph, distill, or
run retrieval, that is wrong — **enqueue a job** (Postgres queue) or **proxy to `services/rag`**
instead. Heavy/blocking work is Python's job.

## Do

- Keep **module-per-domain**: `routes + service + repository + tests` per module, public surface
  only, no cross-imports of another module's internals.
- Put cross-cutting concerns in `platform/` (db, queue, config, logging, errors).
- Use **generated types** from `contracts/` (via `packages/shared-types`) for all requests,
  responses, and job payloads. Validate inputs at the edge.
- **Encrypt repo tokens at rest**; enforce **RBAC**; **audit-log** sensitive actions.
- Small files, descriptive names, colocated `*.test.ts`.

## Don't

- Don't implement business logic that belongs in `py-core`.
- Don't hand-write API/job shapes — edit `contracts/` and run codegen.
- Don't call the database with ad-hoc queries scattered across modules — go through the module's
  repository layer.
- Don't commit secrets.

## Before finishing

No blocking work in handlers; shapes generated; security in place; tests + lint clean; update
`TODO.md`/`README.md`. See `docs/development-workflow.md` §7.
