# E2E user workflows

Run: `npm run test:e2e` (stack must be up — see [`README.md`](./README.md)). Agent rules: [`AGENTS.md`](./AGENTS.md).

Missing `E2E_PRIVATE_REPO_URL` or `E2E_GITHUB_TOKEN` prints a clear error in the console and exits before tests run (unless `E2E_SKIP=1`).

---

## Journeys

### 1. Project onboarding + repo management via UI — **done**

```
Login → Projects → [create empty name — error] → create project
  → [attach empty URL — error] → [attach invalid URL — error]
  → attach public repo → [private token missing — error] → attach private repo
  → indexing logs → re-index → open link → Dashboard → Projects → delete project
```

- **Spec:** [`web/journey-project-onboarding.spec.ts`](./web/journey-project-onboarding.spec.ts) (9 serial tests, shared `projectName`; final step soft-deletes via UI)
- **Public repo:** built-in default (`octocat/Hello-World`); optional `E2E_PUBLIC_REPO_URL`
- **Private repo:** `E2E_PRIVATE_REPO_URL` + `E2E_GITHUB_TOKEN` in `.env`
- **No API seed** — all setup via UI

### Test matrix

| # | Test | Env needed |
|---|---|---|
| 1 | Create — empty name error | stack only |
| 2 | Create — success | stack only |
| 3 | Attach — empty URL error | stack only |
| 4 | Attach — invalid URL error | stack only |
| 5 | Attach public repo | stack only |
| 6 | Private — missing token error | `E2E_PRIVATE_REPO_URL` |
| 7 | Attach private repo | + `E2E_GITHUB_TOKEN` |
| 8 | Logs, re-index, dashboard | (same) |
| 9 | Delete created project | stack only |

Tests 1–4 need only dev stack + dev login. Tests 6–8 need private repo URL; test 7+ need token (validated in global-setup).

### 2. Multi-repo code QA (chat + citations) — **planned**

Blocked until indexing completes reliably in E2E. Will use [`fixtures/`](./fixtures/) graph-linked repos.

### 3. Single-repo code QA — **planned**

Phase 1 exit criteria; blocked on journey #2 infrastructure.

---

## Setup

[`global-setup.ts`](./global-setup.ts): validates required `.env` via [`validate-e2e-env.ts`](./helpers/validate-e2e-env.ts), checks API + web reachable. Set `E2E_SKIP=1` to skip journey specs.

---

## Fixtures

[`fixtures/`](./fixtures/) holds minimal sample sources for **future** graph/chat E2E — not used for current onboarding. Public attach uses `octocat/Hello-World` by default.
