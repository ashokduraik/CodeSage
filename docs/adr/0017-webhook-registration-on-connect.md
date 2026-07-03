# ADR 0017: Webhook registration during repo connect

**Status:** Accepted

## Context

CodeSage must re-index repositories within minutes of a push (NFR-5). Webhooks are the
primary freshness trigger; a scheduled poll is a future fallback. Users should not manually
configure provider webhooks after connecting a repo.

## Decision

During `POST /projects/:id/repos` (attach), the Node API **best-effort registers** a push
webhook with the provider when:

1. `WEBHOOK_BASE_URL` is configured (public URL of this CodeSage instance).
2. The user supplied a token with sufficient scope (`repo` on GitHub, `api` on GitLab).
3. The token can administer hooks on the target repository.

Implementation details:

- Per-repo random webhook secret → encrypted at rest (`webhook_secret_enc`, same AES-256-GCM
  scheme as `token_enc`).
- Callback URL: `{WEBHOOK_BASE_URL}/api/webhooks/{provider}` (public route, HMAC/token verified).
- Inbound push on the configured branch enqueues a `sync` job with `sinceSha`.
- On detach, best-effort delete the provider hook.
- **Registration failure does not block attach** — `webhook_enabled=false`; user can re-index manually.

## Consequences

- Auto-sync works out of the box for repos the user can admin, when `WEBHOOK_BASE_URL` is reachable by the provider.
- Self-hosted GitLab requires the instance to reach `WEBHOOK_BASE_URL` (often internal VPN/DNS).
- Public repos without a token skip webhook registration (no manual token step in the wizard).

## Alternatives considered

- **Manual webhook setup in UI:** Poor UX; error-prone.
- **Org-level webhooks:** Broader scope; deferred until multi-repo org connect is needed.
- **Polling-only freshness:** Simpler but misses NFR-5 latency target.

## Escape hatch

Add org-level hooks or a dedicated webhook admin screen if per-repo registration becomes
noisy; keep inbound handler and job enqueue path unchanged.
