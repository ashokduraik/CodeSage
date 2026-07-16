# Plan 10 — Playbooks schema & migration

**ADR:** [0027](../../adr/0027-qa-investigation-playbooks.md)  
**Depends on:** [05](./05-agent-loop-and-stream-replace.md)  
**Blocks:** plans 11–12  

---

## Goal

Add PostgreSQL tables/columns for investigation traces and playbooks. Node auto-migrates on startup.

---

## Migration

**File:** `apps/api/src/platform/migrations/YYYYMMDDHHMMSS_qa_playbooks_investigation_trace.sql`

Use `_TEMPLATE.sql` audit columns + `status char(1)`.

### `messages` alteration

```sql
ALTER TABLE messages ADD COLUMN investigation_trace jsonb;
```

Nullable — only assistant messages from agent path.

### `qa_playbooks` table

Columns per ADR 0027:

- `id uuid PK`
- `project_id uuid NOT NULL REFERENCES projects(id)`
- `canonical_question text NOT NULL`
- `question_embedding halfvec(1024)` — dimension matches `EMBEDDING_DIMENSION` / `code_chunks`
- `intent_profile text NOT NULL`
- `steps jsonb NOT NULL`
- `evidence_anchors jsonb NOT NULL`
- `success_count int NOT NULL DEFAULT 1`
- `last_success_at timestamptz NOT NULL DEFAULT now()`
- `source_message_id uuid REFERENCES messages(id)`
- audit columns + `status`

**Indexes:**

- `idx_qa_playbooks_project_active` on `(project_id, last_success_at DESC) WHERE status = 'A'`
- HNSW on `question_embedding` with `WHERE status = 'A'` — use same ops as `code_chunks` migration

---

## Engine models & repositories

**Single file preferred:** `apps/engine/src/repositories/qa_playbooks.py` (&lt; 1000 lines)

- `QaPlaybookRepository` — insert, list_active, similarity_search, soft_delete, count_active
- ORM model in `apps/engine/src/models/qa_playbook.py` **only if** models stay one-table-per-file;
  otherwise add to existing models module per engine convention

Check `apps/engine/src/models/` pattern before adding.

---

## Wire trace emission (engine)

**File:** `apps/engine/src/services/qa/agent_loop.py`

- Build `InvestigationTrace` dict (contract shape from plan 01)
- Include in SSE `metrics` as optional `investigationTrace` field **or** separate terminal event —
  pick one and document in OpenAPI in same PR

**Node:** `chat.service.ts` — persist `investigation_trace` on assistant message insert when present
in accumulated stream.

---

## Tests

| Layer | File | Cases |
|---|---|---|
| API migration | Manual / existing migrate tests | Migration applies up |
| Engine repo | `tests/repositories/test_qa_playbooks.py` | CRUD, soft delete, similarity with fake embeddings |
| Node | `chat.service.test.ts` | Persists investigation_trace when in payload |

```bash
cd apps/engine && uv run pytest tests/repositories/test_qa_playbooks.py -q
npm run test -w @codesage/api -- chat.service
```

**No E2E** until plan 11 promotes playbooks.

---

## Documentation (same PR — mandatory)

| Doc | Action |
|---|---|
| `docs/data-model.md` | §2.5 add `qa_playbooks` |
| `docs/schema/qa_playbooks.md` | **Create** full column reference |
| `docs/schema/messages.md` | `investigation_trace` column documented |
| `docs/schema/README.md` | Index row for `qa_playbooks` |

---

## Definition of Done

- [ ] Migration applied via Node startup
- [ ] Schema docs synced
- [ ] Engine writes trace; Node persists to `messages.investigation_trace`
- [ ] Repository tests pass
- [ ] **No** playbook promotion yet (plan 11)

---

## Rollback

`migrate:down` drops `qa_playbooks` and column (if down written).
