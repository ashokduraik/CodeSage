-- migrate:up

CREATE INDEX IF NOT EXISTS idx_audit_log_active_ts ON audit_log (ts DESC) WHERE status = 'A';

-- migrate:down

DROP INDEX IF EXISTS idx_audit_log_active_ts;
