-- migrate:up

-- QA chat sessions and message turns (private per user, soft-deletable).
CREATE TABLE conversations (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    user_id     uuid        NOT NULL REFERENCES users (id),
    audience    text        NOT NULL CHECK (audience IN ('developer', 'end_user')),
    title       text,
    status      char(1)     NOT NULL DEFAULT 'A' CHECK (status IN ('A', 'D')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid        NOT NULL REFERENCES users (id),
    updated_by  uuid        NOT NULL REFERENCES users (id)
);

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE INDEX idx_conversations_user_active
    ON conversations (user_id, updated_at DESC)
    WHERE status = 'A';

CREATE INDEX idx_conversations_project_active
    ON conversations (project_id)
    WHERE status = 'A';

CREATE TABLE messages (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id  uuid        NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    role             text        NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content          text        NOT NULL,
    citations        jsonb,
    metrics          jsonb,
    needs_review     boolean     NOT NULL DEFAULT false,
    stopped          boolean     NOT NULL DEFAULT false,
    status           char(1)     NOT NULL DEFAULT 'A' CHECK (status IN ('A', 'D')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        NOT NULL REFERENCES users (id),
    updated_by       uuid        NOT NULL REFERENCES users (id)
);

CREATE TRIGGER trg_messages_updated_at
  BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE INDEX idx_messages_conversation_active
    ON messages (conversation_id, created_at)
    WHERE status = 'A';

-- migrate:down

DROP INDEX IF EXISTS idx_messages_conversation_active;
DROP TABLE IF EXISTS messages;
DROP INDEX IF EXISTS idx_conversations_project_active;
DROP INDEX IF EXISTS idx_conversations_user_active;
DROP TABLE IF EXISTS conversations;
