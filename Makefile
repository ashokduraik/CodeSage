# Thin wrapper over npm scripts + docker compose. npm scripts are canonical.
# On Windows without `make`, run the underlying npm/docker commands directly.

.PHONY: setup codegen build test lint typecheck up down migrate logs verify

setup:        ## Install JS deps
	npm install

codegen:      ## Generate types from contracts/
	npm run codegen

build:        ## Build all JS workspaces
	npm run build

test:         ## Run all JS tests (100% coverage gate)
	npm run test

lint:         ## Lint all JS workspaces
	npm run lint

typecheck:    ## Typecheck all JS workspaces
	npm run typecheck

up:           ## Start the local stack (Docker Compose)
	docker compose up -d --build

down:         ## Stop the local stack
	docker compose down -v

migrate:      ## Run DB migrations (dbmate)
	docker compose run --rm migrate up

logs:         ## Tail stack logs
	docker compose logs -f

verify:       ## Bring up db + migrate + api + engine and check health
	docker compose up -d --build db
	docker compose run --rm migrate up
	docker compose up -d --build api engine
