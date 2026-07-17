# ADR 0027 — QA investigation playbooks (learned retrieval paths)

- **Status:** Accepted
- **Date:** 2026-07-16
- **Depends on:** [ADR 0026](./0026-agent-orchestrated-developer-qa.md) (agent loop + investigation traces)
- **Related:** [ADR 0019](./0019-persist-chat-history-in-postgres.md), [ADR 0020](./0020-hybrid-retrieval.md),
  [ADR 0025](./0025-distillation-derived-knowledge.md) (expert overrides — complementary trust model),
  [ADR 0003](./0003-postgresql-single-datastore.md), [ADR 0004](./0004-pgvector-for-vectors.md),
  `docs/data-model.md`, `docs/schema/messages.md`

## Context

### Problem

[ADR 0026](./0026-agent-orchestrated-developer-qa.md) introduces an agent that **learns how to
investigate** within a single request (up to five iterations). Each new session still starts from
scratch: the planner must rediscover that *"how is EMI calculated?"* is best answered by
`search_symbols("getMinEmi")` → `graph_expand` → `read_symbol(...)`.

At **~5M LOC per project**, rediscovering effective tool sequences on every question wastes planner
LLM calls and increases latency. The product goal is:

> **The LLM does not learn code. It learns how to retrieve.** Successful investigations become
> reusable playbooks so similar future questions start with a better strategy.

This is **organizational memory** scoped to a **project** — not fine-tuning model weights and not
storing answers as ground truth (answers can still go stale; evidence must always come from fresh
tool results at answer time per NFR-7).

### Implementation baseline

- `messages.investigation_trace` persists the full tool trace ([`messages.md`](../schema/messages.md)).
- `qa_playbooks` stores project-scoped retrieval strategies and question embeddings.
- `expert_answers` stores **authoritative factual overrides** (Phase 5) — a different trust model.
- `graph_nodes` / `graph_edges` continue to model **source code**, not QA investigation history.

### Scale target (explicit)

Playbooks must remain useful and bounded when:

- One project indexes up to **~5M LOC** (~80k–125k chunks — see ADR 0026).
- Many users ask overlapping questions across months of re-indexes.
- Chunk row ids rotate on re-embed while **file paths and symbol names** remain stable anchors.

**Design constraint:** playbook storage growth must be **sublinear** in question volume — cap rows
per project, merge duplicates, decay stale entries.

### What this ADR does *not* assume

- That playbook replay alone is sufficient without fresh tool execution at answer time.
- That every successful answer should be learned (only high-confidence, non-abstain traces).
- That playbooks transfer across projects (they are **project-scoped** only).
- That user thumbs-up/down exists on day one (optional signal in a later milestone).

---

## Decision

Persist **successful investigation traces** as **QA playbooks** in PostgreSQL. On new questions,
retrieve similar playbooks via **question embedding similarity** and supply them to the ADR 0026
planner as **hints** (milestone B) with optional **iteration-1 warm-start** (milestone C).

**No model fine-tuning.** Learning is read-only context injection + optional deterministic tool
preflight.

### Trust and learning rules (normative)

A trace is eligible to become or reinforce a playbook **only when all** of the following hold:

| Rule | Condition |
|---|---|
| **L1 — Successful gate** | Final `evidenceConfidence >= QA_AGENT_MIN_CONFIDENCE` (ADR 0026) |
| **L2 — Grounded answer** | Response was not `abstain`; at least one citation in `messages.citations` |
| **L3 — Tool usage** | Trace contains ≥ 1 retrieval tool call (`search_*`, `graph_expand`, `read_*`) |
| **L4 — Project scope** | `project_id` matches; playbooks never shared across projects |
| **L5 — Active rows** | Playbook `status = 'A'` (soft delete per `row-status.mdc`) |

**Do not learn from:** abstains, sub-threshold confidence, social turns with no tools, stopped
partial generations (unless product later defines partial learning — **out of scope v1**).

**Answer text is not stored in the playbook** — only the investigation path and anchors. The final
answer is always regenerated from fresh evidence.

### Investigation trace shape (normative)

Stored on the assistant `messages` row as `investigation_trace jsonb` (migration required) and
copied into `qa_playbooks` on promotion.

```json
{
  "version": 1,
  "agentIterations": 2,
  "finalConfidence": 0.86,
  "intentProfile": "symbol_lookup",
  "terms": ["getMinEmi", "emi"],
  "iterations": [
    {
      "index": 1,
      "confidenceAfter": 0.62,
      "toolCalls": [
        {
          "tool": "search_symbols",
          "args": { "query": "getMinEmi" },
          "hitCount": 2,
          "topAnchors": [
            { "graphNodeId": "uuid", "symbol": "getMinEmi", "filePath": "src/loan.utils.ts" }
          ]
        }
      ]
    },
    {
      "index": 2,
      "confidenceAfter": 0.86,
      "toolCalls": [
        {
          "tool": "graph_expand",
          "args": { "nodeId": "uuid" },
          "hitCount": 1,
          "topAnchors": [
            { "filePath": "backend/services/loan.service.ts", "symbol": "LoanService.doCalc" }
          ]
        }
      ]
    }
  ],
  "evidenceAnchors": [
    { "filePath": "src/loan.utils.ts", "symbol": "getMinEmi" },
    { "filePath": "backend/services/loan.service.ts", "symbol": "LoanService.doCalc" }
  ]
}
```

**Anchors** use stable keys (`filePath`, `symbol`, `graphNodeId`) — not `chunkId` alone.

### Database schema (normative)

New tables follow audit columns and `status char(1)` per ADR 0018.

#### `qa_playbooks`

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` PK | |
| `project_id` | `uuid` FK → `projects.id` | Scope |
| `canonical_question` | `text` | Normalized exemplar wording (for display / dedup) |
| `question_embedding` | `halfvec(N)` | Embedding of canonical question (TEI, same model as chunks) |
| `intent_profile` | `text` | `symbol_lookup` \| `conceptual` \| `balanced` |
| `steps` | `jsonb` | Ordered tool sequence (see §Playbook steps) |
| `evidence_anchors` | `jsonb` | Stable file/symbol anchors from successful run |
| `success_count` | `int` | Times this playbook led to a successful answer (increment rules in implementation) |
| `last_success_at` | `timestamptz` | Last successful use |
| `source_message_id` | `uuid` FK → `messages.id` NULL | Provenance |
| + audit columns | | `created_at`, `updated_at`, `created_by`, `updated_by`, `status` |

**Indexes:**

- HNSW on `question_embedding` **per project** — partial `WHERE status = 'A'` (or composite
  filter pattern validated for pgvector at implementation time).
- `(project_id, last_success_at DESC)` partial active — list recent playbooks for admin/debug.

#### `messages.investigation_trace`

The migration adds nullable `investigation_trace jsonb` to `messages`. The engine includes the
trace in answer metrics and Node persists it through the SSE accumulator.

#### Playbook `steps` JSON (normative)

```json
[
  { "order": 1, "tool": "search_symbols", "argsTemplate": { "query": "{term:getMinEmi}" } },
  { "order": 2, "tool": "graph_expand", "argsTemplate": { "nodeId": "{anchor:graphNodeId}" } },
  { "order": 3, "tool": "read_symbol", "argsTemplate": { "qualified_name": "{anchor:symbol}" } }
]
```

`{term:…}` and `{anchor:…}` are placeholders resolved at replay time from the **new** question's
extracted terms and from tool results — not blind copy-paste of old UUIDs.

### Similarity retrieval (normative)

On each new developer question (before planner iteration 1):

1. Embed the user question (same `EmbeddingClient` as `search_vectors`).
2. Query `qa_playbooks` for the same `project_id`, `status = 'A'`, cosine similarity ≥
   `QA_PLAYBOOK_MIN_SIMILARITY` (default **0.85** — tunable in `constants.py`).
3. Take top **K** matches (default **K = 3**).
4. Pass summaries into the planner system prompt under a **“Past successful investigations”**
   section (milestone B).

**Do not** skip fresh tool execution at answer time when using hints only.

### Warm-start (optional milestone C)

If the best match exceeds a **stricter** threshold `QA_PLAYBOOK_WARM_START_SIMILARITY` (default
**0.92**) **and** the playbook passed §Staleness validation:

1. Execute iteration 1 tool calls from `steps` with placeholder resolution **deterministically**
   (no planner LLM for iteration 1).
2. Merge results into the evidence pool; compute confidence.
3. If `confidence >= QA_AGENT_MIN_CONFIDENCE`, jump to final answer.
4. Else continue with planner from iteration 2.

Warm-start is **off by default** until milestone C eval proves precision gain > false-route cost.

### Staleness and re-index invalidation (normative)

Playbooks go stale when anchors no longer exist in the active index.

| Event | Action |
|---|---|
| Re-index removes / renames `file_path` | Soft-delete playbooks referencing that path (`status = 'D'`) |
| `graph_node_id` missing | Anchor validation skips the playbook; re-index invalidation soft-deletes paths changed by embed |
| Chunk ids in trace | Ignored for matching — only anchors matter |

**Validation on use:** before hint injection and warm-start, verify `evidence_anchors` against
active `graph_nodes` / `code_chunks` for the project. Invalid playbooks are skipped silently.

`run_embed.py` calls `invalidate_playbooks_for_files` after embedding changed chunks, using their
file paths — the same incremental footprint as distillation stale marking (ADR 0025 pattern).

### Caps and deduplication (5M LOC posture)

| Constant | Default | Purpose |
|---|---|---|
| `QA_PLAYBOOK_MAX_PER_PROJECT` | `500` | Hard cap on active playbooks |
| `QA_PLAYBOOK_MIN_SIMILARITY` | `0.85` | Retrieve hints |
| `QA_PLAYBOOK_WARM_START_SIMILARITY` | `0.92` | Deterministic iteration 1 |
| `QA_PLAYBOOK_MERGE_SIMILARITY` | `0.95` | Merge new trace into existing vs create row |

When at cap: soft-delete the active playbook with lowest `success_count` and oldest
`last_success_at` before insert.

When a new trace matches an existing playbook at merge similarity: increment `success_count`,
refresh `last_success_at`, optionally merge shorter step paths (keep fewer steps if same success
rate — implementation detail documented in `services/qa/playbooks.py`).

### Planner prompt injection (milestone B — normative example)

```text
Past successful investigations for similar questions in this project:
1. (similarity 0.91, used 7 times) "how is EMI calculated?"
   Steps: search_symbols("getMinEmi") → graph_expand(node) → read_symbol("LoanService.doCalc")
   Anchors: src/loan.utils.ts, backend/services/loan.service.ts
Use these as hints only. You must still call tools and cite fresh evidence.
```

### Relationship to expert answers

| Mechanism | Stores | Trust at answer time |
|---|---|---|
| **Expert answers** (ADR 0025 / Phase 5) | Factual overrides | Authoritative — can override inference |
| **QA playbooks** (this ADR) | Retrieval strategy | Non-authoritative — hints only; evidence required |

A playbook must **not** short-circuit the expert-question or abstain paths.

### Implementation milestones

| Milestone | Deliverable | Outcome |
|---|---|---|
| **P1** | `investigation_trace` on `messages` + engine writes trace | **Complete** |
| **P2** | `qa_playbooks` table + promotion on successful messages | **Complete** — synchronous promotion after grounded answers |
| **P3** | Similarity search + planner hint injection | **Complete** |
| **P4** | Invalidation on embed + anchor validation | **Complete** |
| **P5** | Warm-start (`QA_PLAYBOOK_WARM_START_ENABLED`, default `false`) | **Complete** — disabled by default pending real-world evaluation |
| **P6** | Admin/debug API `GET /projects/:id/playbooks` | **Deferred / optional** |

### Contracts and docs

- Add `InvestigationTrace` schema to `contracts/openapi.engine.yaml` (or shared JSON schema).
- Extend Node message persistence types after codegen.
- Update `docs/data-model.md` §2.5 and add `docs/schema/qa_playbooks.md` in the **same PR** as
  migration (per `data-model.mdc`).

### Testing requirements

- Unit: promotion rules L1–L5, merge at cap, anchor invalidation.
- Integration: similar question retrieves hint; answer still cites fresh chunks.
- Regression: warm-start false positive rate on paraphrased unrelated questions below agreed threshold.
- ≥ 80% line + branch coverage on new `services/qa/playbooks/` module.

---

## Consequences

### Positive

- **Lower latency** on repeated question classes — planner skips trial-and-error.
- **Higher accuracy at 5M LOC** — investigation depth scales without rediscovering paths.
- **Auditable** — playbooks are inspectable rows, unlike opaque prompt state.
- **Stays self-hosted** — pgvector similarity on playbooks uses existing TEI + Postgres (ADR 0004).

### Negative

- **Schema + migration** — new table, column, HNSW index storage (~small vs code chunks).
- **Stale playbook risk** — mitigated by invalidation; still requires careful testing after refactors.
- **Wrong-hint risk** — similarity 0.85–0.91 band may suggest irrelevant paths; warm-start gated higher.
- **Operational surface** — caps, merge logic, debug APIs.

### Storage estimate (order of magnitude)

- 500 playbooks × ~2 KB JSON + 1024-dim halfvec ≈ **negligible** vs code chunk vectors at 5M LOC.
- Not a driver of Machine 1 sizing from ADR 0004.

---

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Fine-tune planner model on traces** | Ops-heavy; violates thin-layer posture; not required for v1 |
| **Global playbooks across projects** | Codebases differ; cross-project hints unsafe |
| **Store full answer text in playbook** | Stale answers violate NFR-7; evidence must be fresh |
| **Learn from abstains** | Reinforces failure modes |
| **Reuse `graph_edges` for investigation paths** | Conflates code graph with QA metadata; query pollution |
| **Redis / external memory store** | ADR 0003 single datastore |
| **Always warm-start from best match** | High false-route risk; hints safer default |

---

## Escape hatch

- Disable warm-start (`QA_PLAYBOOK_WARM_START_ENABLED=false`) while keeping hints.
- Disable learning entirely (`QA_PLAYBOOK_LEARNING_ENABLED=false`) without disabling ADR 0026 agent.
- If pgvector similarity on playbooks is too slow, add trigram pre-filter on `canonical_question` before
  vector re-rank (same hybrid pattern as ADR 0020).
- Export/import playbooks as JSON for admin backup — does not require schema change.

---

## Resolutions recorded at acceptance

| # | Question | Owner / when |
|---|---|---|
| 1 | `QA_PLAYBOOK_MIN_SIMILARITY` default 0.85 — validate on real question paraphrase set | **Accepted as the shipping default; evaluation deferred** — no real paraphrase-set artifact exists yet. Tune after representative project questions are available |
| 2 | Soft-delete vs `stale_at` column for invalid playbooks | **Resolved** — soft-delete only (`status = 'D'`); no `stale_at` column (plan 10 + plan 12 invalidation) |
| 3 | Whether promotion runs synchronously post-answer or via `playbook_promote` job | **Resolved (plan 11/12)** — synchronous after successful answer in `agent_loop` (try/except; failure must not break SSE). Async `playbook_promote` job deferred unless sync latency becomes an issue |
| 4 | User feedback (thumbs up) as additional promotion signal — phase? | **Deferred** — v1 promotion uses L1–L5 only; feedback-driven reinforcement belongs to a later product phase |
| 5 | HNSW index per `project_id` vs global index with filter — benchmark at 500 playbooks × 10 projects | **Resolved** — one partial active-row HNSW index with `project_id` filtering in repository queries; revisit only if measured similarity latency regresses |
