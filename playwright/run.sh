#!/usr/bin/env bash
# Browser permission suite (P1-10). Synthetic data only: disposable Postgres + Redis in Docker,
# generated passwords in a mode-0700 temp dir, no real providers, no stored auth state.
set -euo pipefail
frontend="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
backend="${PLAYWRIGHT_BACKEND_DIR:-$frontend/../backend-v2}"
backend="$(cd "$backend" && pwd)"

node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("Node 22 or newer is required"); process.exit(1); }'
command -v docker >/dev/null || { echo "Docker is required for the disposable Postgres/Redis" >&2; exit 1; }

uid="$(node -e 'process.stdout.write(require("crypto").randomUUID())')"
pg_name="omnidesk-pw-pg-$uid"
redis_name="omnidesk-pw-redis-$uid"
work="$(mktemp -d)"
chmod 700 "$work"
backend_pid=""
frontend_pid=""
stop() { # pid: stop the server and any children it spawned
  pkill -TERM -P "$1" 2>/dev/null || true
  kill "$1" 2>/dev/null || true
}
cleanup() {
  [[ -n "$backend_pid" ]] && stop "$backend_pid"
  [[ -n "$frontend_pid" ]] && stop "$frontend_pid"
  docker rm -f "$pg_name" "$redis_name" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

wait_for() { # description, command...
  local what="$1"; shift
  for _ in $(seq 1 90); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "$what did not become ready" >&2
  exit 1
}

# A leftover server would pass the readiness checks below while pointing at a deleted database.
for port in 3000 3001; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is already in use (leftover server from an earlier run?). Stop it and retry." >&2
    exit 1
  fi
done

pg_password="$(node -e 'process.stdout.write(require("crypto").randomBytes(12).toString("hex"))')"
docker run --rm -d --name "$pg_name" -e POSTGRES_PASSWORD="$pg_password" \
  -p 127.0.0.1::5432 pgvector/pgvector:pg15 >/dev/null
docker run --rm -d --name "$redis_name" -p 127.0.0.1::6379 redis:7-alpine >/dev/null
wait_for "Postgres" docker exec "$pg_name" pg_isready -U postgres
wait_for "Redis" docker exec "$redis_name" redis-cli ping

pg_port="$(docker port "$pg_name" 5432/tcp | head -n1)"; pg_port="${pg_port##*:}"
redis_port="$(docker port "$redis_name" 6379/tcp | head -n1)"; redis_port="${redis_port##*:}"
rand() { node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))'; }

export DATABASE_URL="postgresql://postgres:${pg_password}@127.0.0.1:${pg_port}/postgres"
export REDIS_URL="redis://127.0.0.1:${redis_port}"
export JWT_ACCESS_SECRET="$(rand)" JWT_REFRESH_SECRET="$(rand)"
export JWT_ACCESS_EXPIRATION=15m JWT_REFRESH_EXPIRATION=7d
export META_APP_SECRET="$(rand)" META_VERIFY_TOKEN="$(rand)" INTERNAL_RPC_SECRET="$(rand)"
export INTEGRATION_CREDENTIAL_KEY="$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64"))')"
export FRONTEND_URL=http://localhost:3001 PYTHON_SERVER_URL=localhost:50051
export INTERNAL_GRPC_TLS=disabled INTERNAL_GRPC_PRIVATE_NETWORK=true   # loopback only (KI-002 acknowledgement)
export PORT=3000 NODE_ENV=test
export PLAYWRIGHT_API_URL=http://localhost:3000 PLAYWRIGHT_BASE_URL=http://localhost:3001
export PLAYWRIGHT_BACKEND_DIR="$backend"
export PLAYWRIGHT_FIXTURE_FILE="$work/fixture.json"

(cd "$backend" && npx prisma generate >/dev/null && npm run build >/dev/null)
(cd "$backend" && node dist/src/credentials/deploy-cli.js)
(cd "$backend" && npx ts-node scripts/playwright-fixture.ts seed "$PLAYWRIGHT_FIXTURE_FILE")

(cd "$backend" && exec node dist/src/main.js >"$work/backend.log" 2>&1) &
backend_pid=$!
wait_for "Backend" curl -fsS http://127.0.0.1:3000/health

(cd "$frontend" && NEXT_PUBLIC_API_URL=http://localhost:3000 npm run build >"$work/frontend-build.log" 2>&1) \
  || { tail -n 40 "$work/frontend-build.log" >&2; exit 1; }
(cd "$frontend" && exec node_modules/.bin/next start -p 3001 >"$work/frontend.log" 2>&1) &
frontend_pid=$!
wait_for "Frontend" curl -fsS http://127.0.0.1:3001/login

cd "$frontend"
npx playwright install --with-deps chromium >/dev/null
npx playwright test "$@"
