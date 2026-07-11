"""RAG query SSE endpoint."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator, Iterator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from starlette.concurrency import iterate_in_threadpool

from repositories import create_session_factory
from services.qa.stream_answer import stream_rag_answer

router = APIRouter()


class ChatTurnBody(BaseModel):
    """One prior conversation turn sent to the LLM for multi-turn QA."""

    role: str = Field(pattern=r"^(user|assistant|system)$")
    content: str = Field(min_length=1)


class RagQueryBody(BaseModel):
    """Request body for POST /rag/query (mirrors contracts/openapi.rag.yaml)."""

    question: str = Field(min_length=1, max_length=8000)
    projectId: uuid.UUID
    audience: str
    repoIds: list[uuid.UUID] | None = None
    pageContext: str | None = Field(default=None, max_length=500)
    generateTitle: bool = False
    history: list[ChatTurnBody] | None = None


@router.post("/rag/query")
def rag_query(request: Request, body: RagQueryBody) -> StreamingResponse:
    """Stream a grounded answer or abstain response as Server-Sent Events.

    Retrieves relevant code chunks, optionally calls vLLM, and streams JSON chunks back
    to the Node API proxy. Every answer path must cite sources or abstain (NFR-7).
    When the client disconnects mid-stream, generation stops and the upstream LLM
    connection is closed.

    @param request - FastAPI request carrying app state (settings, session factory).
    @param body - Validated query payload from ``contracts/openapi.rag.yaml``.
    @returns An SSE ``StreamingResponse`` of ``RagAnswerChunk`` JSON objects.
    """
    settings = request.app.state.settings
    session_factory = request.app.state.session_factory
    history = (
        [{"role": turn.role, "content": turn.content} for turn in body.history]
        if body.history
        else None
    )

    def sync_event_stream() -> Iterator[str]:
        """Bridge the QA service generator into an SSE byte stream for FastAPI.

        FastAPI's ``StreamingResponse`` expects an iterator of strings; this closure
        forwards each serialized chunk from ``stream_rag_answer`` without buffering
        the full answer in memory.

        @yields Serialized ``RagAnswerChunk`` JSON strings, one per SSE event.
        """
        yield from stream_rag_answer(
            settings,
            session_factory,
            question=body.question,
            project_id=body.projectId,
            audience=body.audience,
            repo_ids=body.repoIds,
            generate_title=body.generateTitle,
            history=history,
        )

    async def event_stream() -> AsyncIterator[str]:
        """Yield SSE chunks until the client disconnects or the answer completes.

        Iterates the blocking QA generator in a thread pool and checks
        ``request.is_disconnected()`` after each chunk so a browser stop or tab
        close aborts vLLM generation promptly.

        @yields Serialized ``RagAnswerChunk`` JSON strings, one per SSE event.
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
