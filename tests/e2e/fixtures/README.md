# E2E fixture repos

Minimal frontend + backend sources for **future** Phase 2 cross-repo graph/chat E2E (`GET /api/login` linking).

**Not used** for current onboarding tests — public attach uses built-in default (`octocat/Hello-World`); private attach uses `E2E_PRIVATE_REPO_URL` in [`tests/e2e/.env`](../.env.example).

## Layout

| Path | Role |
|---|---|
| `frontend/src/api.ts` | `axios.get('/api/login')` → `http_call` graph node |
| `backend/src/routes.ts` | `app.get('/api/login', …)` → `route` graph node |

## Publish (one-time, when graph E2E is added)

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

## Configure and run onboarding E2E

Add **private** repo URL and token to [`tests/e2e/.env`](../.env.example). Public attach uses built-in default.

```bash
npm run test:e2e
```

See [`workflows.md`](../workflows.md), [`docs/plans/phase-2-e2e.md`](../../../docs/plans/phase-2-e2e.md), and [`tests/e2e/README.md`](../README.md).
