# ADR 0028 — Follow-up QA context (rewrite + prior evidence)

- **Status:** Accepted
- **Date:** 2026-07-19
- **Depends on:** [ADR 0019](./0019-persist-chat-history-in-postgres.md),
  [ADR 0026](./0026-agent-orchestrated-developer-qa.md)
- **Related:** [ADR 0027](./0027-qa-investigation-playbooks.md), NFR-7 grounding

## Context

Multi-turn chat already sends text-only `history` (role + content) to the engine
([ADR 0019](./0019-persist-chat-history-in-postgres.md)). The agent planner
([ADR 0026](./0026-agent-orchestrated-developer-qa.md)) treats history as **not
evidence** — every code turn must call tools again. Vague follow-ups such as
*"I don't understand the second point from above"* therefore produce weak search
terms, fail the confidence gate, and abstain even when the previous turn already
cited the correct files.

Citations and `investigation_trace.evidenceAnchors` are already persisted on
assistant messages for the UI, but were never passed back to the engine.

## Decision

1. **Rewrite follow-ups.** When `QA_FOLLOWUP_CONTEXT_ENABLED` is on and history is
   non-empty (and the question is not a social greeting), rewrite the current
   question into a standalone form via a non-tool LLM completion before retrieval.
2. **Pass `priorEvidence` separately from history.** Node builds
   `PriorTurnEvidence` (citations + evidenceAnchors) from the last grounded
   assistant message and sends it on `EngineQueryRequest`. `ChatTurn` stays
   text-only.
3. **Local seed before global search.** Re-fetch prior citations via
   `read_chunks_for_path` (with `around_line` from span) and expand
   `graphNodeId` anchors via `graph_expand`. Add hits to the evidence pool and
   evaluate the confidence gate.
4. **Fall back to the normal planner** when local seed is empty or below the gate.
   The planner uses the **rewritten** question and full tools (including
   `search_hybrid`). Topic shifts are handled by this fallback.
5. **Precedence over playbook warm-start.** Follow-up seed runs first; playbook
   warm-start runs only when the pool is still empty after that step.
6. **NFR-7 unchanged.** Prior answer *prose* is never answer evidence. Only
   freshly re-fetched chunks in the pool may ground the final answer.

## Consequences

- **Positive:** Clarification follow-ups reuse the previous investigation’s
  anchors; fewer false abstains; often fewer planner iterations.
- **Positive:** Contracts-first `priorEvidence` keeps Node as the owner of
  `messages` (engine still does not read chat tables).
- **Negative:** One extra LLM call for rewrite on multi-turn turns (toggleable).
- **Negative:** Stale citations after re-index may fail seed; planner fallback
  still applies.

## Alternatives considered

- **Treat prior answer text as evidence:** rejected — violates NFR-7.
- **Engine reads `messages` from Postgres:** rejected — Node owns chat
  persistence (ADR 0019 / deployable boundary).
- **Playbook warm-start alone:** rejected — playbooks match *similar questions*,
  not “explain point 2 of the last turn,” and warm-start defaults off.

## Escape hatch

Set `QA_FOLLOWUP_CONTEXT_ENABLED=false` to restore the pre-0028 path (history
text only, no rewrite/seed). Seed caps live in `constants.py`
(`QA_FOLLOWUP_MAX_SEED_CITATIONS`, `QA_FOLLOWUP_MAX_GRAPH_EXPANDS`).
