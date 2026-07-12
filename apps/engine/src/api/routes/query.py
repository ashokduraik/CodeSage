"""Engine query SSE endpoint."""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from generated.engine_api import EngineQueryRequest
from starlette.concurrency import iterate_in_threadpool

from services.qa.stream_answer import stream_engine_answer

router = APIRouter()


@router.post("/engine/query")
def engine_query(request: Request, body: EngineQueryRequest) -> StreamingResponse:
    """Stream a grounded answer or abstain response as Server-Sent Events.

    Retrieves relevant code chunks, optionally calls vLLM, and streams JSON chunks back
    to the Node API proxy. Every answer path must cite sources or abstain (NFR-7).
    When the client disconnects mid-stream, generation stops and the upstream LLM
    connection is closed.

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

    def sync_event_stream() -> Iterator[str]:
        """Bridge the QA service generator into an SSE byte stream for FastAPI.

        FastAPI's ``StreamingResponse`` expects an iterator of strings; this closure
        forwards each serialized chunk from ``stream_engine_answer`` without buffering
        the full answer in memory.

        @yields Serialized ``EngineAnswerChunk`` JSON strings, one per SSE event.
        """
        yield from stream_engine_answer(
            settings,
            session_factory,
            question=body.question,
            project_id=body.projectId,
            audience=body.audience.value,
            repo_ids=body.repoIds,
            generate_title=body.generateTitle or False,
            history=history,
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
                if await request.is_disconnected():
                    break
                yield chunk
        finally:
            gen.close()

    return StreamingResponse(event_stream(), media_type="text/event-stream")
