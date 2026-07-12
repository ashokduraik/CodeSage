# Build context = repo root (see docker-compose.yml).
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim
WORKDIR /app
COPY apps/engine /app/apps/engine
WORKDIR /app/apps/engine
RUN uv sync --no-dev
EXPOSE 8001
CMD ["uv", "run", "python", "-m", "api.run", "--host", "0.0.0.0", "--port", "8001"]
