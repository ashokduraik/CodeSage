# ADR 0014 — Phase 0 implementation tooling

- **Status:** Accepted
- **Date:** 2026-06-13
- **Related:** `final-solution.md` §12 (Phase 0), ADRs 0001, 0002, 0006, 0011

## Context

Phase 0 turns the documented design into a running skeleton: monorepo wiring, contracts codegen,
PostgreSQL + migrations, container build, and CI. Several concrete tool choices were left open in
the specs and are decided here.

## Decision

| Concern | Choice | Why |
|---|---|---|
| JS monorepo | **npm workspaces** | Already installed (Node 24 / npm 11); zero extra tooling. |
| Frontend | **Vite + React + TypeScript** | Lightweight SPA; pairs with a separate Node API. |
| Node API | **Fastify + TypeScript** | Fast, schema/JSON-first, strong OpenAPI fit (ADR 0001). |
| Auth | **Custom JWT via `jose`** + argon2/bcrypt, RBAC middleware | Fits a Vite SPA + Fastify (supersedes "Auth.js" naming in ADR 0011 for the SPA architecture; Keycloak still the SSO path). |
| Python pkg mgr | **uv** | Fast, reproducible; pins interpreter. |
| Python web | **FastAPI + uvicorn** (`apps/rag`) | Async, typed, streaming-friendly; background job consumers in the same deployable (MVP). |
| Python runtime | **3.12 pinned in Docker** | Local is 3.14 (too new for some ML wheels); containers pin 3.12. |
| Job queue | **Procrastinate** | Postgres-only queue with retries (ADR 0006). |
| Migrations | **dbmate** (plain SQL up/down) | Language-agnostic; SQL is the schema source of truth, runnable in CI/Docker. |
| Codegen | **openapi-typescript** (+ `openapi-fetch`) for TS, **datamodel-code-generator** for Pydantic | Contracts → generated types both sides (ADR 0001). |
| Build (api) | **tsup** (esbuild) + **tsx** for dev | Bundles workspace source; no prebuild dance. |
| Tests | **Vitest** (TS) + **pytest** (Python) unit; **Playwright** for E2E | Coverage gates at **80%** (line + branch). Vitest's Jest-compatible API satisfies the "Jest" intent in the coding standards without a second runner. |
| Task runner | **npm scripts** (canonical) + thin `Makefile` wrapper | Cross-platform; Make optional. |
| CI | **GitHub Actions** | Lint, typecheck, test+coverage, codegen drift, build images. |

## Consequences

- The skeleton is buildable and verifiable via `docker compose` from day one.
- Auth is implemented as custom JWT rather than the Auth.js library; ADR 0011's intent (lightweight
  JWT now, Keycloak for SSO later) is preserved — only the library name changes for the SPA design.
- 80% coverage gates apply from the first commit, so even skeleton code ships with tests.

## Alternatives considered

- pnpm/Turborepo (more scalable monorepo) — deferred to avoid extra tooling for MVP.
- Next.js + Auth.js (native fit) — heavier and overlaps the Node API tier; rejected for the SPA split.
- Alembic (SQLAlchemy-native migrations) — couples schema to ORM models; dbmate keeps SQL canonical.

## Escape hatch

Swap npm→pnpm/Turborepo, dbmate→Alembic, or add Next.js later; each is isolated to its layer.
