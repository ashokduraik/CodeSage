"""RAG service entrypoint.

Phase 0 skeleton: exposes only /health. The QA pipeline (router -> retrieval ->
assembly -> grounding) is wired in Phase 1 by delegating to py_core. See PLAN.md.
"""

from fastapi import FastAPI

from py_core.config import load_settings


def create_app() -> FastAPI:
    settings = load_settings()
    app = FastAPI(title="CodeSage RAG", version="0.0.0")
    app.state.settings = settings

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "rag"}

    return app


app = create_app()
