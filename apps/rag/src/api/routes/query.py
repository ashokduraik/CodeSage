"""RAG query SSE endpoint."""

from __future__ import annotations

import uuid
from collections.abc import Iterator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from repositories import create_session_factory
from services.qa.stream_answer import stream_rag_answer

router = APIRouter()


class RagQueryBody(BaseModel):
    """Request body for POST /rag/query (mirrors contracts/openapi.rag.yaml)."""

    question: str = Field(min_length=1, max_length=8000)
    projectId: uuid.UUID
    audience: str
    repoIds: list[uuid.UUID] | None = None
    pageContext: str | None = Field(default=None, max_length=500)
    generateTitle: bool = False


@router.post("/rag/query")
def rag_query(request: Request, body: RagQueryBody) -> StreamingResponse:
    """Stream a grounded answer or abstain response as Server-Sent Events.

    Retrieves relevant code chunks, optionally calls vLLM, and streams JSON chunks back
    to the Node API proxy. Every answer path must cite sources or abstain (NFR-7).

    @param request - FastAPI request carrying app state (settings, session factory).
    @param body - Validated query payload from ``contracts/openapi.rag.yaml``.
    @returns An SSE ``StreamingResponse`` of ``RagAnswerChunk`` JSON objects.
    """
    settings = request.app.state.settings
    session_factory = request.app.state.session_factory

    def event_stream() -> Iterator[str]:
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
        )

    return StreamingResponse(event_stream(), media_type="text/event-stream")
