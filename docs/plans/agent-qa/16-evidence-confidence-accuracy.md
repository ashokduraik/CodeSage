# Plan 16 — Evidence confidence accuracy (deterministic gate)

**ADR:** [0026](../../adr/0026-agent-orchestrated-developer-qa.md) escape hatch (weights / scoring;
**no new ADR** unless gate semantics change — see §ADR gate)  
**Depends on:** [14](./14-span-aware-path-evidence.md), [15](./15-agent-loop-gate-coupling.md)  
**Blocks:** none (closes accuracy follow-up series)  
**Status:** Planned  
**Goal theme:** Raise answer accuracy by making the **0.8 gate** reflect answerable code evidence
(symbol refs, excerpt–term overlap, path-hit scoring) — without LLM self-confidence and without
lowering the threshold as the first move.

---

## Problem (observed)

Even with `getEMIAmount` in the pool:

1. `hits_to_retrieval_matches` sets `symbol_refs=[]`, so `_symbol_exactness` never boosts on name match.
2. Path / unscored hits get synthetic `fused = 0.01` and no keyword/symbol legs.
3. Composite confidence normalizes fused RRF against theoretical **3-leg** max → single-leg or
   diluted EMI hits often land **&lt; 0.8** → abstain despite correct citations.
4. Hybrid noise (Angular `*.module.ts` stubs) dilutes ranking legs.

ADR 0026 escape hatch: tune weights / threshold — **not** LLM judgment. This plan prefers
**smarter deterministic inputs** before any threshold change.

---

## Goal

1. Pass real `symbol_refs` from chunks into confidence scoring.
2. Score path / drill-down hits via **excerpt–term overlap** (and optional inherit from prior
   hybrid hit for the same `chunk_id` / file).
3. Keep `QA_AGENT_MIN_CONFIDENCE = 0.8` unless goldens prove still too strict after (1)–(2).
4. Add EMI-style golden that **answers** (not abstains) with scripted tools + realistic scores.
5. Keep hard abstain for UI-only / vector-only weak pools.

---

## ADR gate (read before coding)

| Change | New ADR? |
|---|---|
| Pass `symbol_refs`; excerpt overlap component; path score inheritance; weight tweaks | **No** — still app-owned `compute_hybrid_confidence` family |
| Lower `QA_AGENT_MIN_CONFIDENCE` after goldens | **No** — documented escape hatch; update constants + README |
| Second pass rule: “answer if regex finds formula even when score &lt; 0.8” | **Yes — stop and write ADR** before merging |
| Planner/LLM declares confidence to pass gate | **Forbidden** (ADR 0026) |

Default for this plan: **no new ADR**.

---

## Out of scope

- Path windowing mechanics (plan 14) — consume its outputs.
- Nudge / abstain copy (plan 15).
- Reranker revival / new datastore.
- Changing playbook L1 threshold independently (still uses same min confidence).

---

## Code changes

### 1. Carry `symbol_refs` on tool hits — `tools.py` + `QaToolHit`

**Option A (preferred):** add field to `QaToolHit`:

```python
symbol_refs: list[Any] = field(default_factory=list)
```

Populate in `_hit_from_chunk` from `chunk.symbol_refs` (JSONB list).

**Option B:** stash under `scores` — **reject** (wrong type; pollutes floats).

Update `hits_to_retrieval_matches` in `agent_loop.py`:

```python
chunk = SimpleNamespace(
    ...
    symbol_refs=list(hit.symbol_refs or []),
)
```

Remove the hard-coded `symbol_refs=[]`.

### 2. Excerpt–term overlap scoring — new helper

**Preferred location:** `apps/engine/src/services/retrieval/hybrid_confidence.py`
(or small `evidence_scores.py` under `services/qa/` if you want QA-only — prefer retrieval module
to keep one confidence story).

```python
def excerpt_term_overlap(excerpt: str, terms: list[str]) -> float:
    """Return [0, 1] overlap of query terms found in excerpt (case-insensitive)."""
```

Rules:

- Empty terms → `0.0`
- Count distinct terms that appear as substrings / word boundaries in excerpt
- Score = matched / len(terms), capped at 1.0

Use inside `_symbol_exactness` **or** as a fifth weighted component.

**Recommended (minimal formula change):** fold into `_symbol_exactness`:

```text
leg_score = max(symbol_score, keyword_score, excerpt_term_overlap(...))
# then existing +0.25 if symbol_ref name in terms
```

This avoids rebalancing four weights immediately. Document in docstring.

### 3. Path / unscored hit scoring — `tools.py` + `agent_loop.py`

When building path-window hits (plan 14):

1. Compute `overlap = excerpt_term_overlap(excerpt, extract_search_terms(question))` — **problem:**
   tools do not receive the user question today.

**Fix (pick one):**

| Approach | Pros | Cons |
|---|---|---|
| **A.** Pass optional `query` / `terms` into `execute_tool` / path tool from agent loop | Accurate overlap vs user question | Signature change |
| **B.** Score only in `hits_to_retrieval_matches` / `evaluate_evidence_confidence` using request `terms` + hit.excerpt | No tool signature change; **preferred** | Path tool still returns empty scores until conversion |

**Preferred: B** — in `hits_to_retrieval_matches` or immediately inside `evaluate_evidence_confidence`:

- For each hit, if `symbol`/`keyword`/`fused` all missing/weak, set synthetic keyword-like signal:

  `overlap = excerpt_term_overlap(hit.excerpt, terms)`  
  store as `keyword_score = max(existing, overlap)` for confidence only (do not invent fake fused
  RRF beyond existing synthetic floor).

- If hit already has strong hybrid legs, leave scores unchanged.

Also: when converting, if `fused` is None and overlap &gt; 0:

```text
fused = max(leg, overlap * small_scale, 0.01)
```

Tune `small_scale` in tests so a clear `getEMIAmount` + terms `["EMI"]` excerpt can contribute
meaningfully without letting random files pass.

### 4. Optional inherit scores for same `chunk_id`

If pool already has a hybrid hit for `chunk_id` and path read re-adds… EvidencePool **dedupes** by
`chunk_id`, so re-add is dropped. Inheritance matters when path returns **neighbor** chunks:

- For neighbors on same `file_path` as a high-fused pool hit, boost neighbor overlap score by
  `+0.1` capped (deterministic), documented as “file-anchor proximity.”

Keep this optional if tests show EMI passes without it after (1)–(3).

### 5. Threshold / weights — only if goldens still fail

**File:** `apps/engine/src/config/constants.py`

| Knob | Action |
|---|---|
| `QA_AGENT_MIN_CONFIDENCE` | Keep `0.8` unless G2/EMI golden still fails after scoring fixes |
| `RETRIEVAL_CONFIDENCE_WEIGHT_*` | Prefer slight ↑ symbol weight over lowering threshold |

Record any change in PR description + engine README. Still **no new ADR**.

### 6. Do **not** add gate bypass

No “if excerpt contains `Math.pow` then pass.” That needs an ADR.

---

## Removal / cleanup

| Remove | Why |
|---|---|
| `symbol_refs=[]` hard-code in `hits_to_retrieval_matches` | Wrong; hides exactness boost |
| Any leftover `path: 1.0` handling if still present | Plan 14 should have removed; verify |
| Dead test helpers that assert empty symbol_refs | Update assertions |
| Unused imports after scoring refactor | Standard cleanup |

Grep:

```bash
rg "symbol_refs=\[]" apps/engine/src
rg "path.: 1" apps/engine/src/services/qa
```

---

## Doc changes

| File | Change |
|---|---|
| `docs/plans/agent-qa/README.md` | Register plan 16 Complete when done |
| `apps/engine/TODO.md` | Confidence accuracy + EMI golden checkboxes |
| `apps/engine/README.md` | Document: confidence uses symbol_refs + excerpt overlap; threshold still 0.8 unless noted |
| `docs/plans/agent-qa/08-engine-agent-tests.md` | Extend golden matrix with G2b EMI formula answer expectation |
| ADR 0026 | **No rewrite** unless threshold philosophy changes; optional note in README only |

---

## Tests

### `test_hybrid_confidence.py` / new `test_excerpt_term_overlap.py`

| Test | Expect |
|---|---|
| `test_excerpt_term_overlap_matches_emi` | excerpt with `getEMIAmount` / `EMI`, terms `["EMI"]` → high overlap |
| `test_excerpt_term_overlap_empty_terms` | `0.0` |
| `test_symbol_exactness_boosts_on_symbol_refs` | match with `symbol_refs=[{"name":"getEMIAmount"}]`, terms include that name → boost |
| `test_hard_vector_fail_still_blocks_weak_vector_only` | Unchanged behavior |

### `test_agent_loop.py`

| Test | Expect |
|---|---|
| `test_hits_to_retrieval_matches_preserves_symbol_refs` | refs flow through |
| `test_evaluate_evidence_confidence_passes_with_emi_formula_excerpt` | Pool hit with formula excerpt + terms `["EMI"]` + moderate keyword/symbol → `passes is True` at min 0.8 **or** document required leg scores |

### `test_agent_qa_golden.py`

| ID | Question / script | Expect |
|---|---|---|
| G2 (update) | `how is EMI calculated?` | Not only “citation exercised” — assert **no abstain**, citations include loan utils, `metrics.evidenceConfidence >= 0.8` when using realistic scores |
| G2b (new) | Script: `search_hybrid` → `read_chunks_for_path` with `around_line` near formula | Formula excerpt in pool; answer path (mock final LLM); no abstain |
| G5 | unknown concept | Still abstains (empty / weak) |
| G-neg (new) | Hits only `emi-calculator.module.ts` empty export + weak vector | Gate fails / abstain — anti-regression for UI noise |

Update fixture chunks so `loan.utils.ts` includes a late-span formula chunk with `symbol_refs`
containing `getEMIAmount` / `getEMIAmount`-like name.

### Coverage

```bash
cd apps/engine && uv run pytest \
  tests/services/test_hybrid_confidence.py \
  tests/services/test_agent_loop.py \
  tests/services/test_agent_qa_golden.py \
  --cov=services.qa --cov=services.retrieval.hybrid_confidence \
  --cov-branch --cov-fail-under=80
```

---

## Definition of Done

- [ ] `symbol_refs` preserved from DB → hit → confidence.
- [ ] Excerpt–term overlap contributes to exactness (or documented fifth weight).
- [ ] Path/unscored hits no longer rely on fake `path: 1.0`; scored via overlap at gate time.
- [ ] `QA_AGENT_MIN_CONFIDENCE` still 0.8 **or** explicitly tuned with golden justification.
- [ ] G2/G2b answer; G5 + UI-noise negative still abstain.
- [ ] No gate bypass without ADR; no LLM confidence.
- [ ] Docs/TODO/README/plan index updated; unwanted hard-codes removed.

---

## Suggested implementation order inside this plan

1. `symbol_refs` plumbing + unit tests (safe, isolated).  
2. `excerpt_term_overlap` + fold into exactness + EMI confidence unit test.  
3. Golden G2/G2b + negative UI-noise.  
4. Only then consider weight/threshold nudge if still failing.

---

## Pitfalls

- Overlap on short acronyms (`EMI`) may match too many files — combine with existing hard_vector_fail
  and require at least one non-trivial fused/hybrid or symbol leg when possible.
- Do not double-count overlap into retrieval weight and symbol weight aggressively (score inflation).
- Playbook promotion L1 still uses same confidence — better scores ⇒ more learning; ensure negatives
  do not promote (still need non-abstain + citations).
