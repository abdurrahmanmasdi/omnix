#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("Node 22 or newer is required; run nvm use first"); process.exit(1); }'
container_name="omnidesk-s02-$(node -e 'process.stdout.write(require("crypto").randomUUID())')"
cleanup() {
  case "$container_name" in
    omnidesk-s02-????????-????-????-????-????????????) docker rm -f "$container_name" >/dev/null 2>&1 || true ;;
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
mapped_port="$(docker port "$container_name" 5432/tcp)"
export UPGRADE_TEST_ADMIN_URL="postgresql://postgres:synthetic-test-only@127.0.0.1:${mapped_port##*:}/postgres"
export INTEGRATION_CREDENTIAL_KEY="$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64"))')"
npx jest --config test/jest-e2e.json "${1:-credential-upgrade.e2e-spec.ts}" --runInBand --watchman=false
