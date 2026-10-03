#!/usr/bin/env bash
set -euo pipefail
workspace="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
backend="$workspace/backend-v2"
frontend="$workspace/frontend-v2"
python_service="$workspace/python-ai-service-v2"
python_bin="${PYTHON_BIN:-python3.13}"

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$node_major" != "22" ]]; then
  echo "Node 22 is required; current major is $node_major" >&2
  exit 1
fi
if ! "$python_bin" -c 'import sys; assert sys.version_info[:2] >= (3, 13)' 2>/dev/null; then
  echo "Python 3.13 or newer is required (set PYTHON_BIN to its executable)." >&2
  exit 1
fi
python3 "$backend/scripts/check-cross-repo-contracts.py"

if [[ "${SKIP_INSTALL:-0}" != "1" ]]; then
  (cd "$backend" && npm ci)
  (cd "$frontend" && npm ci)
  if [[ ! -x "$python_service/.venv/bin/python" ]]; then
    "$python_bin" -m venv "$python_service/.venv"
  fi
  "$python_service/.venv/bin/python" -m pip install -r "$python_service/requirements-dev.txt"
fi

(cd "$backend" && npx prisma generate)

if [[ "${SKIP_GENERATED_CHECK:-0}" != "1" ]]; then
  (cd "$backend" && \
    NODE_ENV=test \
    DATABASE_URL=postgresql://synthetic:synthetic@127.0.0.1:5432/omnix_synthetic \
    JWT_ACCESS_SECRET=synthetic-ci-only-jwt-secret \
    JWT_REFRESH_SECRET=synthetic-ci-only-refresh-secret \
    JWT_ACCESS_EXPIRATION=15m \
    JWT_REFRESH_EXPIRATION=7d \
    META_APP_SECRET=synthetic-ci-only-meta-secret \
    META_VERIFY_TOKEN=synthetic-ci-only-verify-token \
    INTERNAL_RPC_SECRET=synthetic-ci-only-rpc-secret \
    INTEGRATION_CREDENTIAL_KEY="$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64"))')" \
    REDIS_URL=redis://127.0.0.1:1 \
    npx ts-node scripts/export-openapi.ts "$frontend/openapi.json")
  (cd "$frontend" && ./node_modules/.bin/prettier --write openapi.json && npm run generate:api)
  if [[ -n "$(git -C "$frontend" status --porcelain -- openapi.json src/lib/api/generated src/lib/api/model)" ]]; then
    echo "Generated frontend API contract is stale; regenerate and commit it." >&2
    exit 1
  fi
fi

(cd "$backend" && npx tsc --noEmit --incremental false && npm run build && npm test -- --runInBand --watchman=false && npm run lint && npm run lint:baseline)
(cd "$frontend" && npx tsc --noEmit && npm run build && npx vitest run && npm run lint && npm run lint:baseline)
(cd "$python_service" && OPENAI_API_KEY=synthetic-test-key INTERNAL_RPC_SECRET=synthetic-rpc-secret DATABASE_URL=postgresql://synthetic:synthetic@127.0.0.1:5432/omnix_synthetic ./.venv/bin/python -m pytest -q)
