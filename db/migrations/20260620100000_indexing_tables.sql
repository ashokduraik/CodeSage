-- migrate:up

-- Phase 1: code knowledge tables for parse/embed/RAG (see docs/data-model.md §2.2).
-- Requires pgvector (use the pgvector/pgvector Docker image or install pgvector locally).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE graph_nodes (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    repo_id     uuid        NOT NULL REFERENCES repos (id) ON DELETE CASCADE,
    kind        text        NOT NULL,
    name        text        NOT NULL,
    file_path   text,
    span        jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_graph_nodes_project_id ON graph_nodes (project_id);
CREATE INDEX idx_graph_nodes_repo_id    ON graph_nodes (repo_id);
CREATE INDEX idx_graph_nodes_file_path  ON graph_nodes (repo_id, file_path);

CREATE TABLE graph_edges (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    src_id      uuid        NOT NULL REFERENCES graph_nodes (id) ON DELETE CASCADE,
    dst_id      uuid        NOT NULL REFERENCES graph_nodes (id) ON DELETE CASCADE,
    kind        text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT graph_edges_distinct_endpoints CHECK (src_id <> dst_id)
);

CREATE INDEX idx_graph_edges_project_id ON graph_edges (project_id);
CREATE INDEX idx_graph_edges_src_id     ON graph_edges (src_id);
CREATE INDEX idx_graph_edges_dst_id     ON graph_edges (dst_id);

CREATE TABLE code_chunks (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   uuid        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    repo_id      uuid        NOT NULL REFERENCES repos (id) ON DELETE CASCADE,
    file_path    text        NOT NULL,
    span         jsonb       NOT NULL,
    content      text        NOT NULL,
    embedding    vector(1024),
    symbol_refs  jsonb       NOT NULL DEFAULT '[]'::jsonb,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_code_chunks_project_id ON code_chunks (project_id);
CREATE INDEX idx_code_chunks_repo_id    ON code_chunks (repo_id);
CREATE INDEX idx_code_chunks_file_path  ON code_chunks (repo_id, file_path);

CREATE INDEX idx_code_chunks_embedding ON code_chunks
    USING hnsw (embedding vector_cosine_ops);

-- migrate:down

DROP INDEX IF EXISTS idx_code_chunks_embedding;
DROP TABLE IF EXISTS code_chunks;
DROP TABLE IF EXISTS graph_edges;
DROP TABLE IF EXISTS graph_nodes;
