# Plan 07 — Node & web stream passthrough (tool events + trace hook)

**ADR:** [0026](../../adr/0026-agent-orchestrated-developer-qa.md)  
**Depends on:** [01](./01-contracts-and-codegen.md), [05](./05-agent-loop-and-stream-replace.md)  
**Blocks:** plan 09 (E2E), plan 10 (trace persistence)  

---

## Goal

Node proxies new SSE chunk types without breaking chat persistence. Web client **may ignore**
`tool_*` chunks for display in v1 — but must not crash. Prepare accumulator for
`investigation_trace` (full column in plan 10).

---

## Node changes

### `apps/api/src/modules/chat/chat.sse.ts`

| Change | Detail |
|---|---|
| `applyChatChunk` | Add `tool_start` / `tool_result` cases — **no-op** on content/citations (optional debug log at trace level) |
| `StreamAccumulator` | Add optional `investigationTrace?: unknown` — populated in plan 10 when engine sends trace |

### Tests

**File:** `apps/api/src/modules/chat/chat.sse.test.ts` (create if missing, else extend)

| Test |
|---|
| `applyChatChunk ignores tool_start without mutating content` |
| `applyChatChunk ignores tool_result` |
| Existing token/citation/abstain tests still pass |

### `chat.service.ts`

No change required for plan 07 unless accumulator needs typing for new metrics fields — extend
`AnswerMetrics` mapping when persisting `metrics` jsonb (pass through unknown fields).

---

## Web changes

### `apps/web/src/features/chat/chatClient.ts`

In SSE parser switch:

- `tool_start` / `tool_result` — **ignore** (no UI in v1) OR optional `onToolEvent` callback stub
- Must not throw on unknown types if codegen adds enums

### `chatClient.test.ts`

Add fixture stream with `tool_start` + `tool_result` lines — assert answer still aggregates tokens
and citations.

### UI (optional, same PR if trivial)

- No new components required for DoD
- If adding debug mode: show tool names in dev console only — not required

---

## Engine → Node trace (optional field)

If engine embeds investigation trace in `metrics` or final internal payload before plan 10 DB
column:

- Document in OpenAPI as optional `metrics.investigationTrace` — **only if implemented in plan 05**
- Otherwise defer to plan 10

**Default for plan 07:** trace not persisted to DB yet; Node ignores.

---

## Tests

```bash
npm run test -w @codesage/api -- chat.sse
npm run test -w @codesage/web -- chatClient
```

**No E2E.**

---

## Documentation

| Doc | Update |
|---|---|
| `apps/api/TODO.md` | Note tool SSE passthrough |
| `apps/web/README.md` | Chat client ignores tool events in v1 |

---

## Definition of Done

- [x] Node parses `tool_start` / `tool_result` without error
- [x] Web chatClient tolerates tool chunks
- [x] Unit tests added/updated
- [x] Chat E2E not required yet

---

## Not in this plan

- `messages.investigation_trace` migration (plan 10)
- Playbooks (plans 11–12)
