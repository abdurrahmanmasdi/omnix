#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("Node 22 or newer is required; run nvm use first"); process.exit(1); }'
container_name="omnidesk-s02-$(node -e 'process.stdout.write(require("crypto").randomUUID())')"
redis_name="omnidesk-s02-redis-$(node -e 'process.stdout.write(require("crypto").randomUUID())')"
cleanup() {
  case "$container_name" in
    omnidesk-s02-????????-????-????-????-????????????) docker rm -f "$container_name" >/dev/null 2>&1 || true ;;
  esac
  case "$redis_name" in
    omnidesk-s02-redis-????????-????-????-????-????????????) docker rm -f "$redis_name" >/dev/null 2>&1 || true ;;
  esac
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
docker run --rm -d --name "$container_name" \
  -e POSTGRES_PASSWORD=synthetic-test-only \
  -p 127.0.0.1::5432 pgvector/pgvector:pg15 >/dev/null
ready=false
for attempt in {1..60}; do
  if docker exec "$container_name" pg_isready -U postgres >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [ "$ready" != true ]; then echo 'DISPOSABLE_POSTGRES_NOT_READY' >&2; exit 1; fi
docker run --rm -d --name "$redis_name" -p 127.0.0.1::6379 redis:7-alpine >/dev/null
ready=false
for attempt in {1..60}; do
  if [ "$(docker exec "$redis_name" redis-cli ping 2>/dev/null)" = PONG ]; then ready=true; break; fi
  sleep 1
done
if [ "$ready" != true ]; then echo 'DISPOSABLE_REDIS_NOT_READY' >&2; exit 1; fi
redis_port="$(docker port "$redis_name" 6379/tcp)"
export REDIS_URL="redis://127.0.0.1:${redis_port##*:}"
export JWT_ACCESS_SECRET=synthetic-e2e-access-secret
export JWT_REFRESH_SECRET=synthetic-e2e-refresh-secret
export JWT_ACCESS_EXPIRATION=15m
export JWT_REFRESH_EXPIRATION=7d
mapped_port="$(docker port "$container_name" 5432/tcp)"
export UPGRADE_TEST_ADMIN_URL="postgresql://postgres:synthetic-test-only@127.0.0.1:${mapped_port##*:}/postgres"
export INTEGRATION_CREDENTIAL_KEY="$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64"))')"
# Synthetic values for every variable the startup schema requires (src/config/env.validation.ts).
# Suites point DATABASE_URL at their own disposable database before connecting.
export DATABASE_URL="$UPGRADE_TEST_ADMIN_URL"
export META_APP_SECRET=synthetic-e2e-meta-app-secret
export META_VERIFY_TOKEN=synthetic-e2e-verify-token
export INTERNAL_RPC_SECRET=synthetic-e2e-rpc-secret
export FRONTEND_URL=http://localhost:3001
export PYTHON_SERVER_URL=localhost:50051
npx jest --config test/jest-e2e.json "${1:-credential-upgrade.e2e-spec.ts}" --runInBand --watchman=false
