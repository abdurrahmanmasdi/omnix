# OmniX architecture — services, data, AI, invariants, per-app guide

_Merged 2026-10-06 from the old `context/*` files and the three app `CLAUDE.md` files (D-027). Read only the sections you need. If code and this file disagree, the code wins — then fix this file. Prisma schema is the authority for data: `apps/backend-v2/prisma/schema.prisma`._

## 1. System

```text
Patient → Meta WhatsApp → Nest webhook (raw-body signature check) → Postgres + outbox/Redis queue
                                   → worker → authenticated gRPC → Python AI
                                   ← reply + action proposals
                                   → validate actions/state → OutboundAttempt → Meta
Staff dashboard ↔ Nest HTTP API / Socket.IO ↔ clinic-scoped records
Clinic documents → Nest → Python DocumentProcessor → pgvector knowledge
Internal lead records → optional CRM adapter → HubSpot / Zoho
```

| Layer | Tech |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind 4, shadcn/Radix, TanStack Query 5, Zustand 5 (UI/session only), React Hook Form + Zod, dnd-kit, Orval client |
| Backend | NestJS 11, Node 22, Prisma 7 (pg adapter), PostgreSQL + pgvector, Redis 7 + BullMQ, Socket.IO, Pino, Prometheus |
| AI service | Python 3.13, FastAPI (health) + async gRPC, LangGraph/LangChain, OpenAI SDK, Pydantic |
| Tests | Jest/Supertest (BE), Vitest + Playwright (FE), pytest (PY) |
| Hosting | Railway (`staging`, `production`); Docker images per app |

**Patient enquiry flow:** message → signature checked on exact raw bytes → channel → clinic → lead + conversation found/created → inbound stored with dedupe, queued → worker checks current state, calls Python → AI extracts, routes, retrieves clinic knowledge, returns reply + validated action proposals → Nest executes allowed actions and controls sending → dashboard updates (HTTP + Socket.IO, permission-filtered) → escalation (human request, medical doubt, payment intent, missing knowledge) pauses the AI and hands off.

**Channels:** WhatsApp Cloud API = pilot channel. Instagram: code stubs only (P2-11, later). HubSpot/Zoho adapters exist, live sync unproven. No calendar booking.

## 2. Contracts across services (change all sides together, regenerate, never hand-edit)
- **Protobuf** Nest ↔ Python gRPC (`apps/python-ai-service-v2/proto`, `scripts/generate-proto.sh` → repo-root `*_pb2*.py` in the Python app — these ARE the active copies).
- **Action contract v1**: Python `app/modules/agent/agent-actions.v1.json` + `actions.py` (fixtures `tests/agent-actions.v1.fixtures.json`) ↔ Nest `src/webhooks/contracts/agent-contract.ts` + `agent-actions.v1.json`. Actions: `CREATE_LEAD, UPDATE_LEAD, UPDATE_SUMMARY, HANDOFF_TO_HUMAN, PAUSE_CONVERSATION, NOTIFY_AGENT, SCHEDULE_FOLLOW_UP`. Invalid/unauthorized actions fail safely (no partial change, logged). The contract still lets the AI set WON/LOST/READY_TO_PAY and phone/email (KI-024): never widen it.
- **Socket contract** (generated for the frontend) and **OpenAPI → Orval** (`apps/frontend-v2/openapi.json` snapshot, `npm run generate:api`).
- Check: from `apps/`, `python3 backend-v2/scripts/check-cross-repo-contracts.py` (also in CI).

## 3. Invariants (product correctness — keep them in every change)

Reliability
- **R1** Verify the Meta signature on the **exact raw request body** before accepting anything (raw-body bug fixed 2026-09-28; a body parser is a regression).
- **R2** Store inbound work with duplicate protection (provider message id / inbound claims).
- **R3** Rapid messages and competing workers are coordinated with **leases + stateVersion**.
- **R4** Obsolete AI work is cancelled on takeover, pause, opt-out or newer state.
- **R5** Keep apart: DB intent → queued execution → provider acceptance (`OutboundAttempt`).
- **R6** Recover expired processing claims and pending work after a crash.
- **R7** Keep `UNKNOWN` send outcomes; never blindly retry a possibly-accepted send.
- **R8** Right before sending, re-check recipient, clinic, channel credentials, opt-out, conversation state/permissions.
- **R9** Cancel follow-ups that are no longer allowed (opt-out, takeover, STOP, window closed).
- **R10** Appointment confirmation and clinical/payment decisions stay with staff.

Security and access
- **S1** JWT access + refresh session families, cookie handling, account status checks.
- **S2** Every query is clinic-scoped. Two clinics never see each other's leads, messages, notifications, knowledge or credentials. (RLS is **off**; tenancy is enforced in code.)
- **S3** Permissions (view lead; all vs assigned; PII; message history) enforced on **HTTP and Socket.IO**; socket emits re-check and redact.
- **S4** Stored notifications are access-controlled (`reference/ops/AUTHORIZATION_MATRIX.md`).
- **S5** Internal gRPC is authenticated with `INTERNAL_RPC_SECRET`.
- **S6** Integration secrets only in encrypted `Credential` records; `INTEGRATION_CREDENTIAL_KEY` must persist across deploys and match backups.
- **S7** Logs are PII-redacted.

Privacy and medical
- **P1** Patient media: purpose-specific consent **before** download. **P2** Withdrawal clears media references; expiry cleanup exists. **P3** Opt-out/STOP respected for replies and follow-ups. **P4** Clinic notice, retention, subprocessors, transfers not legally approved yet (F03).
- **M1–M4** No diagnosis or guaranteed results; no invented clinic facts/prices; no personal medical advice → staff; never imply confirmed availability.

## 4. Data model (summary — schema wins)

| Group | Entities |
| --- | --- |
| Tenancy / identity | Organization (= clinic), User (`locale`, `securityVersion`), OrganizationMembership, Session |
| Authorization | Role, Permission, RolePermission, MembershipPermissionOverride |
| Invitations | AccountInvitation (pilot activation or clinic-scoped with role), AccountActivationEvent |
| CRM | Lead, LeadSource, PipelineStage, CrmSyncLog |
| Conversations | Conversation, Message, OutboundAttempt |
| Knowledge | ClinicFactSheet (saved JSON revisions, tenant/version unique, approvedAt/approvedBy), OrganizationDocumentation, OrganizationKnowledge, OrganizationExperience, OrganizationBattlecard (pgvector `vector(3072)`, OpenAI `text-embedding-3-large`; "Gemini" comments are stale) |
| Config / comms | AiPersona, Channel, Credential, ScheduledFollowUp |
| Operations | Notification (`code`, `params`), AuditLog (`organizationId` nullable for platform actions), OutboxEvent |
| Coming in M1 | Consultation, CoordinatorTask, InternalNote(+Revision), PatientFact, OutcomeEvent, ActionRecord |

- **Lead:** unique per (clinic, phone). Status `NEW, QUALIFYING, QUALIFIED, READY_TO_BOOK, READY_TO_PAY, HANDED_OFF, UNQUALIFIED, WON, LOST`; priority `HOT, WARM, COLD`; currency `USD, TRY, EUR, GBP`; opt-out and media consent live on the clinic's lead (not global). `READY_TO_BOOK` ≠ booked.
- **Conversation:** unique per (clinic, external contact id); `aiPaused`, disclosure sent, **stateVersion**, **generationOwner/generationLeaseUntil**, assignment, channel.
- **Message:** types lead / staff / AI / AI draft / system / tool; status `PENDING, PROCESSING, PROCESSED, SENT, CANCELLED, FAILED, DELIVERED, READ`; processing owner/lease; provider id; outbound idempotency key. Patient media is still base64 in `mediaUrl` with 30-day expiry (KI-026).
- **OutboundAttempt:** durable send intent; status `PENDING, SENDING, ACCEPTED, UNKNOWN, FAILED, CANCELLED`.
- DB roles: `omnix_backend_runtime` (CRUD), `omnix_python_runtime` (reads conversations/leads/messages/battlecards/experiences, writes knowledge/embeddings only). Migrations run as `postgres` via `npm run db:deploy`. `Channel.accessToken` / `Organization.metaAccountId` are legacy (KI-008).

## 5. AI agent (Python)

Graph (`app/modules/agent/`): `extract_and_classify` → router (`edges.py`) → qualification / objection / value-pitch / closing / general-QA writers → `compliance_checker`; out-of-domain path separate; `summarizer`. The servicer wraps it: load state → deterministic **input policy** → graph → deterministic **output policy** (`check_output` on every reply) → action validation → reply. Any invalid action, tool failure or blocked output replaces the **whole** reply with a fixed handoff (fail closed).
Models come from validated settings (defaults `gpt-5.6-luna` / `gpt-5.6-terra`, unverified — KI-006); embeddings `text-embedding-3-large`. Persona (AiPersona): agent name, clinic name, tone, rules, handoff message, disclosure text — filtered by `_safe_persona` (anti-injection).
AI-2 coordinator (`app/modules/coordinator/`) is opt-in via `COORDINATOR_V2_ORG_IDS`: validated comma-separated clinic UUIDs, empty = v1. The servicer retains input policy → coordinator → `check_output` → contract-v1 action validation → fail closed. V2 uses the flagship model and 30 playbook guidelines, without extraction/compliance-checker loops; one initial call plus at most one tool round (≤2 tool calls) and one reply continuation. Tools are `escalate_to_human` (reason max 500 characters), `save_patient_facts` (existing UPDATE_LEAD name/country fields plus UPDATE_SUMMARY), and, for large fallback collections, existing tenant-filtered knowledge search. No new action types. V2 stores treatment interest, travel window, photo-sent and text-derived mood in the existing lead summary as JSON `format: omnix.patient-summary.v1`, alongside cumulative summary and handoffSummary; legacy plain summaries remain readable. Both model and deterministic input-policy handoffs persist a summary for linked v2 patients.
`DatabaseService.get_approved_clinic_facts` reads the request tenant’s latest approved `clinic_fact_sheets` revision off the event loop; draft saves never alter an approved revision. Only enabled offers with timezone-aware inclusive validFrom/validTo instants are supplied. Approved sheets replace legacy knowledge in the v2 prompt; no approved sheet falls back to existing knowledge (offers from fallback are not advertised). Exact active-offer text alone may pass the offer-word output gate; clinical, urgency and booking gates still apply.
`DatabaseService.get_clinic_knowledge` reads the request tenant's existing `organization_knowledge` off the event loop; all content fits in prompt when ≤ `COORDINATOR_KNOWLEDGE_MAX_CHARS` (default 24000, validated 1–200000), otherwise retrieval is offered. This collection has **no approval flag** (KI-094): only enable clinics whose uploaded knowledge has been approved operationally. Knowledge, facts, summaries and speaker-labelled recent messages are JSON-quoted untrusted data, never system instructions.
Python options: `FLAGSHIP_REASONING_EFFORT`, `EXTRACTOR_REASONING_EFFORT`, `CHEAP_REASONING_EFFORT` (none/minimal/low/medium/high/xhigh) and matching `*_TEMPERATURE` (finite 0–2); unset/empty options are omitted, invalid values stop startup. Evals use identical validation plus `EVAL_PATIENT_REASONING_EFFORT`/`EVAL_PATIENT_TEMPERATURE`, `EVAL_JUDGE_REASONING_EFFORT`/`EVAL_JUDGE_TEMPERATURE`. `python -m evals.run --agent v1|v2` defaults to v1; shell-only configuration, synthetic fixtures, no dotenv reads. Initial AI disclosure is backend-owned; judge requires it in a reply only when asked, and photo requests must explain purpose. Redacted provider messages survive servicer handoffs into reports.
Retrieval: top-4 pgvector chunks, clinic-filtered, no relevance cutoff yet. Tools that find nothing return `UNVERIFIED:` strings → handoff. Known behavior gaps (forced qualification, EN-centric detection, no provenance, fixed nudges) are **KI-020 → Phase 3 rebuild**, not patched piecemeal. Target behavior spec: `reference/plan/AI_PATIENT_JOURNEY_SPEC_2026-09-27.md`.

### AI-3c — model comparison architecture (planned 2026-10-10)

[verified] The existing `evals/run.py` builds five `MeteredModel` roles and calls `evaluate` through the in-process `AgentHarness`. The harness suppresses dotenv, substitutes synthetic DB/tool results and invokes the real servicer/policies. `Ledger` currently applies one input/output rate pair to every role; reports contain model names but not resolved options, role costs, timing or a machine-readable run manifest. Eval calls use a 20-second timeout, zero retries and 1024 output tokens; production uses configured timeouts/retries and has no equivalent factory output cap. These differences must be disclosed.

[proposed — implementation authorized by AI-3c card] Extend this existing path; do not create a second agent or change production prompts/configuration. Capture an allowlisted run manifest, per-role token/cost/call accounting and monotonic agent-turn timings. Save versioned JSON alongside the existing human-readable report inside ignored `evals/reports/`. An offline `evals.compare` command validates two manifests and compares the same scenario IDs, overall/per-language outcomes, hard-check failures, handoffs, latency and writer-only estimated cost. It never instantiates an API client or imports application settings.

The comparison varies only the v2 writer model and explicitly declared writer options. Patient/judge/extractor/checker settings, fixtures, rubric, code revision and execution limits must match. Dynamic patient continuations can differ; this is a controlled configuration comparison, not identical transcript replay or statistical proof. Synthetic fixtures and recorded action proposals do not prove DB execution, production retrieval or patient readiness. Full implementation instructions: `reference/plan/PRODUCT_EXECUTION_TASKS.md` → **AI-3c — coordinator model comparison**.

## 6. Backend — `apps/backend-v2` (NestJS)

Old review rating 2.9/5, keep & improve.
```bash
npm ci && npx prisma generate
npm run db:deploy        # ⚠ migrations + credential upgrade, dev DB only; the only supported migration entry point
PORT=3000 npm run start:dev   # Nest defaults to 3001 = Next's port (KI-004)
npm run build && npm test     # unit (Jest)
npm run lint && npm run lint:baseline   # add no new warnings
npm run test:e2e         # disposable DB; prefer ./test_e2e_pilot.sh from the repo root
npm run pilot:invite     # operator CLI (src/auth/invite-cli.ts); recovery: src/auth/recovery-cli.ts
```
Where things are: `src/main.ts` (HTTP + Socket.IO, `rawBody: true`), `src/app.module.ts`. Workers (BullMQ): `whatsapp-messages` → WebhooksProcessor, `ai-reply` → AiReplyProcessor, `follow-up` → FollowUpProcessor, `outbox-relay` → NotificationRelayProcessor. Crons run in-process (outbox poll, lease recovery, outbound retry + SENDING→UNKNOWN, follow-up recovery, media cleanup, socket revalidation) → **one instance only** (KI-033). `src/webhooks/` (~3.3k lines: ingress, claims, AI reply, outbound, action executor, media). `src/prisma/prisma.service.ts` tenant-scoping extension + raw-SQL guard. `src/core/` tenant ALS, outbox, guards, logger, metrics. `src/events/events.gateway.ts` sockets with per-emit permission check. `src/credentials/` AES-GCM credentials + `deploy-cli.ts`. `src/platform/` platform admin (N4, `PLATFORM_ADMIN_EMAILS` allowlist, non-admins get 404). `src/organizations/clinic-facts.*` GET/PUT `organizations/current/clinic-facts` and POST `approve` (all `organization:manage`, audited; expectedVersion protects saves, approval requires latest version, clinic-row lock serializes mutations). New migration `20261007000000_clinic_fact_sheets` grants Python SELECT. `src/organizations/clinic-team.*` team page + role change/removal (N5, `organization:manage`, D-026). Security: global `CsrfGuard`, Redis throttler on auth/invitation routes, `trust proxy 1`, `GrpcClientService` adds the internal secret + deadlines. Ops docs: `docs/reference/ops/`.

**WhatsApp coexistence (M4):** `META_GRAPH_API_VERSION` defaults to `v26.0` and supplies WhatsApp, media, Instagram and the SDK configuration. Optional `META_APP_ID` + `META_EMBEDDED_SIGNUP_CONFIG_ID` enable the Settings flow; the founder must create a **v4** Login for Business configuration and subscribe app fields `messages`, `account_update`, `history`, `smb_app_state_sync`, `smb_message_echoes`. Server exchanges the code and discovers one granted Messaging account/coexistence number; no browser token or asset IDs are accepted. Subscription/sync failures are stored on `Channel.metadata`; contacts and history are each requested once within 24 h, and uncertain one-time requests are never blindly retried. History uses the signed ingress, read-only messages and paused conversations without qualification; it does not open a Cloud API service window. Phone echoes store `USER_TEXT`/`HUMAN` with `WHATSAPP_PHONE` origin, pause + bump `stateVersion` and audit in one transaction; an unknown contact creates a paused conversation without a lead. Inbox HTTP exposes only safe `origin` values (socket events invalidate/refetch the HTTP detail). No schema migration; legacy plaintext columns remain unused (KI-008).

**Deliberate — don't "clean up":**
- Signature verified on `request.rawBody`, never `@Body()`.
- Webhook runs under system bypass; the worker resolves the tenant from the channel and **drops** missing/ambiguous matches (`take: 2`).
- UNKNOWN/SENDING are never resent (return `WAITING`); SENDING → UNKNOWN after 2 min; only HTTP 429 / provider `failed` retry (≤ 3).
- Two authorization checks around the SENDING claim + per-bubble pause/opt-out checks: intentional.
- Every inbound bumps `conversation.stateVersion`; `finish` only touches rows the owner holds.
- Outbox groups `generate-reply` per conversation with a 7 s debounce.
- Prisma proxy: raw SQL throws outside system scope; `Message` scoped via its conversation; `upsert` on `Message` refused; `tenantStorage.enterWith` in `JwtStrategy.validate` only after the membership check.
- Signup → 403, verify-email → 410 (invitation-only). Free-form sends cancelled outside the 24 h window (no templates yet).
- Refresh-token reuse revokes the family, except a token rotated ≤ 10 s ago in a live family (parallel tabs, D-025).
- Live notifications carry only a generic invalidation; details via HTTP.
- Applied migrations are forward-only: add a new one, never edit (e.g. `20260930000000_least_privilege_roles`, KI-013).
**Fix, don't extend:** follow-up processor runs actions before storing bubbles (KI-061); AI authority over lead status/phone/email in `action-executor.service.ts` (KI-024); `src/follow-ups/` duplicates ai-reply send logic (merge later behind e2e tests). `ERD.svg` is stale (KI-089).

## 7. Frontend — `apps/frontend-v2` (Next.js)

Old review rating 2.6/5: keep the session/API core, the Inbox was rebuilt (C14 slice, `src/features/inbox/`).
```bash
npm ci && npm run dev    # next dev -p 3001
npm run build && npm test   # vitest
npm run lint && npm run lint:baseline   # baseline empty: add no warnings
npm run generate:api     # Orval from openapi.json
npx playwright test      # browser suites; only when a card asks (see reference/ops/PLAYWRIGHT_TESTS.md)
```
Env names: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL` (not a Docker build ARG yet, KI-040). i18n TR/EN/AR (N1), strings in `messages/`.
**Rules:** server data only through generated Orval hooks + TanStack Query; never hand-edit `src/lib/api/generated`, `src/lib/api/model`, `socket-events.generated.ts`, `openapi.json` — fix the backend OpenAPI and regenerate (KI-041). Socket events update the Query cache via generated key getters, de-duped by message id. The backend is the only permission authority (UI hiding ≠ security; never PATCH masked PII back). Every async view has loading/empty/error states — an error never renders as "no messages" (KI-037). Manual send only while the AI is paused; show delivery status (PENDING/SENT/FAILED/UNKNOWN); never show an AI draft as sent. Copy follows the claims policy. Turkish/Arabic must render (latin-ext fonts, RTL). Feature folders, files < ~300 lines, brand tokens only.
**Deliberate:** session core (`src/lib/session-manager.ts`, `session-scope.ts`, `socket-runtime.ts`, `api/axios-client.ts`, `hooks/useSocket.ts`): `installSession` clears caches synchronously; the interceptor throws `CanceledError('Stale session response')` on stale identity; token refresh uses bare `axios.post`; `resetSession` ends with `location.replace('/login')`; access token in memory only. `/signup` shows invitation-only.
Routes: `/`, `/login`, `/signup`, `/accept-invitation`, `/recover`, `/onboarding/create-organization`, `/dashboard` (+ `leads`, `conversations` = Inbox, `settings/*` incl. `team` and `clinic-facts`, profile, platform admin); `/dashboard/conversations/[id]/report` is a browser-print patient report using permission-checked Inbox detail/history, with older-event pagination before printing.
Brand tokens (`globals.css`): navy `#01081A`, electric blue `#0F76EC`, cyan `#1BC4F5`, glow `#5AE5F3`, violet `#9786FA`, deep blue `#083FCA`, ice `#F4F6FF`. Fonts Inter + Montserrat (local). Logos in `assets/brand/`.

## 8. Python AI — `apps/python-ai-service-v2`

Old review rating 2.4/5: keep the shell (auth interceptor, tenant-scoped SQL, action contract, fail-closed handoff); the graph and prompts get replaced in Phase 3.
```bash
python3.13 -m venv .venv && .venv/bin/python -m pip install -r requirements-dev.txt
OPENAI_API_KEY=synthetic-test-key INTERNAL_RPC_SECRET=synthetic-rpc-secret \
  DATABASE_URL=postgresql://synthetic:synthetic@127.0.0.1:5432/omnix_synthetic .venv/bin/python -m pytest -q
.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000   # /health; gRPC on 50051
bash scripts/generate-proto.sh
```
Active code = what `main.py` imports: `app/grpc_services/` (`agent_servicer.py` real entry, `document_servicer.py`, `auth_interceptor.py`), `app/modules/agent/`, `app/modules/rag/` (`retriever.py`, `document_processor.py`, `experience_processor.py`), `app/modules/safety/policy.py`, `app/infrastructure/` (`database_service.py` = tenant-scoped reads via `to_thread`, use this pattern; `llm_factory.py`), `app/core/config.py`.
**Rules:** never change leads/conversations from Python (AI proposes, Nest executes); every SQL filters `organizationId` from the **request**, never from model output; every reply path passes `check_output`; never return error strings to patients; patient text, transcripts, image descriptions, retrieved chunks and summaries are **untrusted data**, never `SystemMessage` (KI-050); staff messages are not patient messages; no human persona or timing promises; new LLM calls get `timeout`/`max_retries`; per-role reasoning/temperature are optional (unset or empty = omit); no sync DB calls on the event loop; log ids/counts only, never message text; no LangSmith on real data (KI-058). Tests mock the DB — a green suite does not prove SQL is valid; check against the Prisma schema.
**Deliberate:** `_safe_persona` keeps only allow-listed tone words + 3 rule keys; tools return `UNVERIFIED:` instead of raising; `escalate_to_human` returns a JSON action and never touches the DB; history excludes the new message ids (appended separately); `contractVersion == 0` accepted. Dead but present: tools `create_lead` / `update_patient_profile` / `schedule_follow_up`, the CREATE_LEAD hook, `tool_failure` state key.

## 9. Setup, env names, ports

Env **names only** (never values): Backend `DATABASE_URL` (migrations), `RUNTIME_DATABASE_URL` (runtime, least-privilege), `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRATION`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `INTEGRATION_CREDENTIAL_KEY` (32-byte base64, persistent), `PATIENT_MEDIA_RETENTION_DAYS` (default 30), `INTERNAL_RPC_SECRET`, `PYTHON_SERVER_URL`, `INTERNAL_GRPC_TLS`, `INTERNAL_GRPC_PRIVATE_NETWORK` (D-022), `PLATFORM_ADMIN_EMAILS` (optional allowlist), `PORT`, `FRONTEND_URL`, `NODE_ENV`. Python `OPENAI_API_KEY`, `DATABASE_URL`, `INTERNAL_RPC_SECRET`, `ENVIRONMENT`. Frontend `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`. Backend config is validated at startup (`src/config/env.validation.ts`); add new vars there and here.
Ports (docker-compose): Postgres 15432, Redis 16379, Backend 3000→3001, Frontend 3001, Python gRPC 50051, Python HTTP 8000. The compose stack is not fully runnable (KI-067). Trap: `apps/backend-v2/.env` is auto-loaded from the cwd — run local QA servers from a clean cwd.

## 10. Engineering standards (short)
Understand before changing; characterize untested behavior with a test first; refactor and behavior change in separate commits; small steps (strangler for replacements); contract first, then consumers. Backend: thin controllers → services → domain → Prisma; tenant scoping central; one place defines each state machine; typed errors, no PII in errors/logs; side effects through the outbox, idempotent handlers. Delete dead code only after proving it unused. Commit messages `type(scope): summary`.

## 11. Glossary
Organization = clinic (tenant) · Membership = a user's role in one clinic · Lead = prospective patient (unique per clinic + phone) · Conversation = thread with one contact on one channel · Takeover/handoff = staff own it, AI stops (`HANDOFF_TO_HUMAN`, `HANDED_OFF`) · AI pause = flag blocking AI replies · Disclosure = "you are talking to an AI" message · stateVersion = conversation version; replies built for an older version are stale · Generation lease = which worker may write the next AI reply, until when · Inbound claim = makes one provider message processed once · OutboundAttempt = durable send intent · UNKNOWN = provider may have accepted; don't retry · Outbox = DB-committed events relayed to queues · Action proposal = AI-suggested action, Nest validates · Battlecard = approved objection-handling material · Experience = approved case story (permission needed) · READY_TO_BOOK = intent, not a booking · Draft mode = AI suggests, staff approve each send.
