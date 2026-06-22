# Build context = repo root (see docker-compose.yml).
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim
WORKDIR /app
COPY apps/rag /app/apps/rag
WORKDIR /app/apps/rag
RUN uv sync --no-dev
EXPOSE 8001
CMD ["uv", "run", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8001"]
