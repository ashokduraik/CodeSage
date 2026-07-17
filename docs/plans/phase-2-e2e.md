# Phase 2 — E2E test plan (multi-repo linking)

Validates Phase 2 **onboarding** UI today; **developer chat (agent QA)** via journey #2; cross-repo citations when fixture repos are attachable.

**Journey catalog:** [`tests/e2e/workflows.md`](../../tests/e2e/workflows.md) · **Runbook:** [`tests/e2e/README.md`](../../tests/e2e/README.md) · **Agent rules:** [`tests/e2e/AGENTS.md`](../../tests/e2e/AGENTS.md)

---

## Current E2E (Phase 2 onboarding) — **done**

| Repo | Config |
|---|---|
| Public attach | Default `octocat/Hello-World` in [`helpers/env.ts`](../../tests/e2e/helpers/env.ts); optional `E2E_PUBLIC_REPO_URL` |
| Private attach | `E2E_PRIVATE_REPO_URL` + `E2E_GITHUB_TOKEN` in `tests/e2e/.env` |

**Spec:** [`web/journey-project-onboarding.spec.ts`](../../tests/e2e/web/journey-project-onboarding.spec.ts) — 9 serial UI tests:

1. Create — empty name error  
2. Create — success  
3. Attach — empty URL error  
4. Attach — invalid URL error  
5. Attach public repo  
6. Private — missing token error  
7. Attach private repo  
8. Indexing logs, re-index, open link, dashboard, sidebar round-trip  
9. Delete created project (UI soft-delete cleanup)

- Error paths **before** success paths  
- **No API pre-seed** — UI-only project + attach + cleanup  
- Does **not** wait for Indexed state  

Missing required env → **console error + non-zero exit** ([`validate-e2e-env.ts`](../../tests/e2e/helpers/validate-e2e-env.ts)). `E2E_SKIP=1` skips journey specs.

---

## Journey #2 — developer chat (agent QA) — **implemented**

**Spec:** [`web/journey-developer-chat.spec.ts`](../../tests/e2e/web/journey-developer-chat.spec.ts)  
**Plan:** [`agent-qa/09-e2e-developer-chat-journey.md`](./agent-qa/09-e2e-developer-chat-journey.md) (ADR 0026)

- Creates a project, attaches the public repo, **waits for Indexed**, then exercises chat UI (citation, follow-up, abstain/review, greeting).
- Requires tool-calling LLM (`plannerTools: ok`). Soft-skip when unsupported; `E2E_AGENT_QA_REQUIRED=1` fails global-setup.
- Override `E2E_PUBLIC_REPO_URL` to a JS/TS repo for reliable citations (Hello-World is README-only).

Run: `npm run test:e2e -- journey-developer-chat`

**CI policy:** GitHub Actions currently runs unit/coverage, lint, typecheck, build, and codegen
checks but does not provision the live PostgreSQL/API/web/engine/model stack required by
Playwright. Journey #2 is therefore operator-run and soft-skips when planner tools are unsupported;
`E2E_AGENT_QA_REQUIRED=1` turns that condition into a failure. A tracking issue is still required
before live-stack E2E can be made a mandatory CI gate.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Running stack | `npm run dev` + `dev:engine` + PostgreSQL |
| `tests/e2e/.env` | `E2E_PRIVATE_REPO_URL`, `E2E_GITHUB_TOKEN` |
| Tool-calling LLM | Journey #2 — see `apps/engine/README.md` |
| Playwright browser | `npx playwright install chromium` (first run) |

---

## Environment variables

| Variable | Purpose |
|---|---|
| `E2E_PRIVATE_REPO_URL` | Private repo (required unless `E2E_SKIP=1`) |
| `E2E_GITHUB_TOKEN` | Read-only token for private repo |
| `E2E_PUBLIC_REPO_URL` | Optional public repo override (JS/TS for chat citations) |
| `E2E_AGENT_QA_REQUIRED` | Optional — fail if planner tools unsupported |
| `E2E_ENGINE_URL` | Optional — engine `/health` origin |

Full list: [`tests/e2e/README.md`](../../tests/e2e/README.md).

---

## Planned

- **Journey #3:** Multi-repo code QA (chat + cross-repo citations) when [`fixtures/`](../../tests/e2e/fixtures/) are published as Git URLs  

Legacy `npm run test:e2e:seed` (API pre-seed) is **not** the current approach.

---

## References

- [`phase-2-multi-repo.md`](./phase-2-multi-repo.md)
- [`tests/e2e/workflows.md`](../../tests/e2e/workflows.md)
- [`agent-qa/09-e2e-developer-chat-journey.md`](./agent-qa/09-e2e-developer-chat-journey.md)
