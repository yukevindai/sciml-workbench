#!/bin/sh
# A10 local acceptance: Compose stack (PostgreSQL, API, scientific worker, web), scripted
# coordinator (no model provider), then the real-stack browser spec. Needs Docker and an
# env file with generated secrets, WB_AGENTS_ENABLED=1, pinned-format model IDs, bounds
# and a placeholder ANTHROPIC_API_KEY that is never sent (no agent-worker is started).
# Usage: scripts/acceptance/run_a10.sh <env-file> [playwright args]
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
ENV_FILE=$1; shift
COMPOSE="docker compose -p a10 --env-file $ENV_FILE -f compose.yaml"  # relative: also run from Node on Windows
cd "$ROOT"
mkdir -p "$ROOT/outputs/a10"
$COMPOSE up --build -d --wait postgres api worker web
$COMPOSE exec -T api python - 1800 < scripts/acceptance/scripted_coordinator.py > "$ROOT/outputs/a10/coordinator.log" 2>&1 &
COORDINATOR=$!
trap 'kill $COORDINATOR 2>/dev/null || true' EXIT
case "$ENV_FILE" in /*) ;; *) ENV_FILE="$ROOT/$ENV_FILE" ;; esac
set -a; . "$ENV_FILE"; set +a
cd frontend
E2E_REAL_STACK=1 A10_COMPOSE="$COMPOSE" ${NPX:-npx} playwright test tests/acceptance-a10.spec.ts --reporter=line "$@"
