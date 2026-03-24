# Auto-detect docker compose command (new plugin vs old standalone)
DOCKER_COMPOSE := $(shell if docker compose version > /dev/null 2>&1; then echo "docker compose"; else echo "docker-compose"; fi)

.PHONY: up down build logs logs-api logs-worker restart shell-api shell-worker shell-db dev-api dev-ui dev-worker db-reset test-scan clean health

# ── Docker Compose shortcuts ────────────────────────────────────────────────

up:
	$(DOCKER_COMPOSE) up -d --build
	@echo "✅ Code Analyzer running at http://localhost:8080"
	@echo "   API → http://localhost:3000"
	@echo "   UI  → http://localhost:8080"

down:
	$(DOCKER_COMPOSE) down

build:
	$(DOCKER_COMPOSE) build --no-cache 2>/dev/null || $(DOCKER_COMPOSE) build

logs:
	$(DOCKER_COMPOSE) logs -f --tail=100

logs-api:
	$(DOCKER_COMPOSE) logs -f api

logs-worker:
	$(DOCKER_COMPOSE) logs -f worker

restart:
	$(DOCKER_COMPOSE) restart api worker

# ── Shells ───────────────────────────────────────────────────────────────────

shell-api:
	$(DOCKER_COMPOSE) exec api sh

shell-worker:
	$(DOCKER_COMPOSE) exec worker bash

shell-db:
	$(DOCKER_COMPOSE) exec postgres psql -U ca_user -d code_analyzer

# ── Local development ────────────────────────────────────────────────────────

dev-api:
	cd api && npm install && npm run dev

dev-ui:
	cd ui && npm install && npm run dev

dev-worker:
	cd worker && pip install -r requirements.txt && python worker.py

# ── Database ─────────────────────────────────────────────────────────────────

db-reset:
	$(DOCKER_COMPOSE) exec postgres psql -U ca_user -d code_analyzer \
	  -c "DROP TABLE IF EXISTS scan_results, scans CASCADE;"
	$(DOCKER_COMPOSE) restart api

# ── Test a scan ──────────────────────────────────────────────────────────────

test-scan:
	curl -s -X POST http://localhost:3000/scan/git \
	  -H "Content-Type: application/json" \
	  -d '{"repoUrl":"https://github.com/expressjs/express","branch":"master"}' \
	  | python3 -m json.tool

# ── Cleanup ──────────────────────────────────────────────────────────────────

clean:
	$(DOCKER_COMPOSE) down -v --remove-orphans
	rm -rf api/node_modules ui/node_modules ui/dist
	find . -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@echo "✅ Cleaned up"

# ── Health check ─────────────────────────────────────────────────────────────

health:
	@curl -s http://localhost:3000/health | python3 -m json.tool
