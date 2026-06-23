"""RAG service entrypoint."""

import threading
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from api.routes.query import router as query_router
from config import load_settings
from repositories import create_engine_from_settings, create_session_factory
from workers.worker import run_worker_loop


def create_app() -> FastAPI:
    """Create the FastAPI app with a background job-consumer thread."""
    settings = load_settings()
    engine = create_engine_from_settings(settings)
    session_factory = create_session_factory(engine)
    stop_event = threading.Event()
    worker_thread: threading.Thread | None = None

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        nonlocal worker_thread
        worker_thread = threading.Thread(
            target=run_worker_loop,
            args=(settings, stop_event),
            name="codesage-rag-worker",
            daemon=True,
        )
        worker_thread.start()
        yield
        stop_event.set()
        if worker_thread is not None:
            worker_thread.join(timeout=5)
        engine.dispose()

    app = FastAPI(title="CodeSage RAG", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.session_factory = session_factory

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "rag"}

    app.include_router(query_router)
    return app


app = create_app()
