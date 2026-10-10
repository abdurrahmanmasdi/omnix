# OmniX — sequential product execution tasks

Created 29 September 2026. Working plan for the founder and one AI developer.

**Start with P1-01. Execute one task, verify it, report the result, and stop.** This file lists the entire delivery sequence, but only Phase 1 is expanded into implementation instructions. After Phase 1 passes, expand Phase 2 in this same file against the then-current code. Do not implement all phases from this document in one run.

**Current phase:** Phase 1 **ACCEPTED** by the founder 4 Oct 2026 (P1-12, D-024). Next: NIGHT-1 (dashboard languages, profile, team, platform admin), then Phase 2 (D-020).  
**Current task:** NIGHT-1 review and merge (`work-packages/NIGHT-1-dashboard-basics.md`; CLN-1 + QA-1F done and merged 4 Oct 2026), then **P2-01** (READY).  
**Phase status:** P1-01…P1-11 executed; cumulative local gate + all DB suites + Playwright green on final main heads (see P1-12 evidence). _Header updated 2026-10-06._  
**Next phase:** Phase 2 — consultation workflow + Istanbul MVP features, expanded below as P2-01…P2-15.

This is the day-to-day execution queue. The [CTO plan](CTO_CLIENT_READINESS_PLAN_2026-09-27.md), [original backlog](CTO_DELIVERY_BACKLOG_2026-09-27.md), and [AI journey specification](AI_PATIENT_JOURNEY_SPEC_2026-09-27.md) remain supporting requirements. The mapping below prevents duplicate work. This file refines execution order; it does not silently waive their release conditions.

## How to use this file

1. Select the first task marked READY whose dependencies are complete.
2. Give the developer the starter prompt below with that task ID. The developer reads the operating rules, that task, and only the relevant references.
3. The developer inspects current code, implements missing behavior, runs the required checks, updates its evidence entry, and stops. If behavior already exists, verify it and close the task without rewriting it.
4. Review the result against the task's acceptance checklist. Mark it DONE only when required evidence exists. A source review is not a passing runtime test.
5. Mark the next task READY. Resolve a blocker or split a task explicitly; do not jump ahead and leave the dependency ambiguous.
6. At the phase review, update the remaining scope and expand only the next phase here.

Routine implementation decisions, necessary local fixes, and compatible development dependencies are part of the selected task. Ask the founder only for missing information or an action outside its authorized scope. Never paste secrets into this file or chat. Production deployment, external messaging, and changes to live data require their own applicable authorization; these planning instructions do not authorize them.

### Copy this starter prompt to your developer

```text
Work in /Users/abdurrahman/Desktop/omnix (apps are in apps/).
Read CLAUDE.md, then docs/plan/PRODUCT_EXECUTION_TASKS.md, its operating rules, and task P1-01.
Execute ONLY P1-01 and the verification needed to complete it.

Inspect the current implementation first. Preserve existing changes and reuse
working code. Follow applicable AGENTS.md files. Use the task's official
documentation references and check compatibility with installed versions.
Implement missing behavior; do not rewrite features merely because they
appear in an older plan. Use synthetic data and isolated test resources.

Update this file's status table and append a concise evidence entry with
changed files, commands, exit codes, results, limitations and remaining work.
If blocked, identify the exact missing input; never mark unrun checks passed.
Stop after this task. Do not start the next task or deploy to production.
```

For the next task, replace **both** occurrences of `P1-01` with its ID. A task includes its implementation and verification, not just a proposed solution.

## What changed since the original CTO plan

Archived 2026-10-04 (CLN-1): `docs/archive/2026-10-phase1-task-log.md` (first section).

## Full phase sequence — later phases remain queued

| Order | Phase and future work, in execution order | Original scope | Exit result |
| --- | --- | --- | --- |
| 1 | **Foundations:** baseline → reproducible sources → contracts → quality gates → service authentication → database privileges → staff invitations → recovery → abuse controls → permission/browser verification → deployment rehearsal → phase review | C01–C04, relevant S01–S18 verification | A tested foundation on which product work can proceed |
| 2 | **Consultation workflow:** narrow domain records → owned handoff/tasks → persistent notes → photo-free consultation request → staff confirmation → reschedule/cancel/attendance → thin usable inbox | C05–C07; early C14; durable action records from C02/C12 | One synthetic patient can reach a staff-confirmed consultation with an owner and recorded outcome |
| 3 | **AI journey:** approved clinic facts → retrieval/answerability → fact memory → multilingual classification → routing/writer → action receipts → model evaluation | C08–C13; remaining C02 semantic envelope | English/Turkish AI is grounded, remembers corrections, respects declines, and handles uncertainty correctly |
| 4 | **Clinic operation:** Today/Inbox/Patients usability → data lifecycle/media policy → WhatsApp send policy/templates → stage-aware follow-through → outcomes/usage reporting | C14–C18 | Clinic staff can operate the product and reconcile its results |
| 5 | **Pilot readiness:** isolated staging → live provider/failure matrix → backup/restore/alerts → complete browser/provider journey → staff training and controlled activation | C19/C20, F01–F04 | Explicit approval for a supervised live pilot based on dated evidence |
| 6 | **Paid delivery:** pilot review → fix observed problems → knowledge/review/quote administration → contracted follow-up → metering/invoicing/offboarding → second clinic | P01–P03, F05 | Repeatable paid service with measured support cost and honest scope |

Do not treat the brief items for Phases 2–6 as ready-to-run tickets. At each expansion, add ordered IDs, exact paths, implementation details and acceptance checks using the structure of Phase 1. Avoid prescribing models or APIs months ahead without rechecking official documentation and the installed versions.

Founder work supports this sequence: identify a design partner and collect workflow requirements now; obtain clinic content/reviewers before Phase 3; finish applicable data/provider/customer arrangements before live data processing; train staff before Phase 5; review pilot economics before Phase 6. Those remain F01–F05 in the original backlog and are not an instruction for the developer to contact anyone.

## Phase 1 operating rules and design choices

**Goal:** make the existing system reproducible and its service/staff boundaries explicit, while preserving completed reliability work. Phase 1 does not authorize patient traffic or claim the product journey is finished.

**Scope:** current infrastructure, contracts, onboarding and account controls. Consultation tables, new sales prompts, model swaps, new CRM connectors, and a full UI redesign belong to later phases.

| Choice | Implementation guidance |
| --- | --- |
| Existing architecture | Keep NestJS, Next.js, Python/LangGraph, Postgres and BullMQ. No framework replacement, new workflow engine or generic repository framework. |
| Dependency inversion | Put shared gRPC credential/deadline handling behind one Nest provider. Keep business services dependent on a narrow client interface, not repeated token logic. |
| Boundary validation | Validate untrusted payloads at entry points; types alone do not enforce runtime rules. Reuse the existing contract definitions and allowlisted DTOs. |
| Transactions and idempotency | Use database constraints and atomic consume/update operations for invitation/recovery/membership state. No provider network calls inside a transaction. |
| Authorization | A valid user/service credential identifies a caller; separately verify its operation, tenant, subject and current permissions. |
| Least privilege | Separate migration/admin privileges, application privileges, Python CRM reads and knowledge writes. Explicitly document that application scoping is not database RLS. |
| Testing | Shared contract fixtures, real disposable-DB tests for transactions/permissions, actual gRPC transport tests, and a small browser suite for session isolation. Retain unit tests where they isolate useful logic. |
| Dependencies | Reuse installed packages. Add Playwright for browser acceptance and `@nestjs/throttler` for HTTP rate controls if no equivalent exists, after checking compatibility. Pin additions and update lockfiles. |
| Version policy | Start with the established Node 22 and Python 3.13 setup. Read docs matching installed major versions; newer web docs are not permission to upgrade the stack. |

The algorithms here are deliberately small: database uniqueness for duplicates, compare-and-set/row locking for single-use capabilities, constant-time secret comparison, atomic Redis counters for rate limits, and current-state checks for authorization. Do not build event sourcing, a service mesh, or distributed consensus for this phase.

### Task status register

Only mark a task DONE when its full acceptance checks are evidenced. `BLOCKED` requires a specific unavailable input; a failing test means work remains. `VERIFIED` means ready for founder/reviewer acceptance, not automatically released.

| ID | Task | Owner | Dependency | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| P1-01 | Baseline and remaining-gap inventory | Developer | None | DONE | Completed 29 Sep 2026 |
| P1-02 | Reproducible sources, dependencies and generated files | Developer | P1-01 | DONE | Completed 29 Sep 2026 |
| P1-03 | Complete the existing contract boundary | Developer | P1-02 | DONE | Completed 29 Sep 2026 |
| P1-04 | Full local and hosted quality gates | Developer | P1-03 | VERIFIED | Hosted run #8 passed on `ci/p1-04-hosted`; integration review pending |
| P1-05 | Authenticated Python RPC client/server | Developer | P1-04 local acceptance | DONE | Completed 30 Sep 2026 |
| P1-06 | Least-privilege DB roles and tenant-bound access | Developer | P1-05 | DONE | Completed 30 Sep 2026 |
| P1-07 | Staff invitations into an existing clinic | Developer | P1-06 | VERIFIED | Completed |
| P1-08 | Secure account recovery | Developer | P1-07 | VERIFIED | Completed |
| P1-09 | Abuse limits and browser session protections | Developer | P1-08 | VERIFIED | Completed |
| P1-10 | HTTP/socket/browser permission verification | Developer | P1-09 | VERIFIED | DB e2e 33/33, Playwright 6/6; PR #5 merged (backend main 82c60c0), hosted CI 2/2 green at the time. Evidence in archived log |
| P1-11 | Isolated deployment and credential-change rehearsal | Developer + founder for infrastructure access | P1-10 | VERIFIED | 4 Oct 2026 staging: boundaries, DB roles, rotations, startup validation, backup/restore pass. Open: health check + rollback rehearsal (KI-074), production KI-013 rotation (founder). `docs/evidence/P1-11_2026-10-04.md` |
| P1-12 | Phase acceptance and next-phase expansion | Developer + founder | P1-11 | DONE — accepted by founder 2026-10-04 (D-024) | 4 Oct 2026: gate exit 0 (Jest 227, Vitest 105, pytest 127, Playwright 6/6), DB suites 14/126 on backend `357f849`, frontend `75dccbd`, Python `81ac3de`; Phase 2 cards P2-01…P2-15 written. Founder acceptance pending. `docs/evidence/P1-12_2026-10-04.md` |

Task sizes should be re-estimated after P1-01: completed S14–S18 work may reduce them, while staff/recovery and infrastructure gaps may add work. Do not repeat the original whole-product estimate as a deadline for this phase. If a task needs several changes, use its numbered steps as internal subtasks and still stop at its defined boundary.

## Phase 1 task cards — archived

Archived 2026-10-04 (CLN-1): `docs/archive/2026-10-phase1-task-log.md`. One pointer per card (grep the heading there):

- `P1-01 — Establish the actual baseline` — VERIFIED/DONE (see register)
- `P1-02 — Make sources and generated artifacts reproducible` — VERIFIED/DONE (see register)
- `P1-03 — Complete the current contract boundary` — VERIFIED/DONE (see register)
- `P1-04 — Prove local quality and hosted CI` — VERIFIED/DONE (see register)
- `P1-05 — Authenticate every Python RPC` — VERIFIED/DONE (see register)
- `P1-06 — Restrict database privileges and preserve tenant boundaries` — VERIFIED/DONE (see register)
- `P1-07 — Invite staff into an existing clinic` — VERIFIED/DONE (see register)
- `P1-08 — Add secure account recovery` — VERIFIED/DONE (see register)
- `P1-09 — Add abuse controls and verify browser session protections` — VERIFIED/DONE (see register)
- `P1-10 — Prove permissions through HTTP, sockets and browsers` — VERIFIED/DONE (see register)
- `P1-11 — Rehearse deployment boundaries and credential changes` — VERIFIED/DONE (see register)
- `P1-12 — Accept Phase 1 and expand Phase 2` — VERIFIED/DONE (see register)

Phase 1 notes (re-estimate, P1-04 external-evidence exception) archived in the same file.

## Later phase task cards

### Phase 2 — consultation workflow + Istanbul MVP features (expanded 4 October 2026 at P1-12)

**Goal:** one synthetic patient reaches a staff-confirmed consultation with an owner and a recorded outcome (C05–C07), and the Stage 2 Istanbul features (WP-M, WP-E, WP-F, WP-G, WP-H in `work-packages/STAGE-2-istanbul-mvp.md`, source `../product/MVP_GAP_ANALYSIS_2026-10-01.md`) exist behind the same safety path. Exit ≈ gate G1 (synthetic demo). **Not** permission for real patient traffic: C15/C16, Phase 3 AI quality, Phase 5 pilot evidence and F01–F04 are still required.

**Scope basis:** Stage 2 scope is referenced as "accepted D-020" in the work packages, but **D-020 is not recorded in `memory/decisions.md` and Q12 is still open** — founder must confirm (see P1-12 founder review list). Cards P2-04…P2-14 stay as written until then; P2-01…P2-03 are C05–C07 and need no new decision.

**Phase 2 operating rules (in addition to the Phase 1 rules and `work-packages/README.md`):**

| Choice | Guidance |
| --- | --- |
| Architecture | Extend existing Nest modules (D-012). New domain code goes in one `coordination` module (consultations, tasks, notes); no workflow engine, no event sourcing. |
| State machines | Small explicit transition tables in code + DB `CHECK`/enum; transitions via compare-and-set on a `version` column (same pattern as `Conversation.stateVersion`). |
| Idempotency | Every create from AI or webhook carries a stable key with a unique index (reuse the `action-claim.ts` pattern). |
| Senders | Every new outbound (staff media, alerts over WhatsApp, templates, quotes) goes through `OutboundAttempt` and the existing eligibility checks (opt-out per D-021, 24 h window, pause). Nothing calls the provider adapter directly. |
| Inbound | Every new inbound source (echoes, Instagram, lead forms) goes through signed raw-body ingress, dedupe and tenant resolution (`context/invariants.md`). |
| Contracts | Any action-contract change is done in Python and Nest together; OpenAPI → Orval regenerated; `check-cross-repo-contracts.py` passes. |
| Meta Graph version | Code uses `v25.0` in `whatsapp.service.ts`/`instagram.service.ts` but `v19.0` in `whatsapp-media.service.ts` (KI-076). Centralize the version in config in the first Meta card that touches it (P2-04), check it against Meta's current version list. |
| Status separation | Lead status, consultation status, clinical-review status and quote status are separate fields (product rule 6). |
| Tests | Unit tests for transition tables; disposable-DB e2e (`test/run-credential-upgrade.sh`) for transactions, tenant isolation and idempotency; extend the Playwright suite only where a card says so. Fake providers only — no real Meta sends. |

#### Phase 2 task status register

| ID | Task | Owner | Dependency | Status | Est. (dev-days) | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| P2-01 | Coordination domain records (C05, narrow) | Developer | P1-12 accepted; QA-1 per run order | READY | 2–3 | — |
| P2-02 | Owned handoff + persistent internal notes in the Inbox (C06) | Developer | P2-01 | QUEUED | 2–3 | — |
| P2-03 | Consultation request → confirmation → reschedule/cancel → attendance (C07) | Developer + founder review | P2-02 | QUEUED | 3–4 | — |
| P2-04 | Meta onboarding foundation: Embedded Signup v4 + coexistence (G1) | Developer + founder (Meta verification, Tech Provider review) | P2-01; founder Meta access | QUEUED | 3–5 + Meta wait | — |
| P2-05 | Phone-app message echoes → takeover + Inbox display (G2) | Developer | P2-04 | QUEUED | 1–2 | — |
| P2-06 | Click-to-WhatsApp referral capture + lead-source report (G5) | Developer | P2-03 (report counts consultations) | QUEUED | 1–2 | — |
| P2-07 | Staff file/media sending + object storage (G4, KI-026) | Developer + founder (bucket/provider choice, F03 region) | P2-02 | QUEUED | 3–4 | — |
| P2-08 | Handoff alerts to phone: PWA web push + fallback (G3) | Developer | P2-02 | QUEUED | 2–3 | — |
| P2-09 | Saved replies TR/EN (G6) + staff translation with originals (PM08) | Developer + founder (translation provider, F03) | P2-02 | QUEUED | 2–3 | — |
| P2-10 | Doctor-review task → approved quote PDF/link (minimal) | Developer + founder (quote template) | P2-01, P2-07 | QUEUED | 3–4 | — |
| P2-11 | Instagram DM channel | Developer + founder (Meta app permissions) | P2-04 | QUEUED | 2–3 + Meta wait | — |
| P2-12 | Lead import CSV/Excel + export (G7); cross-channel contact linking (G10) | Developer | P2-01; P2-11 for IG linking | QUEUED | 3–4 | — |
| P2-13 | Meta lead-form intake + approved first-contact template (G8; minimal C16 registry) | Developer + founder (approved template) | P2-04 | QUEUED | 2–3 + template approval | — |
| P2-14 | "Try the assistant" sandbox (G9) | Developer | P2-01 | QUEUED | 1–2 | — |
| P2-15 | Phase 2 acceptance + Phase 3 expansion | Developer + founder | P2-01…P2-14 | QUEUED | 1 | — |

Order rationale: P2-01…P2-03 are the G1 product loop and give every later card its records (tasks, notes, consultations). P2-04 is placed fourth but its **founder prerequisite (Meta Business verification + Tech Provider review) must start now**; if that is still pending when P2-04 is reached, run P2-07/P2-08/P2-09/P2-10/P2-14 first (they do not depend on Meta onboarding) and return to P2-04/05/06/11/13 when access exists. Embedded Signup v2/v3 are deprecated 15 October 2026 — build only on v4.

#### P2-01 — Coordination domain records (narrow C05)

**Goal:** tenant-scoped records for consultations, coordinator tasks, internal notes, patient facts and outcome events exist with enforced transitions, idempotency and concurrency — no UI yet. **Maps to:** C05 (narrowed), C02 remaining action-identity/receipt record. **New dependencies:** none.

**Primary files:** `apps/backend-v2/prisma/schema.prisma` + new migration; new `src/coordination/` module (service, transition tables, mappers); `docs/AUTHORIZATION_MATRIX.md`; `test/coordination.e2e-spec.ts`; `context/data-model.md`.

**Do, in order:**

1. Read `context/data-model.md`, `context/invariants.md`, `src/webhooks/action-claim.ts`, `src/leads/lead-response.mapper.ts`. Confirm no existing model covers these records (verified at P1-12: none of Consultation/CoordinatorTask/InternalNote/PatientFact/OutcomeEvent exist).
2. Add models: `Consultation` (type, status, requested windows JSON, confirmed start/end UTC, patient + clinic IANA timezone, ownerId, external calendar reference, cancellation reason, version, timestamps); `CoordinatorTask` (type/reason, priority, status, ownerId, dueAt, waitingParty, acknowledgedAt, completedAt, leadId/conversationId/consultationId, version); `InternalNote` (author, body, leadId/conversationId, createdAt, `InternalNoteRevision` for edit audit); `PatientFact` (key, value, state `KNOWN|UNKNOWN|DECLINED`, evidence messageId, version); `OutcomeEvent` (append-only: type, actor, subject ids, occurredAt); `ActionRecord` (stable action id unique per tenant, source AI/staff, outcome `committed|rejected|retryable_failure`, reason). Minimal `ClinicalReview` and `Quote` records only if P2-10 cannot add them later without migration churn — default: defer to P2-10.
3. Every model has `organizationId`; relations are checked tenant-consistent in the service (and with composite FKs where Prisma allows). Add retention class comment per model (C15 placeholder).
4. Transition tables (pure functions + unit tests) for consultation and task status; updates use `updateMany where {id, organizationId, version}` compare-and-set → conflict 409.
5. Seed fixture (synthetic) expressing "waiting for clinical review while a consultation is already confirmed".
6. Permissions: add `consultations:read|manage`, `tasks:read|manage`, `notes:read|write` to the permission seed; default roles get them; update the matrix doc.

**Verify:** unit tests for transitions; disposable-DB e2e: migration on empty DB and on an upgraded DB with existing leads/messages (they survive); cross-tenant linking fails; duplicate action id creates one record; two concurrent updates → one success + one conflict. Full backend unit suite + `test_e2e_pilot.sh` once at the end.

**Done when:** migration + module + tests are committed on `p2-01/coordination-records`, pushed, evidence entry written.

**Stop:** no UI, no AI action changes, no handoff API (P2-02), no consultation flow (P2-03).

**Official references (check at start):** Prisma 7 migrate/relations docs for installed `prisma@^7.8.0`; PostgreSQL 16 constraint docs (match the Railway/Docker image version).

#### P2-02 — Owned handoff + persistent internal notes in the Inbox (C06)

**Goal:** a handoff becomes an owned `CoordinatorTask` that staff claim, acknowledge, reassign, complete; notes are persistent and never sent to patients. **Maps to:** C06; first C14 additions to the WP-D Inbox.

**Primary files:** backend `src/coordination/`, `src/webhooks/action-executor.service.ts` (handoff path), `src/notifications/conversation-staff-alert.ts`, events/socket contract; frontend `src/features/inbox/{PatientPanel,ConversationHeader,hooks,i18n}.tsx`, generated API client.

**Do, in order:**

1. Make the existing handoff (AI action + UNKNOWN routing + STOP alert) create one `CoordinatorTask` in the same transaction as the pause/`stateVersion` bump; keep the notification outbox behavior.
2. APIs: claim/assign, acknowledge, reassign, wait (waiting party), complete, cancel; check membership, permissions, assignment scope; audit each change; socket event to the new owner.
3. Overdue/unowned escalation: a scheduled check (existing `@nestjs/schedule`) raises a notification to the clinic's configured manager at the due time; fallback when the owner's membership is revoked → task becomes unowned + escalates.
4. Notes: persistent `InternalNote` CRUD (author-only edit with revision), shown in `PatientPanel`; remove the sample/disabled notes UI (KI-020 frontend part). A test proves note content never enters an `OutboundAttempt`.
5. Inbox: owner + task state in the header, claim/acknowledge/complete buttons, TR/EN strings in `i18n.tsx`. AI stays paused while a human owns the task; resume stays the explicit WP-D action.

**Verify:** e2e: two coordinators claiming at once → one owner, one 409; unauthorized claim/read 403; reassignment survives reload and notifies the right user over socket; overdue task escalates at a controlled clock; note body absent from all outbound rows. Frontend vitest for the new panel; Playwright: extend the restricted-Inbox scenario only if assignment-scope UI changed.

**Done when:** C06 acceptance passes with evidence on `p2-02/handoff-notes` in backend + frontend.

**Stop:** no consultation booking UI (P2-03), no push alerts (P2-08).

**Official references:** `@nestjs/schedule` docs for installed `^12`; Next.js 16 docs for any new route.

#### P2-03 — Consultation request → staff confirmation → reschedule/cancel → attendance (C07)

**Goal:** the first end-to-end product slice: a photo-free patient's request becomes a persistent consultation with an owned task; staff confirm a slot; changes and attendance are recorded. **Maps to:** C07; C02/C12 action receipts for this action only.

**Primary files:** backend `src/coordination/`, action contract (Python `app/grpc_services/` action models + Nest `src/webhooks/contracts/`), proto if needed, `ai-reply.processor.ts`; frontend Inbox consultation panel; Python tests for the narrowed action.

**Do, in order:**

1. Add a versioned AI action `request_consultation` (type, time preference, timezone; no name/media prerequisite) on both sides of the contract; Nest validates tenant, conversation version and current state, creates one record per action id and returns a receipt (`committed|rejected|retryable_failure`). The patient reply may only say "request recorded" when the receipt is `committed` (C12 rule, this action only).
2. Staff APIs: confirm (slot, duration, reference, staff attestation that the external calendar is free), reschedule (original slot kept until the new one is confirmed), cancel (reason), mark attended/no-show. Prevent duplicate confirmation and overlapping slots known to OmniX.
3. Confirmation + outbound notification intent commit atomically (outbox); confirmed state stays visible even if the patient message fails (UNKNOWN/failed shown).
4. Patient-facing time strings use the patient's IANA timezone; tests across a DST change (e.g. Europe/London ↔ Europe/Istanbul in late October).
5. Inbox: consultation card (requested / confirmed / changed / cancelled / attended), TR/EN.

**Verify:** replayed action → one record; unauthorized confirm 403; conflicting confirm → 409; ambiguous time rejected with a visible task; failed confirmation delivery visible and recoverable; DST tests; contract check script exit 0. Founder demo: one synthetic patient from inquiry to attended outcome.

**Done when:** C07 acceptance passes with evidence; founder has seen the demo.

**Stop:** no calendar integration (D-014), no automated reminders (C17), no templates outside P2-13.

**Official references:** IANA tz handling in Node 22 `Intl`; existing `libphonenumber-js` not needed here.

#### P2-04 — Meta onboarding foundation: Tech Provider + Embedded Signup v4 + coexistence (G1)

**Goal:** a clinic connects its existing WhatsApp Business number through Embedded Signup v4 in coexistence mode; the channel and encrypted credential are created automatically (no pasted tokens); history sync is imported read-only. **Maps to:** G1, C19 "verify coexistence", KI-008 cleanup of legacy token fields.

**Founder prerequisite:** Meta Business verification + app review as Tech Provider; a test WhatsApp Business app number. Without it, build against Meta test assets and stop at the review step.

**Primary files:** backend `src/channels/`, `src/credentials/`, `src/webhooks/{webhooks.controller,webhooks.service,whatsapp.service,whatsapp-media.service}.ts`, config schema (Graph version, app id, configuration id); frontend `src/app/dashboard/settings/channels/page.tsx`.

**Do, in order:**

1. Re-read Meta's current Embedded Signup and coexistence docs (links below) and record the exact version/fields used in the evidence. Centralize the Graph API version in config (fixes KI-076: `whatsapp-media.service.ts` still uses `v19.0`).
2. Frontend: launch Embedded Signup v4 (Facebook Login for Business configuration, `featureType: "whatsapp_business_app_onboarding"` for coexistence); capture the session-info message; send only the auth code to the backend.
3. Backend: exchange the code server-side, store the business token encrypted (existing `Credential` + `INTEGRATION_CREDENTIAL_KEY`), create the `Channel`, subscribe the app to the WABA webhooks incl. `history`, `smb_app_state_sync`, `smb_message_echoes`. Idempotent on repeat.
4. History sync: import messages within the provided window (Meta: up to 180 days; media IDs only for the last 14 days) as read-only history, deduped by message id, no AI run, no outbound. Sync must be triggered within 24 h of onboarding — show that in the UI.
5. Remove the pasted-token path from the UI once the new path works (keep the backend path until migration of existing channels is decided).

**Verify:** signed-webhook tests with synthetic `history` payloads (dedupe, tenant resolution, no AI job created); credential never logged; repeat onboarding → one channel. Live check against Meta test assets only with founder present.

**Done when:** a test number is connected via v4 coexistence on staging (or the exact Meta-review blocker is recorded).

**Stop:** echoes → takeover is P2-05; referral is P2-06; Instagram is P2-11.

**Official references (checked 4 Oct 2026 at P1-12):** [Embedded Signup overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/), [Onboard WhatsApp Business app users (coexistence)](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/) — requires Tech Provider/Solution Partner, WA Business app ≥ 2.24.17, webhook fields `history`/`smb_app_state_sync`/`smb_message_echoes`, 20 mps fixed throughput, groups/broadcast/view-once unsupported; [WhatsApp changelog](https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog) (v2/v3 deprecated 15 Oct 2026). Re-check before coding.

#### P2-05 — Phone-app message echoes → takeover + Inbox display (G2)

**Goal:** a message the clinic sends from the WhatsApp Business app is stored as a staff message, pauses the AI and bumps `stateVersion` (takeover), and appears in the Inbox. **Maps to:** G2, product rule 5.

**Primary files:** `src/webhooks/{webhooks.service,webhooks.processor,inbound-claim.service}.ts`, `src/conversations/conversation-response.mapper.ts`, frontend `src/features/inbox/Thread.tsx`.

**Do, in order:**

1. Parse `smb_message_echoes` through the existing signed ingress + dedupe (by Meta message id) + tenant resolution.
2. Store as `HUMAN` message with "sent from phone" metadata; in the same transaction pause the AI and bump `stateVersion` so any in-flight AI generation is discarded (existing lease/version check).
3. An echo to an opted-out lead is stored and audited normally; the Inbox shows the D-021 STOP notice; nothing is blocked.
4. Inbox shows the bubble with a "phone" marker.

**Verify:** e2e: echo during an active AI generation → no AI send; duplicate echo → one message; echo for unknown number → no lead created silently (decide: create conversation as staff-initiated; record decision).

**Done when:** tests pass; a synthetic echo flows to the Inbox on the local stack.

**Stop:** no outbound changes.

**Official references:** coexistence page above (echo payload shape) — re-check.

#### P2-06 — Click-to-WhatsApp referral capture + lead-source report (G5)

**Goal:** the `referral` object on a first inbound message (source type/id/url, headline, ctwa click id) is stored on the lead, and Results shows consultations per source/campaign. **Maps to:** G5, C18 slice.

**Primary files:** `src/webhooks/webhooks.service.ts`, `prisma/schema.prisma` (lead attribution fields or `LeadAttribution` model), `src/lead-sources/`, `src/analytics/analytics.service.ts`, frontend dashboard/Results.

**Do, in order:** (1) parse and store referral on the first inbound only (never overwrite); (2) map to a `LeadSource` automatically ("Meta ad") with campaign/ad id; (3) report: leads, consultations requested, confirmed, attended per source (uses P2-03 records; label numbers as counts, no ROI claims).

**Verify:** fixtures with and without referral; second message's referral ignored; report e2e with two clinics (isolation).

**Done when:** report renders with synthetic data. **Stop:** no ad-platform API calls (Conversions API is later).

**Official references:** WhatsApp Cloud API webhook `messages[].referral` reference — check current fields.

#### P2-07 — Staff file/media sending + object storage (G4; finishes KI-026)

**Goal:** staff upload a file/image from the Inbox → private object storage → WhatsApp media send through `OutboundAttempt`; inbound patient media moves out of `messages.mediaUrl` base64 into the same storage with expiry. **Maps to:** G4, KI-026, IMP-011, C15 media slice.

**Founder input:** storage provider + region (F03/KVKK hosting decision). Default if none given: S3-compatible API behind an interface, region TBD — build against a local MinIO container in tests.

**Primary files:** new `src/storage/` (interface + S3-compatible adapter), `src/webhooks/whatsapp-media.service.ts`, `outbound-attempt.service.ts`, conversations controller (upload endpoint), frontend `Composer.tsx`.

**Do, in order:** (1) storage interface, private bucket, signed short-lived URLs, size/type allowlist, tenant-prefixed keys; (2) staff upload → media send via `OutboundAttempt` with all eligibility checks; (3) inbound media written to storage with `mediaExpiresAt`; expiry job deletes objects; (4) one-off migration path for existing base64 rows (synthetic only; production plan recorded, not run); (5) composer attach button with progress/error states.

**Verify:** e2e with MinIO: upload → attempt → fake provider; disallowed type/size rejected; signed URL expires; cross-tenant key access denied; expired media gone. **Stop:** no AI image analysis (D-014, KI-058).

**Official references:** WhatsApp Cloud API media upload/send docs; AWS SDK v3 S3 docs for the version you pin (no SDK is installed today).

#### P2-08 — Handoff alerts to phone: PWA web push + fallback (G3)

**Goal:** the task owner gets one phone alert per handoff with a link to the conversation. **Maps to:** G3.

**Primary files:** frontend manifest + service worker (Next 16), notification settings; backend `src/notifications/` push subscription model + sender, config (VAPID keys from env, validated at startup).

**Do, in order:** (1) installable PWA manifest + service worker; (2) push subscription per user/device, staff opt-in, revoke on logout/membership revocation; (3) send on task creation/assignment/escalation via a queue job (one alert per handoff, no PII in the push payload — title "New handoff", link only); (4) fallback email or WhatsApp to the assignee only if founder approves a provider (default: push only; record as open).

**Verify:** unit tests for payload content (no patient data); revoked user gets no push; duplicate events → one alert. Manual check on one phone (founder).

**Stop:** no native app. **Official references:** Next.js 16 PWA guide, MDN Push API, `web-push` library docs for the pinned version.

#### P2-09 — Saved replies TR/EN (G6) + staff translation with originals (PM08)

**Goal:** coordinators insert shared saved replies; foreign-language patient messages show a Turkish translation next to the original, and staff can send a reviewed translation. **Maps to:** G6, PM08.

**Founder input:** translation provider + whether patient text may leave for it (F03). Default: feature flag off per clinic until approved; build with a fake translator.

**Do, in order:** (1) `SavedReply` CRUD (per clinic, language, variables `{firstName}`, `{clinicName}`, permission to manage); (2) composer picker; (3) translation service interface, cache by message id, cost/provider logged, original always visible; (4) "write TR → review translation → send" goes through the normal staff send path.

**Verify:** variable substitution tests; translation off → no provider call; translated send uses `OutboundAttempt`. **Stop:** no AI writer changes.

**Official references:** chosen translation provider API (check at card start).

#### P2-10 — Doctor-review task → approved quote PDF/link (minimal)

**Goal:** consented photos/X-rays create a "doctor review" task for the clinician role; the clinician records the outcome; the coordinator builds a quote from approved price facts and sends a branded PDF/link through the media pipeline. **Maps to:** WP-F, C05 ClinicalReview/ApprovedQuote, P01 minimal.

**Rules:** no AI interpretation of images (D-014); quote status separate from lead and consultation status; quote only from approved price facts (rule 2) — until C08 exists, prices are entered by an authorized staff member and the approver is recorded.

**Do, in order:** (1) `ClinicalReview` + `Quote` (amount, currency, inclusions/exclusions, validity, status, approver) records; (2) review task assignment to clinician role; (3) PDF generation (TR/EN + patient language) — pick a library at card start and pin it; (4) send via P2-07; optional acknowledgement link (signed, expiring).

**Verify:** media without consent cannot be attached to a review; unapproved quote cannot be sent; status fields independent. **Stop:** no payments/deposits.

#### P2-11 — Instagram DM channel

**Goal:** Instagram DMs arrive in the same Inbox with the same safety path (inbound, staff reply, AI reply, IG 24 h window). **Maps to:** gap-analysis §3 (reverses the Instagram deferral in D-011 — needs D-020 confirmed).

**Primary files:** `src/webhooks/instagram.service.ts` (today verify/disconnect only), webhooks controller/service, channel abstraction, Inbox channel marker.

**Do, in order:** connect via the same Meta app (P2-04); signed ingress + dedupe; channel-aware eligibility (IG window rules); AI reply through the same pipeline; Inbox marker.

**Verify:** isolation and dedupe e2e; outside-window staff send rejected with a visible reason. **Official references:** Instagram Messaging API (Graph) docs — check version and window/tag rules.

#### P2-12 — Lead import CSV/Excel + export (G7); cross-channel contact linking (G10)

**Goal:** clinics bring their pipeline in and can take it out; the same person on two channels can be linked by staff. **Maps to:** G7, G10.

**Do, in order:** (1) import with column mapping, E.164 normalization (installed `libphonenumber-js`), dedupe preview, dry run, audit; (2) CSV export endpoint behind `leads:export` with PII rules (permission exists, endpoint does not — KI-031 note); (3) suggested matches (phone/email exact, never name-only), staff confirms link; no auto-merge.

**Verify:** dry run writes nothing; malformed rows reported; export without permission 403 and PII masked per grants; link requires explicit confirm. **Official references:** parser library chosen at card start (none installed for CSV/Excel today).

#### P2-13 — Meta lead-form intake + approved first-contact template (G8; minimal C16 registry)

**Goal:** a Lead Ads form submission creates a lead; the only automated first contact is an approved WhatsApp template. **Maps to:** G8, C16 (template registry, minimal).

**Do, in order:** (1) `leadgen` webhook via signed ingress, fetch lead fields server-side, create lead with source; (2) template registry (name, language, category, status synced from Meta); (3) first-contact send only with an `APPROVED` template through `OutboundAttempt` + opt-out check; missing/rejected template → task for staff, never free-text fallback.

**Verify:** rejected template → no send + task; duplicate leadgen → one lead. **Official references:** Meta Lead Ads webhooks + WhatsApp message templates docs (check at card start).

#### P2-14 — "Try the assistant" sandbox (G9)

**Goal:** founder/clinic approver chats with the clinic's AI on its knowledge in the dashboard, clearly marked test mode, with sources shown; no leads/messages in the real Inbox. **Maps to:** G9, supports C08/F02.

**Do, in order:** (1) sandbox endpoint calling the Python agent with a synthetic, non-persisted conversation context (or a flagged sandbox conversation excluded from all lists/reports/follow-ups — decide and record); (2) no `OutboundAttempt`, no actions executed (receipts show "sandbox, not executed"); (3) UI marked TEST, permission-gated; (4) show retrieved source ids.

**Verify:** no rows in leads/messages/outbound after a sandbox session; permission required. Paid model calls only with founder approval; tests use fake models.

#### P2-15 — Phase 2 acceptance + Phase 3 expansion
- **Also review `docs/product/IDEAS_FROM_CRM_RELEASE_2026-10-05.md`** (checklist at its end) and turn accepted ideas into Phase 3 cards. Its ⚑ items are decided earlier: P2-04 (#14 liveness), P2-09 (#6 egress), P2-10 (#17 money), every card (#15 capabilities), Phase 2 start (#26 untranslated-text check).

**Goal:** accept Phase 2 like P1-12 and expand Phase 3 (C08–C13: approved knowledge, retrieval, memory, new graph, evaluations; patient languages = English + the design partner's top 1–2). Run the cumulative gate + pilot + Playwright on final heads, record three revisions, list open high KIs, re-estimate. **Stop:** do not implement Phase 3.

### Phase 3 — patient AI journey

QUEUED. Expand against C08–C13 and the AI specification once the real domain/action contracts exist. Start the evaluation examples before changing prompts. Model/library choices must be rechecked at implementation time.

### Phase 4 — daily clinic operation

QUEUED. Expand against C14–C18 after the patient/coordinator loop is demonstrated. Preserve approved channel-window restrictions while adding richer follow-up.

### Phase 5 — supervised pilot

QUEUED. Expand against C19/C20 and unresolved S17/F01–F04 conditions. A successful development demo or one WhatsApp round trip cannot close this phase.

### Phase 6 — paid, repeatable service

QUEUED. Expand against P01–P03/F05 using actual pilot observations, signed scope and costs. Do not automate billing or build broad integrations before those needs are established.

## Evidence log — append after each task

Keep task status here, not in a collection of conflicting new plan files. Larger sanitized logs may live in the established evidence directory and be linked from this section. Do not append credentials, patient messages, provider identifiers, auth-state files or invitation/reset tokens.

```text
Task ID and title:
Date / developer / reviewer:
Status: VERIFIED | DONE | BLOCKED
Repositories and revisions (or clearly identified uncommitted changes):
Goal achieved / behavior before and after:
Files changed:
Commands, working directories, exit codes and scenario/test counts:
Evidence links:
Acceptance checklist: passed items and unrun/failed items:
Limitations / dependencies / founder input needed:
Rollback or disable procedure, if applicable:
Next task: [ID] — queued until this task is accepted
```


Phase 1 evidence entries (18, planning entry → P1-12) are archived: `docs/archive/2026-10-phase1-task-log.md` § "Phase 1 evidence log entries". Evidence files: `docs/evidence/`.

### Task QA-1: Runtime QA of the Stage 1 system — 4 October 2026
Date / developer / reviewer: 4 October 2026 / Developer (Claude session) / Founder (pending)
Status: EXECUTED — P0 complete, P1 partial; 3 high + 3 medium + 4 low new findings (no code changed, per package)
Repositories and revisions: backend `357f849`, frontend `75dccbd`, Python `81ac3de` (= origin/main)
Goal achieved: running local stack (disposable Postgres/Redis, real Python with fake model, fake Meta Graph, built frontend in Chromium) tested against the P0 list and part of the reviews' QA lists.
Files changed: `docs/evidence/QA-1_2026-10-04.md` (+ `_harness/`), `memory/{known-issues,current-state,session-log}.md`, this file. No application code.
Results: PASS — STOP/iptal/START, manual send (normal/422/opted-out warning), takeover during generation, UNKNOWN routing (no resend, one alert per staff), EN/TR deterministic handoff, media consent (once, 30 d, withdrawal), invitations + role/tenant matrix, startup refusal, /ready, gRPC TLS combinations, crash recovery (SIGKILL, 160 s, no duplicates). FAIL — KI-078 disclosure order (16/23 reply-first), KI-079 Inbox socket not restored after token expiry, KI-080 revoked credential loses inbound, KI-081 multi-clinic login, KI-082 model escalation wording, KI-083 /ready ignores RPC secret, CSP not enforceable (KI-044), KI-070 reproduced.
Not tested: AI wording (no model budget), prompt-injection actions, voice/image/PDF runtime, two instances, hosted build, keyboard/mobile.
Next task: QA-1 fixes package (fix list groups 1–4 + decisions in group 5), then P2-01.

## AI-3c — coordinator model comparison

**Prepared:** 2026-10-10. **Status:** ready for offline implementation; paid results and founder selection pending. **Branch:** `ai-3c/model-comparison`. This card is the current AI-3c scope and takes precedence over older broad AI/rebuild cards in this reference file. Read only this section for AI-3c.

**Goal:** let the founder compare the current AI-3b coordinator with `gpt-6-luna` versus `gpt-6-sol` on the same 55 synthetic EN/TR/AR scenarios, understand quality/cost/latency tradeoffs, and apply an explicit model configuration with a rollback path. Do not substitute `gpt-6.1-sol` merely because it is newer. The first complete Luna run also supplies the pending post-AI-3b baseline.

**Two completion states:** (A) builder delivers tested offline tooling, exact founder commands and a PR; (B) founder runs paid comparison, reviews failures, chooses the model and later applies settings. Completing A does not complete B, resolve KI-097 or approve a pilot. D-031 reserves paid calls for the founder; the builder must not call a real model, inspect secrets, deploy, access Railway or enable a clinic.

### Read and scope

Read `AGENTS.md`, `docs/README.md`, `docs/PLAN.md` Now, `docs/ARCHITECTURE.md` sections 5 and 8, decisions D-013/D-031/D-033/D-034, issues KI-006/KI-097 and Q3, and the last three LOG entries. Inspect `evals/run.py`, `runner.py`, `checks.py`, `test_evals.py`, `scenarios.json`, `demo_clinic.json`, `app/infrastructure/model_options.py`, `llm_factory.py`, `app/core/config.py` and the servicer's turn-deadline path. Read `docs/reference/ops/PYTHON_DEPLOYMENT.md` only to append the founder handoff.

Allowed implementation: existing `evals/run.py`, `runner.py`, `test_evals.py`; new `evals/compare.py` and, if needed for readability, one small reporting helper within `evals/`; existing architecture/deployment/ISSUES/LOG documents. Do not edit PLAN as builder. No production Python behavior changes, dependency upgrades, API migration, prompt/rubric/hard-check/scenario changes, backend/frontend changes, database work, CI or unrelated fixes. Runtime JSON/Markdown reports may be generated only under the already ignored `evals/reports/` or test temporary directories; do not commit them or create separate evidence documents.

### Comparison protocol and compatibility

1. Use agent **v2 only**, all current 55 scenarios, unchanged ordering, facts, playbook, rubric, safety checks and source revision. Abort preflight if the fixture count has changed; report the discrepancy instead of silently testing a subset. Existing single-run v1 support must remain working.
2. Baseline writer: `gpt-6-luna`, reasoning `none`, temperature `0.3`. Candidate writer: `gpt-6-sol`, reasoning `none`, temperature omitted (empty shell value); validate this exact configuration during the founder smoke run. The different temperature is recorded as a configuration difference; do not describe this as an isolated model-weights experiment.
3. Fixed roles in both runs: patient `gpt-6-luna` / `none` / `0.3`; judge `gpt-6-luna` / `none` / `0`; extractor `gpt-6-luna` / `none` / `0.1`; checker `gpt-6-luna` / `none` / `0`. Extractor/checker remain configured for compatibility but should show zero calls on the v2 path. Unexpected calls are visible and investigated, not silently ignored.
4. Preserve the current eval timeout (20 s), retries (0) and output cap (1024). Record effective limits and servicer deadline. Measure the full `agent.reply` turn separately from patient/judge time. This is synthetic in-process latency, not WhatsApp response speed. If output truncation or unsupported parameters prevent a valid comparison, mark it inconclusive; no automatic parameter search, retries, fallback model or production changes.
5. Current official model pages checked 2026-10-10 specify `reasoning_effort=none` for function calling through Chat Completions for both candidates. This conflicts with the older generic Sol omission advice in KI-097; do not copy that advice without checking the exact model/API. Sources: [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [Sol](https://developers.openai.com/api/docs/models/gpt-6-sol). Recheck those pages before supplying the final commands. Published capability is not proof of this account's access or installed SDK compatibility.
6. The patient and judge use the same configuration, but generated continuations may differ. Treat results as one exploratory run per configuration. Review failed and changed scenarios manually; do not claim statistical significance or multilingual human validation. No reruns to cherry-pick a winner.

### Item 1 — reproducible runs and offline preflight

Extend `python -m evals.run` with `--label` and `--preflight` (existing arguments keep their behavior). Preflight prints an allowlisted resolved configuration and validates scenario selection, model/options and rate configuration without requiring a key, constructing a client, reading dotenv or touching a DB/network. It must explain that account/API compatibility is untested.

Create a versioned, explicit run manifest, captured once before execution: run ID/time, label, agent, Git revision and tracked-worktree-dirty flag, selected scenario IDs/languages, SHA-256 of scenarios/facts and the relevant eval/prompt/policy source files, all five model IDs and resolved options (omitted is JSON null), timeout/retry/output/turn limits and rate assumptions. Never dump the environment, Settings object, filesystem paths containing credentials or SDK objects. Hash only explicitly named source/fixture files; never `.env`, outputs or arbitrary repository contents. Mark a run ineligible for model selection when source identity cannot be established or tracked work is dirty.

Write a JSON sidecar with schema version, manifest, scenario results, aggregate counts and accounting alongside each existing Markdown report using a shared unique basename. Keep the existing ten worst transcripts. Partial/error/budget-stopped runs still produce readable reports. Preserve current CLI exit behavior: zero only when every selected scenario passed; ordinary eval failures return nonzero but the founder can still compare the saved reports. Preflight success returns zero; bad CLI/configuration returns a distinct usage failure.

### Item 2 — role accounting and latency

Extend the existing Ledger/MeteredModel path, preserving its public defaults for existing callers/tests. Attach role and model identity to wrappers and preserve them through `bind_tools`/`with_structured_output`. A shared ledger owns the single run budget; per-role totals must sum to the run total, never five independent budgets.

Add optional `EVAL_<ROLE>_INPUT_USD_PER_MILLION` and `EVAL_<ROLE>_OUTPUT_USD_PER_MILLION`, where ROLE is WRITER, EXTRACTOR, CHECKER, PATIENT or JUDGE. A role with neither override retains existing global `EVAL_INPUT_USD_PER_MILLION` / `EVAL_OUTPUT_USD_PER_MILLION` behavior; reject half-pairs, non-finite or nonpositive rates before any calls. Record whether rates are explicit, global or illustrative. Founder comparison commands set explicit rates for every role. Do not use an illustrative-rate run to recommend a model on price.

Maintain pre-call reservations using the relevant role's rates, and charge failed calls/missing usage conservatively as today. Use provider usage when available; do not count reasoning tokens twice if already included in output. Report measured token usage versus reservation estimates separately, along with call/error counts. Estimate cached input at the ordinary input rate for this small card and explicitly disclose that no cache discount, regional premium or billing reconciliation is modeled. This is an estimated spending guard, not an exact provider billing cap.

Measure elapsed time with a monotonic clock around `agent.reply`, including deterministic paths and failed turns; exclude simulated-patient and judge calls. Report sample count, median and nearest-rank p95, timeout/error counts, plus writer-call count so zero-call policy replies are visible. Never drop slow/error turns silently or use missing samples as zero. Report writer cost per attempted scenario and per attempted agent turn separately from total eval cost (patient + judge included).

### Item 3 — offline comparison

Implement `python -m evals.compare --left <run.json> --right <run.json>`, using the standard library and no application-settings/API-client imports. It writes a comparison Markdown report into ignored `evals/reports/` and prints the path. Reject malformed/unknown-schema/duplicate-ID inputs with a useful error.

Compatibility checks require equal source revision/source hashes, clean recorded trees, agent v2, selected IDs/order/languages, fixed-role models/options and execution limits. Only writer model/options, label/time/run ID and writer rates may differ; other rate changes must be disclosed and invalidate cost comparison. The left/right pair must be the intended Luna/Sol candidates to apply this card's selection guidance. Incompatible or incomplete pairs produce diagnostic output marked **INCONCLUSIVE**, never an eligible winner; no hidden intersection/subset comparison.

Report selected/attempted/completed/unrun separately. Primary pass rate uses all selected scenarios as denominator; errors/unrun are not passes. Also show the legacy finished-attempt rate with its denominator so old reports remain understandable. Include EN/TR/AR counts/rates, average judge score and its reply count, failure counts by hard-check name, expected versus actual handoff, unnecessary/missed handoffs, provider errors, timeouts, agent-turn latency and role cost/token tables. Use actual HANDOFF_TO_HUMAN actions rather than treating the existing `handoff` boolean (expectation matched) as an action count. Show scenario IDs for Luna-only passes, Sol-only passes, both-fail and both-pass, with failed-check/judge reasons and links to their source reports. Preserve the existing safe error redaction.

Selection guidance is a **review aid, not automatic activation**:
- A complete comparable pair and manual review of all safety-related failures are required. Any confirmed invented clinic fact/price, diagnosis/personal medical advice, confirmed booking, missed required handoff or consent violation blocks recommending that configuration for patient use. Regex flags alone are not a clinical assessment; retain flags and annotate manual review separately.
- Prefer retaining Luna unless Sol gives at least 3 additional passing scenarios out of 55, has no lower pass count in any language, and introduces no confirmed safety regression. This is a planning heuristic, not statistical significance or a pilot acceptance threshold.
- Show latency and writer-cost increases alongside that result; founder decides whether the improvement is worth them. Deadline/provider failures prevent a deployment recommendation until understood. If neither configuration qualifies, report **no selection**; record issues for another card rather than tuning prompts here.
- A favorable synthetic result does not open the pilot gate. Final choice remains with the founder after transcript review.

### Item 4 — founder commands and Railway handoff

Append one AI-3c section to the existing `docs/reference/ops/PYTHON_DEPLOYMENT.md`, containing exact copy/paste commands for offline preflight, paid smoke, full Luna run, full Sol run and offline comparison. Use existing env names and the new per-role rate overrides. Run with shell-provided `OPENAI_API_KEY`; never source or inspect dotenv. Explicitly set/clear every model option so a prior shell setting cannot contaminate a run. Use the app's absolute `.venv/bin/python` and `PYTHONPATH` from a clean temporary cwd as in verification below. Commands must not dump the environment or echo credentials.

Use current official standard text rates, recording source/date and assumptions beside the commands. At planning time the model pages list Luna input/output $0.10/$0.50 and Sol $2/$10 per million tokens; verify again before the founder runs. Do not infer rates from the historical ~$0.03 summaries.

Proposed initial total estimated budget is **$5** across four founder-invoked runs: two $0.25 smoke runs (one per candidate), then $2.25 per full run. Each smoke selects the same three existing scenario IDs covering a normal reply, a real tool invocation and a multilingual case; inspect fixtures and name exact IDs in the delivered commands. Verify the tool scenario actually calls the writer/tool, not only a deterministic policy branch. Stop on API/model/parameter errors or a budget stop; do not silently rerun or increase the budget. Smoke results are not mixed into the 55-scenario scores. Additional repeats require a founder-chosen budget; none run automatically. The budget is a proposed founder command limit, not permission for builder-paid calls.

Railway handoff must list the exact tested winner's FLAGSHIP model/reasoning/temperature and the explicit extractor/checker fallback configuration. Explain clearing an option versus setting literal `none`; keep v2's existing per-clinic allowlist and approved-knowledge requirements. Record the current configuration privately in the founder's deployment workflow before changing it; do not ask the agent to read secrets. Founder first applies settings on staging and runs synthetic price, identity, handoff, consent and takeover checks. Production promotion is founder-owned. On model regression restore the previous tested model/options; on unsafe replies pause AI for affected conversations. Removing a v2 allowlist entry falls back to v1 and is **not** an AI shutdown. Keep KI-097 open until founder confirms actual environment configuration; keep Q3 open until model choice. No builder Railway access.

### Required verification — only these tests

Add meaningful offline cases to existing `evals/test_evals.py` for: manifest allowlisting/no secrets and omitted options; preflight without key/network/dotenv; role rates/reservations and wrapper propagation; failed/missing-usage calls charged once; timing excludes patient/judge (fake clock, no sleeps); complete and partial JSON reports; compatible comparison and source/fixture/fixed-role mismatch; language/denominator/handoff calculations; incomplete reports cannot win. Extend the existing deny-network fixture. Preserve existing fake-model v1/v2 coverage and unchanged hard gates. No paid tests, new suite, browser/DB tests, package installation or CI.

From repository root, run targeted tests while implementing, then the Python suite once at the end. Run from a clean temporary directory so production Settings cannot discover a local dotenv file:

```bash
REPO_ROOT="$PWD"
AI3C_TEST_CWD="$(mktemp -d /tmp/omnix-ai3c-tests.XXXXXX)"
cd "$AI3C_TEST_CWD"
OPENAI_API_KEY=synthetic-test-key INTERNAL_RPC_SECRET=synthetic-rpc-secret \
DATABASE_URL=postgresql://synthetic:synthetic@127.0.0.1:1/omnix_synthetic \
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false \
PYTHONPATH="$REPO_ROOT/apps/python-ai-service-v2" \
"$REPO_ROOT/apps/python-ai-service-v2/.venv/bin/python" -m pytest -q \
"$REPO_ROOT/apps/python-ai-service-v2/evals/test_evals.py"
```

For the final suite use the same command/environment with both `"$REPO_ROOT/apps/python-ai-service-v2/tests"` and `"$REPO_ROOT/apps/python-ai-service-v2/evals/test_evals.py"` as test targets. After returning to the repo, run `git diff --check`. Report collection failures, sandbox limitations and teardown errors distinctly from assertion failures; rerun only affected blocked cases when justified. Do not repair unrelated KI-100 or broaden scope.

### Builder completion and copy/paste kickoff

Commit after each item; stage explicit files and preserve unrelated working changes (the planning session observed a pre-existing frontend `next-env.d.ts` change). Update architecture only for what was implemented, append one LOG entry ≤8 lines, and record unrelated findings in ISSUES. Push the card branch and open a PR under the normal card process. No merge. Final response: PR, item commits, tests, exact founder run sequence, remaining compatibility/selection steps. Keep all evaluation outputs ignored; summarize actual paid results later in LOG only after the founder supplies them.

**Kickoff prompt:** Implement only AI-3c in `docs/reference/plan/PRODUCT_EXECUTION_TASKS.md`, section “AI-3c — coordinator model comparison”, on `ai-3c/model-comparison`. Read the listed project memory, then complete items 1–4 and only their required offline tests. The planning commit already contains the architecture and scope. Keep production behavior and eval fixtures unchanged. Deliver a PR and founder-run commands; do not make paid calls, deploy, migrate, merge or edit PLAN. Implementation can finish while paid comparison/model selection remain pending.
