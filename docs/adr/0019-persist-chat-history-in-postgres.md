# ADR 0019: Persist chat history in PostgreSQL

**Status:** Accepted  
**Date:** 2026-07-11

## Context

Phase 1 chat stored conversations in browser `localStorage` (`chatStore.ts`). That meant no
cross-device resume, no audit trail, no server-side multi-turn history for the LLM, and partial
answers on “stop generation” were lost on refresh. The data model already reserved
`conversations` and `messages` tables (see `docs/schema/`).

## Decision

1. **Persist chat in PostgreSQL** using tables `conversations` and `messages` (migration
   `20260711120000_chat_conversations_messages.sql`), scoped **private per user** (`user_id`).
2. **Node owns persistence:** `POST /chat/query` inserts the user message, builds multi-turn
   `history` from stored messages, proxies SSE to RAG, accumulates the stream, and inserts the
   assistant message (including partial + `stopped` on client abort).
3. **Stop generation end-to-end:** web `AbortController` → Node `request.raw` close → abort
   upstream RAG fetch → RAG `request.is_disconnected()` closes the sync generator → vLLM stream
   ends.
4. **Multi-turn history:** Node sends `history: ChatTurn[]` on the internal RAG request; RAG
   inserts prior turns into the LLM prompt and trims **oldest** turns first when the context
   window is exceeded (`LLM_MAX_HISTORY_TURNS`, default 10).
5. **Contracts-first API:** `POST/GET/DELETE /conversations`, `GET /conversations/{id}/messages`,
   and `ChatQueryRequest { conversationId, question }` in `contracts/openapi.node.yaml`.

## Consequences

- **Positive:** Durable history, dashboard session counts, grounded follow-up questions, audit
  trail, stop keeps partial answers server-side.
- **Positive:** Single datastore (ADR 0003); no Redis/session broker.
- **Negative:** Larger Node chat module (repository + SSE accumulator); migration required on
  deploy.
- **Negative:** Existing browser `localStorage` conversations are **not** migrated (fresh start).

## Alternatives considered

- **Keep localStorage:** rejected — no server history, no audit, no multi-turn RAG.
- **Web persists via separate message APIs:** rejected — duplicate source of truth; lost
  messages on disconnect before client save.
- **Redis session store:** rejected for MVP per ADR 0003/0006.

## Escape hatch

If chat volume outgrows row storage, add pagination on `GET /conversations/{id}/messages`, archive
old conversations to cold storage, or introduce a purge ADR — without changing the API shape.
