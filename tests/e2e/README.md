# E2E tests (Playwright)

Cross-service flows live here. Unit tests stay colocated in each app.

## Run

```bash
# Stack must be up (db + api + rag + web)
export E2E_BASE_URL=http://localhost:5173
export E2E_API_URL=http://localhost:3000/api
npm run test:e2e
```

Tests **skip** when `E2E_BASE_URL` is unset (CI unit jobs stay fast).

## Specs

| File | Phase | Requires |
|---|---|---|
| `phase1-smoke.spec.ts` | 1 | `E2E_BASE_URL` |
| `phase2-multi-repo.spec.ts` | 2 | `E2E_BASE_URL` + `E2E_MULTI_REPO_PROJECT_ID` |

## Phase 2 setup

See [`docs/plans/phase-2-e2e.md`](../docs/plans/phase-2-e2e.md) for fixture repos, seed script, and assertions.

After seeding:

```bash
export E2E_MULTI_REPO_PROJECT_ID=<uuid>
export E2E_MULTI_REPO_FRONTEND_PATH=src/api.ts
export E2E_MULTI_REPO_BACKEND_PATH=src/routes.ts
npm run test:e2e
```
