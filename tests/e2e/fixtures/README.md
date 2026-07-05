# E2E fixture repos

Minimal frontend + backend sources for Phase 2 cross-repo linking (`GET /api/login`).

## Layout

| Path | Role |
|---|---|
| `frontend/src/api.ts` | `axios.get('/api/login')` → `http_call` graph node |
| `backend/src/routes.ts` | `app.get('/api/login', …)` → `route` graph node |

## Publish (one-time)

CodeSage attach requires hosted Git URLs. Mirror each folder to its own repo:

```bash
# Example: create github.com/your-org/codesage-e2e-frontend and -backend
cd tests/e2e/fixtures/frontend
git init && git add . && git commit -m "E2E frontend fixture"
git remote add origin https://github.com/your-org/codesage-e2e-frontend.git
git push -u origin main

cd ../backend
git init && git add . && git commit -m "E2E backend fixture"
git remote add origin https://github.com/your-org/codesage-e2e-backend.git
git push -u origin main
```

## Seed a project

With the stack running (`api` + `rag` + `db`):

```bash
export E2E_API_URL=http://localhost:3000/api
export E2E_FRONTEND_REPO_URL=https://github.com/your-org/codesage-e2e-frontend.git
export E2E_BACKEND_REPO_URL=https://github.com/your-org/codesage-e2e-backend.git
export E2E_GITHUB_TOKEN=ghp_...   # if private

node tests/e2e/scripts/seed-multi-repo-project.mjs
```

Prints `E2E_MULTI_REPO_PROJECT_ID` when both repos are indexed. Then run Playwright:

```bash
export E2E_BASE_URL=http://localhost:5173
export E2E_MULTI_REPO_PROJECT_ID=<uuid>
npm run test:e2e
```

See [`docs/plans/phase-2-e2e.md`](../../../docs/plans/phase-2-e2e.md).
