# ADR 0016: Repo probe runs in Node API

**Status:** Accepted

## Context

The connect-repository wizard must validate a clone URL, fetch branches and README
metadata, and detect auth requirements before the user confirms attach. This involves
fast HTTP calls to GitHub/GitLab REST APIs — not git clone or indexing work.

## Decision

Implement `POST /api/repos/probe` in `apps/api` (Node). The probe:

- Parses the URL and auto-detects provider (GitHub vs GitLab, including self-hosted).
- Calls provider REST APIs for repo metadata, top 5 branches, and README excerpt.
- Accepts an optional token for private-repo validation; **never stores or logs the token**.

Heavy git sync remains in the Python worker (`apps/rag`).

## Consequences

- Connect wizard gets immediate feedback without enqueueing jobs.
- Node stays within its non-blocking boundary (outbound HTTP only).
- Provider API rate limits apply to probe calls; acceptable for attach-time usage.

## Alternatives considered

- **Probe in Python RAG service:** Adds cross-service latency and couples UI flow to Python deploy.
- **Probe in the browser:** CORS blocks direct GitHub/GitLab API calls; exposes tokens to client-side storage risks.

## Escape hatch

If probe logic grows (e.g. SSH URL support, deep branch pagination), extract a shared
`repo-providers` module or move to Python behind a thin Node proxy — contracts unchanged.
