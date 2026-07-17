# Plan 09 — E2E developer chat journey

**ADR:** [0026](../../adr/0026-agent-orchestrated-developer-qa.md)  
**Depends on:** [05](./05-agent-loop-and-stream-replace.md), [07](./07-node-web-stream-passthrough.md)  
**Blocks:** plan 13  

---

## Goal

Add Playwright **journey #2**: developer chat with streamed citations on an indexed project.
Uses existing onboarding project from journey #1 or creates one in-suite.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Full stack | `npm run dev`, `dev:engine`, PostgreSQL, TEI, **vLLM/Ollama with tool calling** |
| Indexed repo | Public `octocat/Hello-World` or `tests/e2e/fixtures` repos when indexing E2E-ready |
| Env | `tests/e2e/.env` per [README](../../../tests/e2e/README.md) |

**If live LLM lacks tool support:** journey uses `test.skip` with message referencing engine README
— same pattern as `E2E_SKIP`. Document in `validate-e2e-env.ts` optional check:
`E2E_AGENT_QA_REQUIRED=1` fails fast if health reports no tool support.

---

## New spec

**File:** `tests/e2e/web/journey-developer-chat.spec.ts`

Serial `describe` (one project context):

| # | Test | Steps |
|---|---|---|
| 1 | Start developer chat | `startDeveloperChat(page, projectId)` from existing helper |
| 2 | Ask code question | `sendChatMessage(page, "What files are in this repository?")` or fixture-specific symbol |
| 3 | Citation appears | `expectCitation(page, substring)` — timeout 120s (agent slower than old pipeline) |
| 4 | Follow-up turn | Second message in same conversation; assert assistant bubble count ≥ 2 |
| 5 | Abstain or review | Ask nonsense question; expect review note OR abstain wording in UI (`needs_review`) |
| 6 | Greeting | `sendChatMessage(page, "hi")` — expect reply without error (no crash) |

**Do not** assert `tool_*` UI — not in v1.

---

## Helpers

**File:** `tests/e2e/helpers/chat.ts` — extend:

```typescript
export async function expectAssistantReply(page: Page, timeoutMs = 120_000): Promise<void>
export async function expectNeedsReview(page: Page): Promise<void>
```

Match existing `MessageBubble` copy for low-confidence / abstain states.

---

## Workflows catalog

**File:** `tests/e2e/workflows.md`

Add section **2. Developer chat (agent QA)** — status **implemented** when this plan merges.

---

## Env

| Variable | Required | Purpose |
|---|---|---|
| `E2E_AGENT_QA_REQUIRED` | No (default `0`) | When `1`, global-setup fails if engine health lacks tool support |

Document in `tests/e2e/.env.example` and mirror `.env`.

---

## Tests (meta)

```bash
npm run test:e2e -- journey-developer-chat
```

Update `tests/e2e/AGENTS.md` — list second journey spec.

---

## Documentation

| Doc | Update |
|---|---|
| `tests/e2e/README.md` | Run journey #2; LLM tool requirement |
| `docs/plans/phase-2-e2e.md` | Link journey-developer-chat |
| `docs/plans/agent-qa/README.md` | Plan 09 exit criteria |

---

## Definition of Done

- [x] `journey-developer-chat.spec.ts` passes locally against live stack (or documented skip)
- [x] `workflows.md` updated
- [x] `helpers/chat.ts` extended + used
- [x] `.env.example` updated for `E2E_AGENT_QA_REQUIRED`
- [x] No API pre-seed of messages (UI sends questions)

---

## Failure triage

| Symptom | Check |
|---|---|
| Timeout on citation | Indexing incomplete; increase timeout; verify chunks in DB |
| 502 on chat | Engine agent loop error — engine logs |
| Abstain on valid question | Lower threshold only via constants in dev — not in E2E |
