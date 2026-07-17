# Plan 01 — Contracts & codegen (agent QA SSE + trace schema)

**ADR:** [0026](../../adr/0026-agent-orchestrated-developer-qa.md)  
**Depends on:** nothing  
**Blocks:** plans 02–13  
**Estimated scope:** contracts + codegen only — **no runtime behavior change** in this PR.

---

## Goal

Lock cross-service shapes for agent SSE events, extended answer metrics, and investigation trace
JSON before Python/Node implementation.

---

## Files to change

| File | Action |
|---|---|
| `contracts/openapi.engine.yaml` | Extend schemas |
| `contracts/openapi.node.yaml` | Mirror engine chunk types + metrics |
| `packages/shared-types/` | Regenerated — do not hand-edit |
| `apps/engine/src/generated/` | Regenerated Pydantic — do not hand-edit |
| `docs/schema/messages.md` | Document `investigation_trace` (nullable, added in plan 10 migration) |

---

## Contract changes (normative)

### 1. `EngineAnswerChunkType` — add values

In `contracts/openapi.engine.yaml` `components.schemas.EngineAnswerChunkType.enum`:

```yaml
- tool_start
- tool_result
```

Descriptions:

| Type | Required fields | Purpose |
|---|---|---|
| `tool_start` | `tool` (object, see below) | Planner invoked a tool |
| `tool_result` | `tool` (object) | Tool finished |

**`ToolEvent` object** (new schema `QaToolEvent`):

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Tool id: `search_symbols`, `search_code`, `search_vectors`, `search_hybrid`, `graph_expand`, `read_symbol`, `read_chunk` |
| `iteration` | integer | yes | 1-based agent iteration |
| `args` | object | no | Sanitized args (no secrets); query strings only |
| `hitCount` | integer | no | Number of hits returned (`tool_result` only) |
| `truncated` | boolean | no | True when results were capped (`tool_result` only) |
| `durationMs` | integer | no | Tool execution wall time (`tool_result` only) |

Add optional `tool` property on `EngineAnswerChunk` referencing `QaToolEvent`.

### 2. `AnswerMetrics` — add optional fields

| Field | Type | Description |
|---|---|---|
| `agentIterations` | integer | Planner loops executed before final answer |
| `evidenceConfidence` | number | Final `compute_hybrid_confidence` score (0–1) |
| `toolCallCount` | integer | Total tool invocations across iterations |

Keep existing `contextChunks`, `contextTokens`, etc.

### 3. `InvestigationTrace` schema (engine + shared)

New schema in `openapi.engine.yaml` (referenced by Node message persistence in plan 07/10):

- `version` (integer, required) — start at `1`
- `agentIterations` (integer)
- `finalConfidence` (number)
- `intentProfile` (string enum: `symbol_lookup`, `conceptual`, `balanced`)
- `terms` (string array)
- `iterations` (array of `InvestigationIteration`)
- `evidenceAnchors` (array of `EvidenceAnchor`)

**`InvestigationIteration`:** `index`, `confidenceAfter`, `toolCalls[]`  
**`ToolCallRecord`:** `tool`, `args`, `hitCount`, `topAnchors[]`  
**`EvidenceAnchor`:** `filePath` (required), `symbol` (optional), `graphNodeId` (optional uuid)

### 4. `read_symbol` qualified name (resolve ADR open question #1)

Add to contracts as documentation enum / pattern — **not** a separate API endpoint:

```text
qualified_name ::= symbol_name | file_path "::" symbol_name
```

Examples:

- `getMinEmi`
- `src/loan.utils.ts::getMinEmi`

Engine validates: if `::` present, split into `file_path` + `symbol`; else project-wide symbol
search.

### 5. Node mirror

`ChatAnswerChunkType` in `openapi.node.yaml` must match engine enum exactly (including `tool_start`,
`tool_result`). `AnswerMetrics` fields identical.

Update `POST /chat/query` description: stream may include tool events; clients may ignore them.

---

## Codegen

```bash
npm run codegen
npm run codegen:check
```

Verify:

- `packages/shared-types` exports updated `EngineAnswerChunk`, `ChatAnswerChunk`, `AnswerMetrics`
- Engine imports still compile (`uv run pytest apps/engine/tests/api/ -q` smoke)

---

## Tests (this plan)

| Test | Location | What |
|---|---|---|
| Codegen drift | CI `codegen:check` | Fails if contracts not generated |
| Node compile | `npm run build -w @codesage/api` | Types align |
| Optional snapshot | `apps/api/src/modules/chat/chat.sse.test.ts` | If exists, extend for `tool_start` parse — **only if file exists**; else add in plan 07 |

**No E2E in this plan.**

---

## Documentation updates (same PR)

| Doc | Update |
|---|---|
| `docs/schema/messages.md` | Add row for `investigation_trace jsonb` with note “migration in plan 10” |
| `contracts/README.md` | One line: agent QA chunk types in engine + node OpenAPI |
| `docs/plans/agent-qa/README.md` | Mark plan 01 done in PR description (not checkbox in repo until merged) |

---

## Definition of Done

- [x] `openapi.engine.yaml` and `openapi.node.yaml` updated as above
- [x] `npm run codegen:check` passes
- [x] No hand-edits in generated folders
- [x] `docs/schema/messages.md` mentions `investigation_trace`
- [x] PR does **not** change `stream_answer.py` behavior yet

---

## Rollback

Revert contract commit and regenerate; no DB migration.
