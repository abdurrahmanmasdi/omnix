# backend-v2 — NestJS API (app rules)

Read the workspace `../../CLAUDE.md` first (product rules, mode of work, memory protocol). This file adds what is specific to this app.
Rating: **2.9 / 5, keep & improve** (`../../reviews/backend-v2.md`, 2026-09-30). No module is slated for rewrite. Open problems: `../../memory/known-issues.md` (KI-022…KI-033 are this app's review findings).

## What this is

NestJS API for OmniX: WhatsApp (Meta) webhook ingress, inbound claims/leases, AI reply orchestration, outbound delivery, follow-ups, auth/permissions, CRM + inbox + leads, Socket.IO gateway, encrypted credentials. Postgres via Prisma, Redis + BullMQ, gRPC client to `../python-ai-service-v2`. Node 22 (`.nvmrc`). This repo is its own git repo; commit here, not in the workspace repo.

## Commands

```bash
npm ci
npx prisma generate
npm run db:deploy        # ⚠ migrations + credential upgrade. Intended dev DB ONLY. It is the only supported migration entry point
npm run start:dev        # set PORT explicitly: Nest defaults to 3001 = Next's dev port (KI-004)
npm run build
npm test                 # unit (Jest)
npm run test:e2e         # needs a disposable Postgres (+Redis); prefer ../../test_e2e_pilot.sh from the workspace root
npm run lint && npm run lint:baseline   # baseline has legacy warnings: add NO new ones
npm run format           # prettier; P1-07…P1-09 files are not formatted yet
bash scripts/quality-gate.sh            # full cross-service gate; reaches the other apps as siblings under ../
python3 scripts/check-cross-repo-contracts.py   # run from apps/ (protobuf / action / socket contracts)
```

`npm run start:prod` runs `deploy-cli` (migrations) and then the app with the same `DATABASE_URL`, which conflicts with the least-privilege runtime role (`RUNTIME_DATABASE_URL`). Known gap (KI-033); don't paper over it.

Env var names are in `../../context/setup.md`. **Never read, print or commit `.env`, `uploads/`, keys or tokens.** Config is read from `process.env` in 13 files with no validation (KI-028). If you add a variable, add it to `context/setup.md` too, and prefer a central validated config over a new scattered read.

## Where things are

- Entry: `src/main.ts` (HTTP + Socket.IO, `rawBody: true`), `src/app.module.ts`.
- Workers (BullMQ): `whatsapp-messages` → `WebhooksProcessor`, `ai-reply` → `AiReplyProcessor`, `follow-up` → `FollowUpProcessor`, `outbox-relay` → `NotificationRelayProcessor`. Crons all run in-process (outbox poll, inbound lease recovery, outbound retry + SENDING→UNKNOWN, follow-up recovery, media cleanup, socket revalidation). Sockets and crons assume **one instance**.
- Biggest module: `src/webhooks/` (~3.3k lines: ingress, inbound claims, AI reply, outbound attempts, action executor, media). `src/follow-ups/` duplicates much of the ai-reply send logic (merge later behind the e2e tests, not now).
- `src/prisma/prisma.service.ts` — tenant-scoping client extension + raw-SQL guard. `src/core/` — tenant ALS/middleware, outbox, guards, logger, metrics. `src/events/events.gateway.ts` — Socket.IO with per-emit permission recheck and redaction. `src/credentials/` — AES-GCM credentials, `deploy-cli.ts`.
- Operator CLIs: `src/auth/invite-cli.ts` (`npm run pilot:invite`), `src/auth/recovery-cli.ts`, `src/credentials/deploy-cli.ts`.
- Tests: `test/*.e2e-spec.ts` (disposable-DB suites: inbound-claim 24 tests, tenant-isolation, authorization-socket, media-consent, auth-refresh-concurrency, …). About 12 unit specs are "should be defined" stubs. CI (`.github/workflows/quality.yml:65`) skips 4 e2e suites (KI-016).
- Docs for this app: `docs/AUTHORIZATION_MATRIX.md`, `docs/TENANT_ISOLATION.md`, `docs/OUTBOUND_DELIVERY.md`, `docs/CREDENTIAL_UPGRADE.md`, `docs/PILOT_ACTIVATION.md`, `docs/QUALITY_GATES.md`, `docs/runbooks/`. Cross-service picture: `../../context/architecture.md`.

## Rules for this app

Preserve every invariant in `../../context/invariants.md`. These look odd but are **deliberate** — do not "clean them up" (details in review §10):

- **Raw body.** Signature is verified on `request.rawBody` (`main.ts:10-15`, `webhooks.controller.ts:55`), never on `@Body()`. A body parser here is a regression (R1; fixed 2026-09-28).
- **Webhook runs under system bypass;** the worker resolves the tenant from the channel and **drops** missing/ambiguous matches (`take: 2`).
- **UNKNOWN / SENDING are never resent** (they return `WAITING`). SENDING becomes UNKNOWN after 2 min; only HTTP 429 / provider `failed` retry (≤3). Don't add blind retries (R7).
- **Two authorization checks around the SENDING claim,** plus per-bubble pause/opt-out checks in the processors: intentional double-checking.
- **Every inbound bumps `conversation.stateVersion`,** invalidating in-flight replies. Conversation lease + per-message `processingOwner`; `finish` only touches rows the owner holds.
- **Outbox groups `generate-reply` per conversation with a 7 s debounce.**
- **Prisma proxy:** raw SQL throws outside system scope; `Message` is scoped via its conversation; `upsert` on `Message` is deliberately refused. `tenantStorage.enterWith` inside `JwtStrategy.validate` installs the tenant only after the DB membership check.
- **Opt-out is stored on the tenant's lead,** not globally by phone.
- **Signup returns 403, verify-email 410** (invitation-only pilot). Free-form sends are cancelled outside the 24 h window (no templates configured yet).
- **Refresh reuse (or concurrent rotation) revokes the whole family** — except a token rotated ≤10 s ago in a still-live family (parallel tabs, KI-070), which gets a sibling session.
- **Live notifications carry only a generic invalidation;** details go via HTTP.
- **Use `npm run db:deploy`,** not `prisma migrate deploy` (credential preflight).

The AI proposes, this app validates and executes (rule 9). The action contract (`src/webhooks/contracts/agent-contract.ts`, `agent-actions.v1.json`) is shared with Python: **change both together**, and regenerate rather than hand-edit protobuf, OpenAPI and socket-contract outputs (rule 11). Behavior changes and refactors go in separate commits (rule 13). Characterize untested code before refactoring it.

## Weak spots: fix, don't extend

Don't build new features on these paths until they are fixed; if you touch them, fix the listed issue.

- Fixed on branch `wp-b/delivery-consent` (2026-10-01, not merged yet): STOP/consent effects (KI-022), staff manual send + explicit AI pause/resume (KI-023), consent request (KI-025), media expiry (KI-026, storage still base64 → IMP-011), UNKNOWN routing (KI-029). Until merged, `ci/p1-04-hosted` still has the old behavior.
- Follow-up processor runs actions before storing bubbles — KI-061.
- AI authority over lead status / phone / email in `action-executor.service.ts` — KI-024.
- Clinic invitations, config validation — KI-027, KI-028.
- Production gRPC TLS (`grpc-client.module.ts`) — KI-002. DB role passwords in the `20260930000000_least_privilege_roles` migration — KI-013 (applied migrations are forward-only; add a new step, don't edit it).

## Clutter: ignore, don't import or run

Removed in CLN-1 (2026-10-04, branch `cln-1/cleanup`): root `patch_*.py`, `scratch/`, `*.orig`/`*.patch` in `src/`, root `product_vision.md`/`serivces.md`/`ARCHITECTURE_NESTJS.md` (archived in the workspace `docs/archive/2026-08-original/`), stale `test/app.e2e-spec.ts`/`auth.e2e-spec.ts` (KI-066). Still ignore the `.credential-deploy-*` temp dir and never open `.env*`. `ERD.svg` is stale (predates 22 schema commits, e.g. no OutboundAttempt) — don't trust it.
