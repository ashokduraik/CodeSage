# E2E tests (Playwright)

Cross-service **user journeys** against a live dev stack. Agent rules: [`AGENTS.md`](./AGENTS.md). Journey catalog: [`workflows.md`](./workflows.md).

---

## Quick start

```bash
cp tests/e2e/.env.example tests/e2e/.env
# Required: set E2E_PRIVATE_REPO_URL and E2E_GITHUB_TOKEN

docker compose up -d db
npm run dev
npm run dev:rag

npm run test:e2e
```

If required env is missing, global-setup **exits non-zero** with a formatted console message (no silent `test.skip` for missing private repo config).

Configuration: [`tests/e2e/.env`](./.env) (copy from [`.env.example`](./.env.example)). Never commit `.env`.

Set `E2E_SKIP=1` in `.env` to skip live-stack journey specs without failing on missing private repo vars.

---

## Repos under test

| Repo | Source | Token |
|---|---|---|
| **Public** | Default in code: `https://github.com/octocat/Hello-World.git` | None |
| **Public override** | Optional `E2E_PUBLIC_REPO_URL` in `.env` | None |
| **Private** | **Required** `E2E_PRIVATE_REPO_URL` in `.env` | **Required** `E2E_GITHUB_TOKEN` |

Journey attaches **public first**, then **private**, entirely through the UI (no API seed).

---

## What `npm run test:e2e` does

1. Loads `tests/e2e/.env` (Playwright config + global-setup).
2. [`global-setup.ts`](./global-setup.ts) — [`validateE2eEnv`](./helpers/validate-e2e-env.ts) (unless `E2E_SKIP=1`), then checks API + web health.
3. Runs 9 **serial** tests in [`web/journey-project-onboarding.spec.ts`](./web/journey-project-onboarding.spec.ts): create/attach **error paths first**, then public + private attach success, repo actions, dashboard, then **UI cleanup** (soft-delete the project).

Run one journey file or grep filter:

```bash
npx playwright test tests/e2e/web -c tests/e2e/playwright.config.ts
npx playwright test -g "attach public" -c tests/e2e/playwright.config.ts
```

First-time browser install: `npx playwright install chromium`.

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `E2E_PRIVATE_REPO_URL` | Yes* | Private Git clone URL for UI attach |
| `E2E_GITHUB_TOKEN` | Yes* | Read-only token for the private repo |
| `E2E_BASE_URL` | No | Web app (default `http://localhost:5173`) |
| `E2E_API_URL` | No | Node API (default `http://localhost:3000/api`) |
| `E2E_DEV_EMAIL` / `E2E_DEV_PASSWORD` | No | Dev login (matches API seed) |
| `E2E_PUBLIC_REPO_URL` | No | Override default public repo |
| `E2E_REPO_BRANCH` | No | Branch on confirm step (default `main`) |
| `E2E_SKIP` | No | `1` skips journey specs + env validation failure |
| `E2E_HEADLESS` | No | `1` for headless browser |

\*Not required when `E2E_SKIP=1`.

Example missing-env output:

```text
E2E configuration error — missing required variables in tests/e2e/.env:

  E2E_PRIVATE_REPO_URL   Private Git clone URL for attach tests (your private repo)
  E2E_GITHUB_TOKEN       Read-only token for the private repo

Copy tests/e2e/.env.example → tests/e2e/.env and set both values.
Public repo uses built-in default (octocat/Hello-World); override with E2E_PUBLIC_REPO_URL if needed.

See tests/e2e/README.md
```

---

## Specs & helpers

| Journey | Spec |
|---|---|
| Project onboarding (errors + public/private attach + dashboard) | `web/journey-project-onboarding.spec.ts` |

| Helper | Role |
|---|---|
| [`helpers/auth.ts`](./helpers/auth.ts) | Dev login |
| [`helpers/projects.ts`](./helpers/projects.ts) | Create/attach flows, negative paths, dashboard |
| [`helpers/env.ts`](./helpers/env.ts) | Public default, `INVALID_REPO_URL`, env accessors |
| [`helpers/validate-e2e-env.ts`](./helpers/validate-e2e-env.ts) | Required-env preflight |

---

## Repo layout

| Path | Role |
|---|---|
| `AGENTS.md` | Agent/human rules for E2E changes |
| `workflows.md` | Journey catalog + test matrix |
| `.env.example` / `.env` | Config (private repo + token required) |
| `global-setup.ts` | Env validation + stack health |
| `playwright.config.ts` | Playwright project config |
| `helpers/` | Shared UI steps + env validation |
| `web/*.spec.ts` | Browser journey specs |
| `fixtures/` | Sample sources for **future** graph/chat E2E (not onboarding) |
| `scripts/` | Legacy API seed utilities (debug only; not used by journey spec) |

---

## Implementation notes (negative paths)

- **Invalid URL (test 4):** uses `INVALID_REPO_URL` (`gitlab.invalid/…`) so probe fails with *Could not reach the repository* without a token. GitHub 404 without auth is treated as private → token step, not an error alert.
- **Missing token (test 6):** HTML `required` blocks a truly empty submit; helper uses whitespace to reach JS validation → *Enter an access token to continue*.
- **Empty name / empty URL:** helpers use `requestSubmit()` where needed to exercise validation without bypassing the dialog.

---

## Legacy scripts

`npm run test:e2e:seed` runs [`scripts/seed-multi-repo-project.mjs`](./scripts/seed-multi-repo-project.mjs) (API pre-seed, old frontend/backend env vars). **Not** part of the current journey-based E2E path.
