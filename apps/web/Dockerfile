# Build context = repo root (see docker-compose.yml).
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
ENV CI=true HUSKY=0
RUN npm ci --ignore-scripts
COPY . .
RUN npm run codegen:ts && npm run build -w @codesage/web

FROM nginx:1.27-alpine AS run
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
