# Issues, open questions, ideas

_Merged 2026-10-06 from the old `memory/known-issues.md`, `open-questions.md`, `parked.md`, `improvement-backlog.md` (D-027). Open items only — when something is fixed or answered, remove it and add one line to "Closed"/"Resolved"._
**Next free ids:** KI-091 · Q16 · IMP-019. Format: **id — title** · severity · status · what remains · owner.

## 1. Known issues (KI)

### High

**KI-002 — Internal gRPC transport in production** · high · partial
Staging proven with private-network transport (D-022). Remains: apply the same settings to production; TLS mode never deployed. Owner: founder (P1-11 close-out).

**KI-013 — Committed DB role passwords** · high · partial
`db:deploy` sets passwords from secrets (WP-C); staging rotated (P1-11). Remains: production rotation with the P1-11 procedure. Owner: founder (close-out d).

**KI-018 — No scheduled backups** · high (before real data) · partial
Isolated staging exists; manual pg_dump/restore rehearsed. Remains: scheduled backups (D-023), production backups. Owner: founder (close-out c).

**KI-020 — AI behavior gaps (CTO review 09-27)** · high (before patients) · open
Booking/qualification edges, retrieval without relevance cutoff/provenance, follow-up template/window, conversion analytics. Owner: developer, Phase 3 (C09–C12).

**KI-026 — Patient media stored as base64 in `messages`** · high · partial
30-day expiry + bounded download done (WP-B). Remains: move media out of `messages.mediaUrl` (IMP-011). Owner: developer, P2-07.

**KI-037 — Read errors render as empty states** · high · partial
Inbox/dashboard fixed (WP-D). Remains: other screens, client error reporting. Owner: developer, P2 UI cards.

**KI-050 — Untrusted text in prompts** · high · partial
Summary/retrieval wrapped as untrusted data (WP-A). Remains: vision description in system prompt (feature off by default), EN-heavy injection regex. Owner: developer, Phase 3.

**KI-058 — Patient photos to OpenAI vision** · high · partial
Default off (WP-A). Remains: LangSmith tracing env unknown; subprocessor/consent decision before enabling. Owner: founder (F03).

**KI-074 — No Railway health check; failed start replaces working deploy** · high (before real traffic) · open
Set Healthcheck Path `/health` on Backend (+ Python/Frontend), re-test missing-variable case, rehearse rollback. Owner: founder (close-out b) + developer re-test.

### Medium

**KI-005 — LLM compliance check skipped on out-of-domain path** · med · partial
Deterministic `check_output` covers every reply; "conversation not found" hole closed (KI-054). Remains: LLM checker on OOD path. Owner: developer, Phase 3.

**KI-006 — Default model strings unverified** · med · partial
Models now come from validated Python Settings (WP-C). Remains: confirm the default names (`gpt-5.6-luna/terra`) exist for the account. Owner: developer/founder (status unverified).

**KI-010 — Environment config not fully audited** · med · partial
Backend `validateEnv` + Python Settings done (WP-C). Frontend env not audited (status unverified). Owner: developer.

**KI-017 — npm advisories need breaking upgrades** · med · open
Next.js, Prisma, mysql2. Triage relevance before pilot. Owner: founder close-out e / developer.

**KI-033 — Single-instance deployment assumption** · med · partial (accepted constraint)
Health/ready, metrics token, Swagger off, pre-deploy migrations done. Remains: no Socket.IO Redis adapter, crons in-process, uploads on local disk → keep 1 replica. Owner: founder to confirm.

**KI-041 — OpenAPI response schemas wrong/missing** · med · partial
Inbox schemas fixed (WP-D). Remains: auth/lead casts. Owner: developer, P2 cards.

**KI-044 — CSP not enforceable** · med · partial
Headers + report-only CSP (WP-C). QA-1: inline scripts/styles and eval; Dicebear request removed by QA-1F frontend c2115c4. Needs nonce/hash policy, then enforce. Owner: developer, hardening before real traffic.

**KI-045 — Turkish i18n incomplete** · med · partial
Inbox TR/EN + Latin-ext fonts (WP-D). Remains: other screens English; native review (Q13). Owner: developer P2 + founder.

**KI-055 — Python event-loop blocking** · med · partial
Timeouts/turn deadline/config done (WP-C C2.2). Remains: sync DB calls in `tools.py`/`document_processor.py` (status unverified). Owner: developer.

**KI-056 — Document ingest provenance** · med · partial
Atomic replace + 10 MiB cap (WP-C). Remains: DeleteFile keyed by `file_name`, page provenance, embedding batching (IMP-012). Owner: developer.

**KI-059 — UI copy breaks claims/identity policy** · med · partial
Inbox/drawer/dashboard/login fixed (WP-D). Onboarding/channels brand corrected by QA-1F frontend c2115c4. Remains: public/settings claims. Owner: developer, C14 copy pass.

**KI-067 — Local dev/compose not runnable (includes KI-001)** · med · open
Compose sets `REDIS_HOST/PORT` but the app reads `REDIS_URL`; lacks `INTERNAL_GRPC_TLS`, `JWT_*`, RPC secret, `META_VERIFY_TOKEN`, Python target vars; the backend repo tracks a second, different `docker-compose.yml` — pick one canonical dev stack. `.venv/bin/uvicorn` shebang stale (use `python -m uvicorn`); `test_e2e_pilot.sh` not executable. Owner: developer.

**KI-068 — Stranded PENDING memberships in production** · high→med · partial
Code fixed (c1fdac4); staging clean. Remains: production check with the KI-013 rotation. Owner: founder (close-out d).

**KI-081 — Multi-clinic staff stranded after login** · med · open
Login form has no clinic picker; null organization → onboarding. Existing memberships already prevent new clinic creation (QA-1F F6). Owner: developer, P2-01.

**KI-088 — Older QA items never re-confirmed in code** · med · open (status unverified)
From the archived cleanup manifest §4: paused conversation drops rest of a webhook batch (QA 19/T16); credential rotation leaves channels on inactive credential (QA 21/T23); input check on the batch actually sent (QA 4/T09); newest-N history window to Python (QA 14/T19); React Query keys vs socket invalidation keys; saved persona reaches prompts (QA 17/T24). Check each; fixed → close, broken → own KI. Owner: developer (QA pass).

### Low

**KI-004 — Port collision Nest vs Next** · low · open
Nest defaults to 3001 (`main.ts`). Set `PORT` explicitly. Owner: developer.

**KI-007 — Stale Gemini comments** · low · partial
Google packages removed (Python 8899571). Remains: "Gemini" comments in `schema.prisma`. Owner: developer.

**KI-008 — Legacy `Channel.accessToken` / `Organization.metaAccountId` columns** · low · open
No runtime reads; schema cleanup only. Owner: developer.

**KI-073 — `scripts/*.ts` ship in the backend image** · low · open
`tsconfig.build.json` does not exclude `scripts`; excluding changes dist layout. Owner: developer.

**KI-075 — Internal secret rotation has no overlap** · low · open (accepted for pilot)
~1 min of refused AI calls during rotation. Owner: founder accepts / developer later.

**KI-087 — Turkish consent text requires English commands** · low · open (fold into Q13)
Owner: founder (Q13) + developer.

**KI-089 — Stale backend `ERD.svg`; local `uploads/` provenance unknown** · low · open
`ERD.svg` last changed 2026-09-03 (fe044ef), 22 schema commits ago (no OutboundAttempt). Regenerate or delete in a docs pass. Backend `uploads/` (ignored, local PDFs): confirm synthetic or delete locally. Owner: developer / founder.

---
**Closed** (full text in git history / backup zip): KI-076 2026-10-06 (M4: one `META_GRAPH_API_VERSION`, default v26.0, including media and SDK); KI-015 2026-10-06 (monorepo, no peer token — D-027); KI-003, 009 (→021), 011, 012, 014, 016, 019, 022, 023, 024, 025, 027, 028, 029, 030, 031, 032, 034, 035, 036, 038, 039, 040, 042, 043, 046, 047, 048, 049, 051, 052, 053, 054, 057, 060, 061, 062, 063, 064, 065 (→068), 069, 074a, 077 (D-020 recorded 2026-10-04); 001 folded into 067; 021 + 066 fixed 2026-10-04 by CLN-1 (backend 95a9c46, frontend 364da78, Python 8c1d515; merged). KI-071 was never assigned. QA-1F fixed 2026-10-04 on `qa-1f/fixes` (merged to `main` 2026-10-04): KI-070 backend 74202ca; KI-078 backend 71897f4; KI-079 frontend 6e92264; KI-080 backend eb24f85; KI-082 Python 4ff4ec5; KI-083 backend 700ff29 + Python 91c24ad; KI-084 frontend c2115c4; KI-085 backend 0b3576b + frontend c3b49a5; KI-086 backend 35a9cae; KI-090 backend 5d505b0; KI-072 backend 194697f + frontend f416701 (lint-staged installed, existing `.lintstagedrc.json` used). Fix details and verification: old evidence QA-1_2026-10-04 (backup zip).
Pending wording (not KIs): KI-025/060/047 copy drafts → F02; KI-064 Turkish STOP words → Q13.

## 2. Open questions (Q)

### Q15 — Coexistence: should old contacts stay AI-paused?
- Raised: 2026-10-06 (M4 review). Today, every conversation created from imported WhatsApp history (up to 180 days back) or from a phone-app echo to an unknown number is created **AI-paused and without a lead**. So after onboarding, the AI answers only brand-new contacts; existing patients stay with staff until someone resumes the AI.
- Options: (a) keep it (safe: existing patients have a human relationship) — recommended for the pilot; (b) AI may answer old contacts after N days of silence; (c) clinic chooses in settings.

### Q14 — Pilot mode for the first clinic
- Raised: 2026-10-06 · Needed before the pilot gate (`PLAN.md`).
- Options: (a) **draft mode** — the AI writes a suggestion, staff approve or edit every reply before it is sent (recommended: AI quality gaps KI-020 are not fixed until Phase 3); (b) AI answers on its own on approved topics, staff watch. Check in code how much of (a) exists (`AI_DRAFT` message type) before M3 ends.

### Q3 — Which LLM provider/models for the pilot?
- Raised: 2026-09-30
- Source strings `gpt-5.6-luna` / `gpt-5.6-terra` unverified (KI-006). Models come from validated config (WP-C).
- Partly decided (D-013): selection happens in C13 by EN/TR evaluation, not now. Remaining: which candidates and budget.

### Q4 — Deployment target and environments
- Raised: 2026-09-30
- Partly decided: Railway, `staging` + `production` environments (D-022, D-023). Remaining: production backups/health checks (KI-018, KI-074) and hosting location for KVKK (F03).

### Q5 — First pilot clinic(s)
- Raised: 2026-09-30
- Who, languages, which treatments/knowledge, staffed hours, escalation contacts. Founder track F01.

### Q6 — Privacy/legal owner acceptance
- Raised: 2026-09-30
- KVKK/GDPR notice, retention, subprocessors, cross-border transfer — who signs off? Founder track F03.

### Q10 — Who owns founder tasks F01–F03 now?
- Raised: 2026-09-30
- CTO plan says start F01 (design partner) and F02 (knowledge pack) immediately; they're on the critical path for Phases 3 and 5. Status unknown.

### Q11 — How to set up persona "teams" (engineering + marketing)?
- Raised: 2026-09-30
- Options: (1) Claude Code subagents in `.claude/agents/*.md`; (2) Claude Code agent teams (experimental); (3) Paperclip (self-hosted, young); (4) code frameworks only if building a product feature.
- Recommendation given: start with (1), add (2) for parallel review/research, (3) only for scheduled autonomous marketing. Needed from user: which roles first.

### Q13 — Native Turkish review of STOP/START words and patient-facing copy
- Raised: 2026-10-03 · Source: WP-B review, WP-B1 F1/F2
- Needed: a Turkish speaker (ideally the design partner) confirms the STOP words (`mesaj gönderme`, `artık mesaj`, proposed `durdur`, `abonelikten çık` / `abonelikten cik`), whether bare `dur` should count (ambiguous: "wait"), START (`BAŞLA`), and the draft EN/TR handoff, consent-request and disclosure copy (F02). `iptal` / `cancel` are deliberately not opt-outs (D-021). Final lists: old evidence WP-B1_FOLLOWUPS_2026-10-03 (backup zip). Also covers KI-064 / KI-087.

---
**Resolved:** Q1 → D-008 · Q2 → D-009 (now D-027) · Q7 monorepo → D-027 · Q8 → D-017 · Q9 → D-019 · Q12 → D-020. Parked list: empty (CI token item closed by D-027).

## 3. Improvement ideas (IMP) — open only

- **IMP-003 Startup config validation everywhere** · partial — backend + Python done; frontend env schema open (KI-010).
- **IMP-004 One source for the action contract** · idea — generate TS + Python from one JSON Schema.
- **IMP-005 Validated LLM models** · partial — config done; default names unverified (KI-006).
- **IMP-006 Safety check on every reply path** · idea (KI-005).
- **IMP-007 Retrieval evaluation set** · idea — fixed question set per clinic (recall@k, groundedness); Phase 3.
- **IMP-011 Patient media in encrypted object storage** · planned with P2-07 (later) — KI-026.
- **IMP-012 Performance/cost after the first clinic** · deferred.
- **IMP-019 Rename apps (drop `-v2`)** · idea — touches scripts, Docker, Railway root dirs; only if it saves real confusion.
Done/rejected history (IMP-001…018): old `memory/improvement-backlog.md` in the backup zip.
