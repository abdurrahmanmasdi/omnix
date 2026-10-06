#!/usr/bin/env bash
set -euo pipefail
root_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$root_dir/apps/backend-v2"
# The shared runner creates a random localhost-only Postgres container. Each
# suite creates and drops its own UUID-named database, even after a test failure.
# No persistent Compose service or fixed database name is touched.
exec bash test/run-credential-upgrade.sh 'pilot|first-organization|tenant-isolation|authorization-socket|inbound-claim|media-consent|auth-refresh-concurrency'
