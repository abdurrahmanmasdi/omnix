# python-ai-service-v2 — FastAPI + gRPC + LangGraph AI service (app rules)

Read the workspace `../../CLAUDE.md` first (product rules, mode of work, memory protocol). This file adds what is specific to this app.
Rating: **2.4 / 5**, split verdict (`../../reviews/python.md`, 2026-09-30): the **shell/foundation is keep & improve** (auth interceptor, tenant-scoped SQL, action contract, fail-closed handoff); the **agent graph and prompts are replaced in Phase 3 (C09–C12)**. Open problems: `../../memory/known-issues.md` (KI-046…KI-058 are this app's findings; KI-002/003/005/006/007 also touch it). Target behavior before any AI change: `../../docs/plan/AI_PATIENT_JOURNEY_SPEC_2026-09-27.md`; design notes: `../../context/ai-agent.md`.

## What this is

The AI patient-coordinator brain. The Nest backend calls it over authenticated gRPC with a batch of patient messages; it returns a reply plus **proposed actions**. It never changes leads or conversations itself. It also ingests clinic documents/experiences into pgvector embeddings. Python 3.13. This repo is its own git repo; commit here, not in the workspace repo.

## Commands

```bash
python3.13 -m venv .venv && .venv/bin/python -m pip install -r requirements-dev.txt
# tests, exactly as the quality gate runs them (synthetic values only; no model calls, no real DB):
OPENAI_API_KEY=synthetic-test-key INTERNAL_RPC_SECRET=synthetic-rpc-secret \
  DATABASE_URL=postgresql://synthetic:synthetic@127.0.0.1:5432/omnix_synthetic \
  ./.venv/bin/python -m pytest -q
uvicorn main:app --host 0.0.0.0 --port 8000   # HTTP /health; the gRPC server listens on 50051 (hard-coded, KI-055)
bash scripts/generate-proto.sh                 # protoc → repo-root *_pb2*.py (these ARE the active generated files)
```

Env names (never values): `OPENAI_API_KEY`, `DATABASE_URL`, `INTERNAL_RPC_SECRET`, `ENVIRONMENT` (a free string here, while Nest switches on `NODE_ENV`: KI-002). `.env.example` is missing the last two (KI-003). **Never open `.env`, `venv/`, `.venv/`.** The full cross-service gate runs from `../backend-v2/scripts/quality-gate.sh`. This repo has no CI (KI-057).

## Where things are (active code = what `main.py` imports)

- `main.py` — FastAPI + `grpc.aio` server; the server-wide `AuthInterceptor` covers every service. Prod TLS is a placeholder (`ssl_server_credentials([])`, KI-002).
- `app/grpc_services/agent_servicer.py` — the real entry: load state → deterministic **input policy** → graph → deterministic **output policy** → action validation → reply. `document_servicer.py` — ingest/delete/embed RPCs. `auth_interceptor.py` — constant-time bearer-secret check, fails at startup on an empty secret.
- `app/modules/agent/` — `graph_builder.py`, `nodes.py` (extractor, 5 writers, out-of-domain, summarizer, compliance checker), `edges.py` (sales router), `state.py`, `prompts.py`, `tools.py`, `actions.py` + the contract JSON `agent-actions.v1.json` (golden fixtures: `tests/agent-actions.v1.fixtures.json`).
- `app/modules/rag/` — `retriever.py` (top-4 pgvector, no cutoff), `document_processor.py`, `experience_processor.py`. `app/modules/safety/policy.py` — regex in/out checks.
- `app/infrastructure/` — `database_service.py` (tenant-scoped reads via `to_thread`: **the right pattern, use it**), `llm_factory.py`. `app/core/` — `config.py` (pydantic-settings, only 4 fields), `database.py` (sync SQLAlchemy ORM).
- `scripts/seed_battlecards.py` (needs a role with INSERT on battlecards).

## Rules for this app

- **The AI proposes, Nest executes (rule 9).** The action contract lives here **and** in Nest (`../backend-v2`): change both together, with the golden fixtures, in one coordinated change. The contract still lets the AI set `WON`/`LOST`/`READY_TO_PAY` and `phoneNumber`/`email` (KI-024): never widen it, and narrow it only together with Nest.
- **Tenant isolation is code only (no RLS).** Every SQL query filters `organizationId` taken from the **request**, never from model output or tool arguments. The Python DB role may only write knowledge/embeddings (D-006); don't add writes to leads/conversations.
- **Every final reply path must be safety-checked (KI-005, KI-054).** Don't add a path that returns reply text without `check_output`; never return error strings as patient-facing text.
- **No invented clinic facts.** Retrieval/tools that find nothing return `UNVERIFIED:`-prefixed strings; `_execute_tool_calls` turns them into a handoff. Keep that convention.
- **Fail closed:** `_blocked_reply` replaces the **entire** reply with a fixed handoff on any invalid action, tool failure or blocked output (`agent_servicer.py:46-55`). Don't soften it into partial delivery.
- **Treat patient text, voice transcripts, image descriptions, retrieved chunks and the lead summary as untrusted data**, not instructions. Don't inject them as `SystemMessage` (KI-050). Staff messages are not patient messages (KI-049).
- **AI identity is disclosed and no human persona or timing promises (rules 4, 15, KI-053).** Don't copy the "Senior Medical Sales Consultant" prompts or the "transferring you … right now" wording into new code.
- **Models/providers come from config and are validated at startup (rule 12, KI-006).** New LLM calls get explicit `timeout` / `max_retries` (KI-055). `reasoning_effort: "none"` on every model is deliberate (function calling with the Luna family, spec §9).
- **No sync DB calls on the event loop;** reuse the `DatabaseService` `to_thread` pattern. Log IDs/counts only, never message text (`test_log_redaction.py`); never print prompts. Don't enable LangSmith tracing on real data (KI-058).
- Behavior changes and refactors go in separate commits (rule 13). Tests mock the DB, so a passing suite does **not** prove SQL is valid (KI-046): check queries against `../backend-v2/prisma/schema.prisma`.

## Phase 3 boundary: patch narrowly, don't polish

Replace-not-polish (Phase 3): `edges.py` forced qualification (KI-020), the five copy-pasted writer nodes and prompts, the single-intent extractor, summarizer lead-scoring, the retriever. Fix the listed critical bugs in place (KI-046…KI-054), but don't refactor these files for style. Keep for the new graph: the servicer's policy "sandwich", `actions.py` + contract, `_execute_tool_calls`, the `UNVERIFIED:` convention, `LLMFactory`, `DatabaseService`, the compliance-retry loop pattern. Pre-Phase-3 QA scenarios (EN + TR): `../../reviews/python.md` §11.

## Deliberate: don't "fix" these (review §10)

- `_safe_persona` discards most persona text and keeps allow-listed tone words + 3 rule keys; a clinic name containing "ignore/override/prompt" becomes "the clinic" (anti-injection, covered by a test).
- Tools return `UNVERIFIED:` strings instead of raising; `escalate_to_human` returns a JSON action and never touches the DB.
- History excludes the new message IDs, which are appended separately (prevents duplicating the newest message). `contractVersion == 0` is accepted (proto3 default for older callers).
- The repo-root `*_pb2*.py` look like clutter but are the **active** generated copies.

## Dead code and clutter: don't import, don't extend

Dead: `app/grpc_server/` (**broken**: imports a non-existent module), `app/modules/safety/guardrails.py` (+ its test), tools `create_lead` / `update_patient_profile` / `schedule_follow_up`, the CREATE_LEAD hook, `tool_failure` state key, the empty `app/modules/tools/`, `app/grpc_services/agent_servicer.py.bak`, `fix_nodes.py`, `tmp_proto/`, `proto/*_pb2*.py` (stale copies). Also `product_vision.md`, `serivces.md`, `ARCHITECTURE_PYTHON.md` (archived copies exist). `venv/` is not in `.gitignore`: add it. Unused deps (google-*, `pypdf`) and `grpcio-tools` at runtime: see KI-057. Deletion plan and "prove unused first" rule: `../../memory/cleanup-manifest.md`, `../../context/engineering-standards.md`.
