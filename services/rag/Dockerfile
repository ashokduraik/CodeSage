# Build context = repo root (see docker-compose.yml).
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim
WORKDIR /app
COPY packages/py-core /app/packages/py-core
COPY services/rag /app/services/rag
WORKDIR /app/services/rag
RUN uv sync --no-dev
EXPOSE 8001
CMD ["uv", "run", "uvicorn", "rag.main:app", "--host", "0.0.0.0", "--port", "8001"]
