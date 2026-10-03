#!/usr/bin/env bash
# KI-013: database role passwords never live in SQL files. They are set by the
# deploy CLI from OMNIX_*_RUNTIME_DB_PASSWORD secrets (src/credentials/runtime-role-passwords.ts).
# The already-applied 20260930000000_least_privilege_roles migration is forward-only
# and cannot be edited; its literals are replaced on every db:deploy.
set -euo pipefail
cd "$(dirname "$0")/.."
grandfathered='prisma/migrations/20260930000000_least_privilege_roles/migration.sql'
hits="$(grep -rliE "PASSWORD[[:space:]]+'" prisma/migrations --include='*.sql' | grep -vxF "$grandfathered" || true)"
if [[ -n "$hits" ]]; then
  echo "Password literal found in migration SQL (set role passwords in the deploy CLI from secrets instead):" >&2
  echo "$hits" >&2
  exit 1
fi
echo "Migration password guard: OK"
