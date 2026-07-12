-- migrate:up

-- Hybrid retrieval (ADR 0020): pg_trgm keyword search over code_chunks.content and
-- symbol name lookup over graph_nodes. No new tables.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_code_chunks_content_trgm ON code_chunks
    USING gin (content gin_trgm_ops)
    WHERE status = 'A';

CREATE INDEX idx_graph_nodes_name_trgm ON graph_nodes
    USING gin (name gin_trgm_ops)
    WHERE status = 'A';

CREATE INDEX idx_graph_nodes_symbol_lookup ON graph_nodes (project_id, kind, name)
    WHERE status = 'A' AND kind IN ('function', 'class', 'method');

-- migrate:down

DROP INDEX IF EXISTS idx_graph_nodes_symbol_lookup;
DROP INDEX IF EXISTS idx_graph_nodes_name_trgm;
DROP INDEX IF EXISTS idx_code_chunks_content_trgm;
