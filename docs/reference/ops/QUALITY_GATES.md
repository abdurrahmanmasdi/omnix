# Clean-checkout quality gate

This project is currently three Git repositories. Place fresh checkouts in one directory as `backend-v2`, `frontend-v2`, and `python-ai-service-v2`. Use Node 22 (`.nvmrc`) and Python 3.13. From `backend-v2`, run:

```bash
bash scripts/quality-gate.sh
```

The script installs locked npm dependencies, creates the Python 3.13 virtual environment and installs `requirements-dev.txt`, checks the agent/protobuf/socket contracts across repositories, regenerates the Nest OpenAPI document and Orval client, runs Prisma generate, backend/frontend TypeScript and production builds, backend Jest, frontend Vitest, Python pytest with synthetic configuration values, and read-only lint. A generated API diff fails the gate. The frontend uses checked-in Inter and Montserrat Latin WOFF2 files, so the build does not fetch Google Fonts. Other scripts and glyph ranges use browser font fallbacks.

For a local pass against already installed dependencies and uncommitted generated files, use `SKIP_INSTALL=1 SKIP_GENERATED_CHECK=1 bash scripts/quality-gate.sh`. Those flags are for development only; CI uses the full gate.

The backend [cross-service workflow](../.github/workflows/quality.yml) checks out the frontend and Python repositories beside the backend. If either repository is private, give the workflow a read-only `CROSS_REPO_READ_TOKEN` secret. A coordinated contract change needs corresponding branches in all three repositories; run `workflow_dispatch` with `frontend_ref` and `python_ref` pointing to those branches before merging. The default push/PR run compares with their `main` branches and will correctly fail until the peer contracts are merged.

The backend runtime contract and socket types are the source copies for coordinated changes. After updating them, run `python3 scripts/check-cross-repo-contracts.py --sync` from the backend checkout, review the peer diffs, export OpenAPI with `npx ts-node scripts/export-openapi.ts ../frontend-v2/openapi.json`, regenerate the frontend client with `npm run generate:api`, and run the quality gate. The default `check-cross-repo-contracts.py` invocation is read-only.

Backend lint currently has an explicit baseline of existing warnings, primarily unsafe arguments in tests and integration adapters. `npm run lint:baseline` rejects new warnings per file/rule/message. Frontend lint has zero warnings. The baseline is not an exemption for new code. Changes to the existing baseline require review and an explicit `node scripts/check-lint-baseline.mjs '{src,apps,libs,test}/**/*.ts' --write-baseline` in the backend (or `.` in the frontend).

From the parent directory, run `./test_e2e_pilot.sh` for the S16 acceptance suite. It requires Docker and Node 22, starts a localhost-only disposable Postgres container, and runs seven Jest suites. Each suite creates and drops a UUID-named database; the shell trap removes the container on success, test failure, or interruption. It does not use the persistent Compose database. The dated run record is `../docs/evidence/S16_PILOT_RUN_2026-09-28.log`.

For the optional Compose development stack, Nest is available at `http://localhost:3000` and Next at `http://localhost:3001`. The frontend container uses Node 22 and sets `PORT=3001`. Compose is not the S16 acceptance environment and must not be used as a substitute for S17 staging verification.
