---
description: Run the checks a card asks for
---
Scope: $ARGUMENTS (default: unit tests of the touched app).
- Backend: `cd apps/backend-v2 && npm run build && npm test`. Frontend: `cd apps/frontend-v2 && npm run build && npx vitest run`. Python: see `docs/ARCHITECTURE.md` §8.
- Only if asked: full gate `bash apps/backend-v2/scripts/quality-gate.sh`; DB suites `./test_e2e_pilot.sh` (Docker, disposable DB — never the compose DB).
Report pass/fail with exact commands and counts in `docs/LOG.md`; new failures → KI in `docs/ISSUES.md`.
