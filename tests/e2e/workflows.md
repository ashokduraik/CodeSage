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

### 2. Developer chat (agent QA) — **implemented**

```
Login → create project → attach public repo → wait Indexed
  → start developer chat → ask code question → citation
  → follow-up turn → nonsense (review/abstain) → greeting → delete project
```

- **Spec:** [`web/journey-developer-chat.spec.ts`](./web/journey-developer-chat.spec.ts) (serial; ADR 0026 agent loop)
- **Requires:** tool-calling LLM (`plannerTools: ok` on engine `/health`). Specs `test.skip` when unsupported; set `E2E_AGENT_QA_REQUIRED=1` to fail fast in global-setup.
- **Indexed source:** default `octocat/Hello-World` has no `.ts`/`.js` — override `E2E_PUBLIC_REPO_URL` to a small public JS/TS repo for citations.
- **No API seed of messages** — questions are sent through the chat UI.
- **Does not** assert `tool_*` UI (v1).

### Test matrix

| # | Test | Env / notes |
|---|---|---|
| 1 | Create project + wait Indexed | stack + engine + embeddings |
| 2 | Start developer chat | tool-calling LLM |
| 3 | Code question → citation | JS/TS public repo override recommended |
| 4 | Follow-up turn (≥ 2 assistant bubbles) | same conversation |
| 5 | Nonsense → needs review / abstain | NFR-7 |
| 6 | Greeting (`hi`) without error | social turn via planner |
| 7 | Delete created project | UI soft-delete |

### 3. Multi-repo code QA (cross-repo citations) — **planned**

Blocked until fixtures are published as attachable Git URLs. Will use [`fixtures/`](./fixtures/) graph-linked repos.

---

## Setup

[`global-setup.ts`](./global-setup.ts): validates required `.env` via [`validate-e2e-env.ts`](./helpers/validate-e2e-env.ts), checks API + web reachable, and optionally enforces planner tool support when `E2E_AGENT_QA_REQUIRED=1`. Set `E2E_SKIP=1` to skip journey specs.

---

## Fixtures

[`fixtures/`](./fixtures/) holds minimal sample sources for **future** graph/chat E2E — not used for current onboarding or journey #2. Public attach uses `octocat/Hello-World` by default (override for agent QA citations).
