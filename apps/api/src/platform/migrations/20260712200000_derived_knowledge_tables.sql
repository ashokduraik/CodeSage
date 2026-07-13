-- Phase 4: derived product knowledge tables (ADR 0025).
-- workflows, page_map, permission_rules, data_flows with confidence + citations.

-- migrate:up

CREATE TABLE workflows (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id         uuid        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    name               text        NOT NULL,
    steps              jsonb       NOT NULL DEFAULT '[]'::jsonb,
    confidence         numeric     NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    source_refs        jsonb       NOT NULL DEFAULT '[]'::jsonb,
    is_stale           boolean     NOT NULL DEFAULT false,
    is_expert_override boolean     NOT NULL DEFAULT false,
    status             char(1)     NOT NULL DEFAULT 'A' CHECK (status IN ('A', 'D')),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid        NOT NULL REFERENCES users (id),
    updated_by         uuid        NOT NULL REFERENCES users (id)
);

CREATE INDEX idx_workflows_project_id ON workflows (project_id);
CREATE INDEX idx_workflows_active ON workflows (project_id) WHERE status = 'A';
CREATE INDEX idx_workflows_stale ON workflows (project_id) WHERE status = 'A' AND is_stale = true;

CREATE TRIGGER trg_workflows_updated_at
    BEFORE UPDATE ON workflows
    FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE TABLE page_map (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id         uuid        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    route              text        NOT NULL,
    components         jsonb       NOT NULL DEFAULT '[]'::jsonb,
    data_sources       jsonb       NOT NULL DEFAULT '[]'::jsonb,
    confidence         numeric     NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    source_refs        jsonb       NOT NULL DEFAULT '[]'::jsonb,
    is_stale           boolean     NOT NULL DEFAULT false,
    is_expert_override boolean     NOT NULL DEFAULT false,
    status             char(1)     NOT NULL DEFAULT 'A' CHECK (status IN ('A', 'D')),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid        NOT NULL REFERENCES users (id),
    updated_by         uuid        NOT NULL REFERENCES users (id)
);

CREATE INDEX idx_page_map_project_id ON page_map (project_id);
CREATE INDEX idx_page_map_active ON page_map (project_id) WHERE status = 'A';
CREATE INDEX idx_page_map_stale ON page_map (project_id) WHERE status = 'A' AND is_stale = true;

CREATE TRIGGER trg_page_map_updated_at
    BEFORE UPDATE ON page_map
    FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE TABLE permission_rules (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id         uuid        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    target             text        NOT NULL,
    required_permission text       NOT NULL,
    confidence         numeric     NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    source_refs        jsonb       NOT NULL DEFAULT '[]'::jsonb,
    is_stale           boolean     NOT NULL DEFAULT false,
    is_expert_override boolean     NOT NULL DEFAULT false,
    status             char(1)     NOT NULL DEFAULT 'A' CHECK (status IN ('A', 'D')),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid        NOT NULL REFERENCES users (id),
    updated_by         uuid        NOT NULL REFERENCES users (id)
);

CREATE INDEX idx_permission_rules_project_id ON permission_rules (project_id);
CREATE INDEX idx_permission_rules_active ON permission_rules (project_id) WHERE status = 'A';
CREATE INDEX idx_permission_rules_stale ON permission_rules (project_id) WHERE status = 'A' AND is_stale = true;

CREATE TRIGGER trg_permission_rules_updated_at
    BEFORE UPDATE ON permission_rules
    FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE TABLE data_flows (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id         uuid        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    page_ref           text        NOT NULL,
    source_chain       jsonb       NOT NULL DEFAULT '[]'::jsonb,
    freshness_type     text        NOT NULL CHECK (
        freshness_type IN ('sync', 'async', 'cached', 'polled', 'event-driven')
    ),
    confidence         numeric     NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    source_refs        jsonb       NOT NULL DEFAULT '[]'::jsonb,
    is_stale           boolean     NOT NULL DEFAULT false,
    is_expert_override boolean     NOT NULL DEFAULT false,
    status             char(1)     NOT NULL DEFAULT 'A' CHECK (status IN ('A', 'D')),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid        NOT NULL REFERENCES users (id),
    updated_by         uuid        NOT NULL REFERENCES users (id)
);

CREATE INDEX idx_data_flows_project_id ON data_flows (project_id);
CREATE INDEX idx_data_flows_active ON data_flows (project_id) WHERE status = 'A';
CREATE INDEX idx_data_flows_stale ON data_flows (project_id) WHERE status = 'A' AND is_stale = true;

CREATE TRIGGER trg_data_flows_updated_at
    BEFORE UPDATE ON data_flows
    FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

-- migrate:down

DROP TRIGGER IF EXISTS trg_data_flows_updated_at ON data_flows;
DROP TABLE IF EXISTS data_flows;

DROP TRIGGER IF EXISTS trg_permission_rules_updated_at ON permission_rules;
DROP TABLE IF EXISTS permission_rules;

DROP TRIGGER IF EXISTS trg_page_map_updated_at ON page_map;
DROP TABLE IF EXISTS page_map;

DROP TRIGGER IF EXISTS trg_workflows_updated_at ON workflows;
DROP TABLE IF EXISTS workflows;
