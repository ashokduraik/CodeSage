# RAG indexing logs

Canonical guide for **beginner-friendly, leak-free** logging in `apps/rag`. AI agents
and contributors must follow this when adding or changing logging.

## Uniform format (mandatory)

**Every** log line from the RAG process — application, indexing worker, uvicorn, and
watchfiles — must use:

```
TIMESTAMP  LEVEL  [RAG]  message
```

Example:

```
2026-07-04 16:59:43  INFO   [RAG]  Connected to PostgreSQL at localhost:5432/codesage_db
2026-07-04 16:59:43  INFO   [RAG]  Application startup complete.
```

- Configured in `config.logging.configure_logging()` — do not use uvicorn default logging.
- Start the service via `python -m api.run` (see `package.json` `dev:rag`) with
  `log_config=None`.
- Never mix formats like `INFO:     Uvicorn running…` alongside `[RAG]` lines.

## Where logs go

- **Stdout/stderr only** (terminal / `docker compose logs -f rag`).
- **Not** a database log table.

## Logger

- Module: [`apps/rag/src/config/logging.py`](../apps/rag/src/config/logging.py)
- Application logger name: `codesage.indexing`
- Always use `log_event()` and `sanitize_log_message()` — never `print()` or raw unsanitized strings.

## Context prefix (mandatory for indexing jobs)

Every job and pipeline step must include **project + repo** when `repoId` is in the payload:

```
project "My App" / repo github.com/org/repo (branch main)
```

Use `IndexingContext`, `resolve_indexing_context()`, and `format_indexing_context()` from
`config.logging` / `services.indexing.context`. When `repoId` is missing, use
`format_job_fallback_context(job_type)`.

## Startup queue summary (once per worker start)

After the worker thread starts, log:

1. Clone directory and poll interval (`Worker ready — clone directory …, poll every Ns`)
2. Pending job counts by type, or `Job queue: empty — attach a repo in the UI`
3. **WARN** when failed or stuck `running` jobs exist — header with type breakdown (`3 failed (1 embed, 2 sync)`) plus **one line per failed job** (up to 5), each including job type and step

Implemented in `services.indexing.startup_log.log_startup_queue_state()`.

### Job supersession and orphan reclaim

On each worker start:

1. **Orphan reclaim** — active `running` jobs → `pending` (or `failed` when attempts are exhausted). Runs once per worker process start, not before every claim.
2. **Stale reclaim** — jobs running longer than `WORKER_STALE_JOB_SECONDS` → `pending` or `failed`.

Manual re-index from the UI is blocked (**409**) while active jobs for that repo are younger than `WORKER_STALE_JOB_SECONDS`. When allowed, the API soft-deletes (`status = 'D'`) pending jobs for that `repoId` before enqueueing a new sync. Superseded rows are never claimed by the worker.

## Plain language

Map internal terms to user-facing copy:

| Internal | Log text |
|---|---|
| `sync` | Step 1/3 — downloading repository |
| `parse` | Step 2/3 — reading source files |
| `embed` | Step 3/3 — making code searchable |
| chunk | code section |
| embedding | search index / making searchable |
| sha | commit (7-char prefix via `short_commit()`) |

Every step logs **started**, **finished**, or **failed**. Durations in **seconds** (`took 7s`).

## Log ownership

| Event | Owner | Pattern |
|---|---|---|
| Job claimed / finished / failed | `workers/consumer.py` | `Job claimed — {context} — Step X/3 …` |
| Step detail | Service handler | `Step X/3 started/finished — …` |
| Git sub-steps | `services/sync/git_ops.py` | clone / fetch / commit / diff |
| Parse milestones | `services/parsing/run_parse.py` | every 10 files + final file at INFO |
| Handoff enqueue | Service handler | `Queued Step Y/3 — N items for {context}` |

## Edge cases (must log at INFO)

| Situation | Message |
|---|---|
| Embed job, no valid chunks | `Step 3/3 skipped — no valid code sections` |
| Parse, missing files on disk | `Skipped N files (not found on disk)` |
| Parse, zero sections | `No code sections created — skipping Step 3` |
| Embed batch, more remain | `Step 3/3 batch done — N sections remain` |
| Sync up to date | `repository is up to date … no files to read` |
| Private repo | `Using stored credentials for private repository` (never the token) |

## Failures (mandatory)

On any job failure:

1. `explain_failure()` in `config/errors.py` — plain English + fix hint (TEI hostname, `TOKEN_ENC_KEY`, detached repo, …)
2. `log_failure()` — one ERROR summary line **then** sanitized traceback lines (each prefixed `[RAG]`)
3. Persist explanation to `jobs.error_message` and `repos.last_error` via `mark_repo_indexing_failed()`
4. Append `repo_indexing_events` row (`phase=failed`, `failure_reason=explanation`)

Summary format: `Job failed — {job_type} {short_id} — {context} — Step X/3 {step}: {explanation}`

Embed step must log `Calling embedding service at {host}/embeddings` (not vague “Using embedding service”).

## Progress persistence

User-facing indexing timeline lives in `repo_indexing_events` (append-only, full history). Console `[RAG]` logs are ephemeral; DB events mirror the same step messages for UI later.

## Security — never log

- Repo tokens, `TOKEN_ENC_KEY`, JWT secrets, `HF_TOKEN`
- Authenticated git URLs (`build_authenticated_url` output)
- `DATABASE_URL` credentials
- File content or long excerpts

`sanitize_log_message()` redacts `ghp_…`, `glpat-…`, and `://user@host` URL patterns.

## Safe to log

- `safe_repo_label(url)` → `github.com/org/repo`
- Branch names, relative file paths, counts, short commit prefix
- Sanitized one-line error summaries from DB `error_message`

## Levels

| Level | Default | Content |
|---|---|---|
| `info` | yes | Step story — start, finish, queue, milestones |
| `debug` | optional | Per-file progress, skipped large files |
| `warning` | startup | Failed / stuck `running` jobs |
| `error` | on failure | Summary + sanitized traceback via `log_failure()` |

Env: `LOG_LEVEL=info` in `apps/rag/.env.example` (sync to `.env` per `env-example-sync.mdc`).

## Adding new logs

1. Import `get_indexing_logger`, `log_event` from `config.logging`.
2. Include `format_indexing_context()` when the activity is repo-scoped.
3. Run message through `log_event()` (sanitizes automatically).
4. Add tests asserting the message substring; add redaction test if handling errors.
5. Do not add loggers that bypass `configure_logging()` / the `[RAG]` format.

## Files that emit logs

| File | Responsibility |
|---|---|
| `api/run.py` | Configure logging before uvicorn starts |
| `api/main.py` | Service start / shutdown + queue summary |
| `config/startup.py` | DB connect success |
| `config/service_users.py` | Schema ready |
| `services/indexing/startup_log.py` | Worker ready + queue diagnostics |
| `workers/consumer.py` | Job claimed / finished / failed |
| `services/sync/git_ops.py` | Git clone/fetch sub-steps |
| `services/sync/run_sync.py` | Step 1 + handoff to parse |
| `services/parsing/run_parse.py` | Step 2 + milestones + handoff to embed |
| `services/embedding/run_embed.py` | Step 3 + completion |

