-- ADR 0027: investigation traces on messages + qa_playbooks for learned retrieval paths.
-- Soft-delete only (no stale_at) — prefer status = 'D' when anchors invalidate (plan 12).

-- migrate:up

ALTER TABLE messages ADD COLUMN investigation_trace jsonb;

CREATE TABLE qa_playbooks (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    canonical_question  text        NOT NULL,
    question_embedding  halfvec(1024),
    intent_profile      text        NOT NULL
                        CHECK (intent_profile IN ('symbol_lookup', 'conceptual', 'balanced')),
    steps               jsonb       NOT NULL,
    evidence_anchors    jsonb       NOT NULL,
    success_count       int         NOT NULL DEFAULT 1,
    last_success_at     timestamptz NOT NULL DEFAULT now(),
    source_message_id   uuid        REFERENCES messages (id) ON DELETE SET NULL,
    status              char(1)     NOT NULL DEFAULT 'A' CHECK (status IN ('A', 'D')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL REFERENCES users (id),
    updated_by          uuid        NOT NULL REFERENCES users (id)
);

CREATE TRIGGER trg_qa_playbooks_updated_at
  BEFORE UPDATE ON qa_playbooks FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE INDEX idx_qa_playbooks_project_active
    ON qa_playbooks (project_id, last_success_at DESC)
    WHERE status = 'A';

CREATE INDEX idx_qa_playbooks_question_embedding
    ON qa_playbooks
    USING hnsw (question_embedding halfvec_cosine_ops)
    WHERE status = 'A';

-- migrate:down

DROP INDEX IF EXISTS idx_qa_playbooks_question_embedding;
DROP INDEX IF EXISTS idx_qa_playbooks_project_active;
DROP TABLE IF EXISTS qa_playbooks;
ALTER TABLE messages DROP COLUMN IF EXISTS investigation_trace;
