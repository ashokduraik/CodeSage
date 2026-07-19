"""Engine query SSE endpoint."""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator, Iterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from generated.engine_api import EngineQueryRequest
from starlette.concurrency import iterate_in_threadpool

from config.logging import get_indexing_logger, log_event, sanitize_log_message
from services.qa.stream_answer import stream_engine_answer

router = APIRouter()
_logger = get_indexing_logger()


def _format_sse_chunk(payload: dict[str, object]) -> str:
    """Serialize one EngineAnswerChunk as an SSE ``data:`` line.

    @param payload - Chunk dict matching the OpenAPI EngineAnswerChunk shape.
    @returns SSE event string with trailing newlines.
    """
    return f"data: {json.dumps(payload)}\n\n"


@router.post("/engine/query")
def engine_query(request: Request, body: EngineQueryRequest) -> StreamingResponse:
    """Stream a grounded answer or abstain response as Server-Sent Events.

    Retrieves relevant code chunks, optionally calls vLLM, and streams JSON chunks back
    to the Node API proxy. Every answer path must cite sources or abstain (NFR-7).
    When the client disconnects mid-stream, generation stops and the upstream LLM
    connection is closed. Unexpected generator failures emit a terminal ``error`` chunk
    instead of bare TCP close so the Node proxy and UI can surface a meaningful message.

    @param request - FastAPI request carrying app state (settings, session factory).
    @param body - Validated query payload from ``contracts/openapi.engine.yaml``.
    @returns An SSE ``StreamingResponse`` of ``EngineAnswerChunk`` JSON objects.
    """
    settings = request.app.state.settings
    session_factory = request.app.state.session_factory
    history = (
        [{"role": turn.role.value, "content": turn.content} for turn in body.history]
        if body.history
        else None
    )
    prior_evidence = None
    if body.priorEvidence is not None:
        prior_evidence = body.priorEvidence.model_dump(by_alias=True, exclude_none=True)

    def sync_event_stream() -> Iterator[str]:
        """Bridge the QA service generator into an SSE byte stream for FastAPI.

        Wraps ``stream_engine_answer`` so an unexpected exception yields one
        ``error`` SSE event (and is logged) instead of tearing down the socket
        with no terminal chunk for the client.

        @yields Serialized ``EngineAnswerChunk`` JSON strings, one per SSE event.
        """
        try:
            yield from stream_engine_answer(
                settings,
                session_factory,
                question=body.question,
                project_id=body.projectId,
                audience=body.audience.value,
                repo_ids=body.repoIds,
                generate_title=body.generateTitle or False,
                history=history,
                prior_evidence=prior_evidence,
            )
        except Exception as exc:
            # Exception handlers cannot rewrite an in-flight StreamingResponse;
            # emit a contract terminal error event so Node/UI can fail loudly.
            log_event(
                _logger,
                logging.ERROR,
                "Engine query stream failed: "
                f"{sanitize_log_message(f'{type(exc).__name__}: {exc}')}",
            )
            yield _format_sse_chunk(
                {
                    "type": "error",
                    "code": "ENGINE_ERROR",
                    "content": "The answer engine failed while generating a reply.",
                }
            )

    async def event_stream() -> AsyncIterator[str]:
        """Yield SSE chunks until the client disconnects or the answer completes.

        Iterates the blocking QA generator in a thread pool and checks
        ``request.is_disconnected()`` after each chunk so a browser stop or tab
        close aborts vLLM generation promptly.

        @yields Serialized ``EngineAnswerChunk`` JSON strings, one per SSE event.
        """
        gen = sync_event_stream()
        try:
            async for chunk in iterate_in_threadpool(gen):
                yield chunk
                # Only stop *after* yielding the chunk. Checking before yield can discard
                # the first LLM tokens when a proxy briefly looks disconnected.
                if await request.is_disconnected():
                    break
        finally:
            gen.close()

    return StreamingResponse(event_stream(), media_type="text/event-stream")
