# Build context = repo root (see docker-compose.yml).
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim
WORKDIR /app
COPY packages/py-core /app/packages/py-core
COPY services/worker /app/services/worker
WORKDIR /app/services/worker
RUN uv sync --no-dev
CMD ["uv", "run", "python", "-m", "worker.main"]
