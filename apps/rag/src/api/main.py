"""RAG service entrypoint.

Phase 0 skeleton: exposes /health and starts a background worker thread. The QA pipeline
(router -> retrieval -> assembly -> grounding) and Procrastinate job consumption are wired
in later phases by delegating to `services/`. See PLAN.md.
"""

import threading
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from config import load_settings
from workers.worker import run_worker_loop


def create_app() -> FastAPI:
    """Create the FastAPI app with a background job-consumer thread."""
    settings = load_settings()
    stop_event = threading.Event()
    worker_thread: threading.Thread | None = None

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        nonlocal worker_thread
        worker_thread = threading.Thread(
            target=run_worker_loop,
            args=(stop_event,),
            name="codesage-rag-worker",
            daemon=True,
        )
        worker_thread.start()
        yield
        stop_event.set()
        if worker_thread is not None:
            worker_thread.join(timeout=5)

    app = FastAPI(title="CodeSage RAG", version="0.0.0", lifespan=lifespan)
    app.state.settings = settings

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "rag"}

    return app


app = create_app()
