# Phase 2 — E2E test plan (multi-repo linking)

Validates Phase 2 **onboarding** UI today; cross-repo chat/citations when indexing is E2E-ready.

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

## Prerequisites

| Requirement | Notes |
|---|---|
| Running stack | `npm run dev` + `dev:rag` + PostgreSQL |
| `tests/e2e/.env` | `E2E_PRIVATE_REPO_URL`, `E2E_GITHUB_TOKEN` |
| Playwright browser | `npx playwright install chromium` (first run) |

---

## Environment variables

| Variable | Purpose |
|---|---|
| `E2E_PRIVATE_REPO_URL` | Private repo (required unless `E2E_SKIP=1`) |
| `E2E_GITHUB_TOKEN` | Read-only token for private repo |
| `E2E_PUBLIC_REPO_URL` | Optional public repo override |

Full list: [`tests/e2e/README.md`](../../tests/e2e/README.md).

---

## Planned

- **Journey #2:** Multi-repo code QA (chat + cross-repo citations) when indexing works in E2E  
- [`fixtures/`](../../tests/e2e/fixtures/) for graph-linked frontend/backend sample repos  

Legacy `npm run test:e2e:seed` (API pre-seed) is **not** the current approach.

---

## References

- [`phase-2-multi-repo.md`](./phase-2-multi-repo.md)
- [`tests/e2e/workflows.md`](../../tests/e2e/workflows.md)
