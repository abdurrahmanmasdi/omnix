#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# Database setup
container_name="omnidesk-pw-$(node -e 'process.stdout.write(require("crypto").randomUUID())')"
redis_name="omnidesk-pw-redis-$(node -e 'process.stdout.write(require("crypto").randomUUID())')"

cleanup() {
  echo "Cleaning up..."
  kill ${BACKEND_PID:-} 2>/dev/null || true
  kill ${FRONTEND_PID:-} 2>/dev/null || true
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  docker rm -f "$redis_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=synthetic-test-only -p 127.0.0.1::5432 pgvector/pgvector:pg15 >/dev/null
docker run --rm -d --name "$redis_name" -p 127.0.0.1::6379 redis:7-alpine >/dev/null

ready=false
for attempt in {1..60}; do
  if docker exec "$container_name" pg_isready -U postgres >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done

ready=false
for attempt in {1..60}; do
  if [ "$(docker exec "$redis_name" redis-cli ping 2>/dev/null)" = PONG ]; then ready=true; break; fi
  sleep 1
done

redis_port="$(docker port "$redis_name" 6379/tcp)"
export REDIS_URL="redis://127.0.0.1:${redis_port##*:}"

mapped_port="$(docker port "$container_name" 5432/tcp)"
export DATABASE_URL="postgresql://postgres:synthetic-test-only@127.0.0.1:${mapped_port##*:}/postgres"
export UPGRADE_TEST_ADMIN_URL="postgresql://postgres:synthetic-test-only@127.0.0.1:${mapped_port##*:}/postgres"
export JWT_ACCESS_SECRET=synthetic-e2e-access-secret
export JWT_REFRESH_SECRET=synthetic-e2e-refresh-secret
export JWT_ACCESS_EXPIRATION=15m
export JWT_REFRESH_EXPIRATION=7d
export PORT=3000
export INTEGRATION_CREDENTIAL_KEY="$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64"))')"

cd backend-v2
npx ts-node src/credentials/deploy-cli.ts
export TEST_SEED=1
npx ts-node src/credentials/seed-playwright.ts

echo "Starting backend..."
npm run start &
BACKEND_PID=$!
ready=false
for attempt in {1..60}; do
  if curl -s http://127.0.0.1:3000/api/health >/dev/null; then ready=true; break; fi
  sleep 1
done

cd ../frontend-v2
echo "Starting frontend..."
export NEXT_PUBLIC_API_URL=http://localhost:3000
npm run dev -- -p 3001 &
FRONTEND_PID=$!

ready=false
for attempt in {1..60}; do
  if curl -s http://127.0.0.1:3001 >/dev/null; then ready=true; break; fi
  sleep 2
done

echo "Running Playwright tests..."
npx playwright test
