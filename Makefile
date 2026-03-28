# =============================================================================
# Bridge Watch — Makefile
# Common development and operations tasks.
# =============================================================================

COMPOSE     = docker compose
COMPOSE_DEV = docker compose -f docker-compose.dev.yml

.PHONY: help dev dev-build dev-down up up-tools down logs \
        logs-backend logs-frontend migrate seed \
        psql redis-cli shell-backend shell-frontend \
        build build-dev clean prune

# Default target
.DEFAULT_GOAL := help

# -----------------------------------------------------------------------------
# Development
# -----------------------------------------------------------------------------

## Start the full development environment (hot reload + tools)
dev:
	$(COMPOSE_DEV) up

## Start dev environment and rebuild images
dev-build:
	$(COMPOSE_DEV) up --build

## Stop the development environment
dev-down:
	$(COMPOSE_DEV) down

## Follow all logs in the dev environment
logs:
	$(COMPOSE_DEV) logs -f

## Follow backend logs only
logs-backend:
	$(COMPOSE_DEV) logs -f backend

## Follow frontend logs only
logs-frontend:
	$(COMPOSE_DEV) logs -f frontend

# -----------------------------------------------------------------------------
# Production
# -----------------------------------------------------------------------------

## Start production environment (detached)
up:
	$(COMPOSE) up -d

## Start production environment with dev tools (pgadmin + redis-commander)
up-tools:
	$(COMPOSE) --profile tools up -d

## Stop production environment
down:
	$(COMPOSE) down

# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------

## Run database migrations
migrate:
	$(COMPOSE_DEV) exec backend npm run migrate

## Seed the database with initial data
seed:
	$(COMPOSE_DEV) exec backend npm run seed

## Open a PostgreSQL shell
psql:
	docker exec -it bridge-watch-postgres \
	  psql -U $${POSTGRES_USER:-bridge_watch} $${POSTGRES_DB:-bridge_watch}

# -----------------------------------------------------------------------------
# Redis
# -----------------------------------------------------------------------------

## Open a Redis CLI
redis-cli:
	docker exec -it bridge-watch-redis redis-cli

# -----------------------------------------------------------------------------
# Shells
# -----------------------------------------------------------------------------

## Open a shell in the backend container
shell-backend:
	$(COMPOSE_DEV) exec backend sh

## Open a shell in the frontend container
shell-frontend:
	$(COMPOSE_DEV) exec frontend sh

# -----------------------------------------------------------------------------
# Build
# -----------------------------------------------------------------------------

## Build all production Docker images
build:
	$(COMPOSE) build

## Build all development Docker images
build-dev:
	$(COMPOSE_DEV) build

# -----------------------------------------------------------------------------
# Cleanup
# -----------------------------------------------------------------------------

## Remove all containers and named volumes (DESTRUCTIVE — deletes data)
clean:
	$(COMPOSE_DEV) down -v --remove-orphans
	$(COMPOSE) down -v --remove-orphans

## Remove dangling images and build cache
prune:
	docker image prune -f
	docker builder prune -f

# -----------------------------------------------------------------------------
# Help
# -----------------------------------------------------------------------------

## Show this help message
help:
	@echo ""
	@echo "Bridge Watch — available make targets:"
	@echo ""
	@grep -E '^## ' Makefile | sed 's/## /  /' | \
	  awk 'BEGIN{prev=""} /^  [a-z]/{print prev; prev=""} {prev=$$0} END{print prev}'
	@echo ""
	@echo "Usage examples:"
	@echo "  make dev            # start dev environment"
	@echo "  make dev-build      # rebuild dev images and start"
	@echo "  make migrate        # run DB migrations in dev"
	@echo "  make psql           # open a Postgres shell"
	@echo "  make clean          # tear down everything (deletes volumes!)"
	@echo ""
	@echo "Dev services:"
	@echo "  Frontend   http://localhost:5173"
	@echo "  Backend    http://localhost:3001"
	@echo "  WebSocket  ws://localhost:3002"
	@echo "  PgAdmin    http://localhost:5050  (admin@bridgewatch.dev / admin)"
	@echo "  Redis UI   http://localhost:8081  (admin / admin)"
	@echo ""
