# Phase 2 — E2E test plan (multi-repo linking)

Validates Phase 2 exit criteria from [`phase-2-multi-repo.md`](./phase-2-multi-repo.md):
cross-repo `graph_edges` exist and developer QA citations span frontend → backend.

**Framework:** Playwright in `tests/e2e/` (see [`development-workflow.md`](../development-workflow.md)).

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Running stack | `docker compose up -d --build` or `npm run dev` + `dev:rag` + GPU overlay if using real TEI/vLLM |
| Seeded users | Default dev login (`dev@codesage.local` / `dev-password`) |
| GitHub/GitLab tokens | Read-only tokens for fixture repos (or self-hosted mirrors) |
| Env | `E2E_BASE_URL`, `E2E_API_URL`; Phase 2 adds `E2E_MULTI_REPO_PROJECT_ID` after seed |

Optional GPU: `docker compose -f docker-compose.yml -f docker-compose.gpu.yml --profile gpu up -d tei vllm`

Without GPU, RAG uses dev fallbacks (deterministic embeddings + excerpt answers) — sufficient for **graph/link** assertions; LLM answer quality is not the gate.

---

## Fixture repos

Add two minimal public or vendored git fixtures (JS/TS only):

```
tests/e2e/fixtures/
├── frontend/          # axios call: GET /api/login
│   └── src/api.ts
└── backend/           # Express route: app.get('/api/login', …)
    └── src/routes.ts
```

**Contract to link:** `GET /api/login` — same method + path in both repos so `xrepo` creates one cross-repo edge.

**Options for CI/local:**

1. **Vendored bare repos** — init git in `fixtures/`, push to org test repos once, E2E attaches by URL + token from secrets.
2. **Pre-seeded DB project** — migration/seed script creates project + repos + completed jobs; E2E only asserts chat + graph (fastest for CI).
3. **Hybrid (recommended)** — seed script creates project row; Playwright attaches fixtures via API on first run, polls until indexed.

---

## Test layers

### L1 — Pipeline / graph (API + DB, no browser)

Run against live Postgres + RAG worker. Can be a Node or Python script under `tests/e2e/helpers/` later; for now document as manual gate + future automation.

| Step | Assert |
|---|---|
| `POST /projects` + attach frontend repo | `202`, sync job enqueued |
| Attach backend repo | second sync job |
| Poll `GET /projects/:id/repos` or jobs table | both repos `lastIndexedAt` set |
| Poll jobs | `xrepo` job `done` for `projectId` |
| SQL | `graph_edges` row: `kind = 'http_call'`, src/dst nodes in different `repo_id`s, matching `name = 'GET /api/login'` |

### L2 — RAG retrieval (HTTP)

| Step | Assert |
|---|---|
| `POST /api/chat/query` (SSE) with project id + developer audience | Question: "Where is GET /api/login handled?" |
| Stream | ≥1 citation with frontend file path |
| Stream | ≥1 citation with backend file path (graph expansion) |
| Stream | No `abstain` when fixtures are indexed |

### L3 — UI smoke (Playwright)

File: `tests/e2e/phase2-multi-repo.spec.ts`

| Test | Flow |
|---|---|
| Multi-repo project visible | Login → Projects → see both repos indexed |
| Cross-repo chat | Chat → select multi-repo project → ask linking question → citation chips from two repo paths |
| (Optional) Graph sanity | Admin/dev SQL helper endpoint TBD — skip until read API exists |

---

## Playwright spec structure

```ts
// tests/e2e/phase2-multi-repo.spec.ts
// Skip unless E2E_BASE_URL and E2E_MULTI_REPO_PROJECT_ID are set.

test.describe("Phase 2 multi-repo linking", () => {
  test("indexed project lists two repos", …);
  test("developer chat cites frontend and backend files", …);
});
```

**Env vars:**

| Variable | Purpose |
|---|---|
| `E2E_BASE_URL` | Web app (default `http://localhost:5173`) |
| `E2E_API_URL` | Node API (default `http://localhost:3000/api`) |
| `E2E_MULTI_REPO_PROJECT_ID` | UUID of project with both fixture repos indexed |
| `E2E_MULTI_REPO_FRONTEND_PATH` | e.g. `src/api.ts` — expected citation substring |
| `E2E_MULTI_REPO_BACKEND_PATH` | e.g. `src/routes.ts` |

---

## Setup script (to implement)

`tests/e2e/scripts/seed-multi-repo-project.mjs`:

1. Login as dev user → JWT.
2. Create project `"E2E Multi-Repo"`.
3. Attach `fixtures/frontend` and `fixtures/backend` (URLs + `E2E_GITHUB_TOKEN`).
4. Poll API until project lifecycle = indexed and `xrepo` job done (timeout 10–15 min first run).
5. Print `E2E_MULTI_REPO_PROJECT_ID=…` for `.env` or CI.

Document in root `README.md` E2E section when script lands.

---

## CI strategy

| Job | When | Notes |
|---|---|---|
| Unit (existing) | Every PR | No E2E |
| E2E smoke Phase 1 | Optional nightly | `E2E_BASE_URL` set against staging compose |
| E2E Phase 2 | Optional nightly / manual | Requires tokens + indexed fixtures; mark as non-blocking until fixtures stable |

Do not block PR CI on Phase 2 E2E until L1 helper + fixtures are committed.

---

## Definition of Done (E2E)

- [x] Fixture repos committed under `tests/e2e/fixtures/`.
- [x] Seed script (`npm run test:e2e:seed`) — attach + poll until indexed.
- [ ] L1 assertions automated (jobs + graph_edges).
- [ ] `phase2-multi-repo.spec.ts` passes locally with `E2E_*` env set.
- [ ] Phase 2 plan DoD checkbox checked: exit criteria met.
- [ ] `phase-1-mvp-code-qa.md` E2E checkbox updated when L3 covers single-repo chat.

---

## Build order

1. [x] Commit fixture source trees + README in `tests/e2e/fixtures/`.
2. [x] Seed script (attach + poll) — `npm run test:e2e:seed`.
3. L1 SQL/API assertions script.
4. Playwright L3 tests wired to `E2E_MULTI_REPO_PROJECT_ID` (scaffold in `phase2-multi-repo.spec.ts`).
5. Optional nightly CI workflow.

---

## References

- [`phase-2-multi-repo.md`](./phase-2-multi-repo.md) — implementation milestones
- [`phase-1-mvp-code-qa.md`](./phase-1-mvp-code-qa.md) — single-repo E2E note
- [`tests/e2e/phase1-smoke.spec.ts`](../../tests/e2e/phase1-smoke.spec.ts) — existing pattern
