# Phase 3 — Freshness (webhooks + scheduled poll)

Implementation plan per [`final-solution.md` §12](../final-solution.md). Webhooks: [ADR 0017](../adr/0017-webhook-registration-on-connect.md);
scheduled poll: [ADR 0024](../adr/0024-freshness-scheduled-poll.md).

**Exit criteria:** Push to an attached repo triggers incremental re-index within minutes; scheduled poll catches drift when webhooks are disabled or missed.

**Out of scope for Phase 3:** marking derived-knowledge artifacts stale (Phase 4 distillation), expert loop (Phase 5).

---

## Milestones

### M1 — Webhook path (complete)

| Task | Module | Deliverables |
|---|---|---|
| Register push webhook on attach | `apps/api` `repo-webhook.service.ts` | ADR 0017 |
| Inbound push intake | `webhooks.service.ts` | HMAC verify, enqueue sync with `sinceSha` |
| Set `connecting` before enqueue | `webhooks.service.ts` + `run_sync.py` | UI reflects in-progress sync |

**Done when:** Push to configured branch enqueues `sync` with `trigger: webhook_push`.

### M2 — Incremental re-index pipeline (complete)

| Task | Module | Deliverables |
|---|---|---|
| `git diff` vs `last_indexed_sha` | `services/sync/git_ops.py` | Changed files only |
| Re-parse / re-embed changed files | `run_parse.py`, `run_embed.py` | Upsert chunks, graph cleanup |
| Cross-repo edges refresh | `xrepo_enqueue.py` | Re-queue `xrepo` after embed |

**Done when:** Webhook or poll sync advances `last_indexed_sha` without full re-clone.

### M3 — Scheduled poll fallback (ADR 0024)

| Task | Module | Deliverables |
|---|---|---|
| `git ls-remote` head check | `services/sync/git_ops.py` | `resolve_remote_head` |
| Poll indexed repos | `services/freshness/poll_repos.py` | Enqueue `cron_poll` sync |
| Background poller thread | `workers/freshness_poller.py` | Interval from `FRESHNESS_POLL_*` |
| Project `stale` lifecycle | `poll_repos.py` + `run_sync.py` | UI shows drift before sync starts |

**Done when:** Remote HEAD diverges from `last_indexed_sha` → project `stale` → sync enqueued within one poll interval.

---

## Definition of Done (Phase 3)

- [ ] Exit criteria met manually (webhook push + poll fallback).
- [x] `cron_poll` trigger in contracts + migration + codegen.
- [x] Poller enqueues incremental sync; skips repos with active sync jobs.
- [x] Webhook intake sets `connecting` and enqueues with `sinceSha`.
- [x] UI polls repo list during `indexing` / `connecting` / `stale`.
- [x] `FRESHNESS_POLL_*` and `WEBHOOK_BASE_URL` documented in `.env.example`.
- [x] Tests ≥ 80% on touched packages.
- [x] `TODO.md` / `README.md` updated in `apps/api`, `apps/engine`, `apps/web`.

---

## Manual verification

1. Set `WEBHOOK_BASE_URL` (tunnel URL for local dev); attach repo with token → `webhookEnabled=true`.
2. Push a commit → repo shows `connecting` → indexing logs show `webhook_push` → `lastIndexedAt` updates.
3. Disable webhooks or block callbacks → after `FRESHNESS_POLL_INTERVAL_SECONDS`, `cron_poll` job runs and index catches up.

---

## References

- [`final-solution.md` §6.2](../final-solution.md) — continuous freshness
- [`adr/0017-webhook-registration-on-connect.md`](../adr/0017-webhook-registration-on-connect.md)
- Phase 2 plan: [`phase-2-multi-repo.md`](./phase-2-multi-repo.md)
