# AGENTS.md — tests/e2e

Local rules for Playwright cross-service journeys. Root [`/AGENTS.md`](../../AGENTS.md) also applies.

## What E2E covers today

- **Journey #1:** [`web/journey-project-onboarding.spec.ts`](./web/journey-project-onboarding.spec.ts) — 9 **serial** UI tests (errors first, then success, then UI cleanup).
- **Journey #2:** [`web/journey-developer-chat.spec.ts`](./web/journey-developer-chat.spec.ts) — developer chat with agent QA (citations, follow-up, abstain/review, greeting). Skips when `plannerTools` is unsupported unless `E2E_AGENT_QA_REQUIRED=1` fails global-setup.
- **No API pre-seeding** — projects and repos are created through the web UI; chat messages are typed in the UI.
- **Public + private repos** — not “frontend/backend” naming (see [`helpers/env.ts`](./helpers/env.ts)).

Catalog + matrix: [`workflows.md`](./workflows.md). Runbook: [`README.md`](./README.md).

## Do

- Add **journey specs** (user flows), not widget micro-tests. Prefer one serial `describe` per journey.
- Put reusable steps in [`helpers/`](./helpers/) (`auth`, `projects`, `chat`, `env`, `validate-e2e-env`).
- Validate required env in [`global-setup.ts`](./global-setup.ts) via [`validate-e2e-env.ts`](./helpers/validate-e2e-env.ts) — **fail fast** with a clear console message; do not `test.skip()` missing required env.
- Document new env vars in [`.env.example`](./.env.example) and mirror to `.env` (never commit `.env`).
- Match product UI semantics (HTML `required` vs JS validation — see helpers for negative-path patterns).
- Update [`workflows.md`](./workflows.md) and [`README.md`](./README.md) when adding journeys or env keys.

## Don't

- Don't use `E2E_FRONTEND_REPO_URL` / `E2E_BACKEND_REPO_URL` — removed; use public default + `E2E_PRIVATE_REPO_URL`.
- Don't seed projects/repos via API in journey specs (legacy `scripts/seed-*.mjs` is debug-only, not the main path).
- Don't wait for **Indexed** in onboarding journey #1 — cover indexing logs, re-index, dashboard instead. Journey #2 **does** wait for Indexed before chat.
- Don't assert `tool_*` SSE UI in v1 (agent events are ignored in the web client).
- Don't commit secrets or read `.env` contents in chat/logs.

## Env model

| Repo | Source | Token |
|---|---|---|
| Public | `DEFAULT_PUBLIC_REPO_URL` in `helpers/env.ts` (`octocat/Hello-World`); optional `E2E_PUBLIC_REPO_URL` | None |
| Private | `E2E_PRIVATE_REPO_URL` in `.env` (**required**) | `E2E_GITHUB_TOKEN` (**required**) |

`E2E_SKIP=1` — log skip line in global-setup; journey specs use `test.skip(skipLiveStack, …)`.

`E2E_AGENT_QA_REQUIRED=1` — global-setup fails if engine `/health` reports `plannerTools` ≠ `ok` (see `apps/engine/README.md`).

## Before finishing

- Run `npm run test:e2e` with stack up (or document why a change is docs-only / skip).
- Unit-test env validation changes in `scripts/test/validate-e2e-env.test.mjs`.
- Update [`docs/plans/phase-2-e2e.md`](../../docs/plans/phase-2-e2e.md) if scope or matrix changes.
