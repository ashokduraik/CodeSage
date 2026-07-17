# Agent QA accuracy follow-up — execution overview

Parent index: [README.md](./README.md). Implements the EMI false-abstain fix package **without a
new ADR** (stays inside [ADR 0026](../../adr/0026-agent-orchestrated-developer-qa.md)).

## Plans

| Order | Plan | Primary files | Removes |
|---|---|---|---|
| 1 | [14 — Span-aware path evidence](./14-span-aware-path-evidence.md) | `tools.py`, `prompts.py` | `scores={"path": 1.0}` |
| 2 | [15 — Gate coupling & honest abstain](./15-agent-loop-gate-coupling.md) | `agent_loop.py`, `prompts.py` | Single misleading abstain string |
| 3 | [16 — Evidence confidence accuracy](./16-evidence-confidence-accuracy.md) | `agent_loop.py`, `hybrid_confidence.py`, goldens | Hard-coded `symbol_refs=[]` |

## Why this order

1. **14** puts the formula region in the pool / final prompt (biggest answer-quality win).
2. **15** stops idle iterations and clarifies abstain when evidence existed.
3. **16** makes the 0.8 gate credit real symbol/excerpt signal so answerable hits pass.

## ADR

- **No new ADR** for 14–16 as specified.
- **Write a new ADR** only if plan 16 would add a below-threshold bypass or LLM-owned confidence
  (out of scope by default).

## PR strategy

- Prefer **one PR per plan**.
- Acceptable: 14+15 together if both stay reviewable; land **16 alone** with goldens.
