# Decisions (ADR log)

> Paths in entries before D-027 refer to the old layout (`context/`, `memory/`, `docs/plan/`, three separate repos). Today: everything lives in `docs/` (see `docs/README.md`); old plan files are in `docs/reference/plan/`; deleted files are in git history and the 2026-10-06 backup zip.


Append-only. Newest at the bottom. To reverse a decision, add a new entry that supersedes it — don't delete.

Template:
```
## D-XXX — <title>
- Date: YYYY-MM-DD
- Status: accepted | superseded by D-YYY
- Context: why this came up
- Decision: what we chose
- Consequences: what this means / what we gave up
```

---

## D-001 — Dental clinics only for the first product
- Date: before 2026-09-30 (inherited from handoff)
- Status: accepted
- Context: Long-term vision is a multi-industry AI sales employee.
- Decision: Build and validate for dental clinics (Istanbul, international patients) first.
- Consequences: No real-estate/legal/generic workflows. Keep configurability in mind but don't build for it.

## D-002 — Internal records are the source of truth
- Date: inherited
- Status: accepted
- Decision: Postgres lead/conversation records are canonical; HubSpot/Zoho are optional adapters.
- Consequences: CRM outage must never lose a lead; sync is one-directional-first and idempotent.

## D-003 — Booking request ≠ confirmed appointment
- Date: inherited
- Status: accepted
- Decision: The AI never confirms appointments; staff confirm. No external calendar booking in pilot.

## D-004 — Stack baseline
- Date: inherited
- Status: accepted
- Decision: Next.js/React/TS/Tailwind · NestJS · Postgres + Prisma + pgvector · Redis/BullMQ · Socket.IO · Python FastAPI + gRPC + LangGraph.
- Consequences: Any alternative must be proposed with concrete trade-offs before changing.

## D-005 — Invitation-only pilot
- Date: inherited
- Status: accepted
- Decision: Public signup disabled; operator invites clinics. Billing, Instagram, multi-industry out of first pilot.

## D-006 — AI proposes, backend executes
- Date: inherited
- Status: accepted
- Decision: The Python AI returns validated action proposals (contract v1); Nest authorizes and executes. Contract duplicated in Python and Nest, kept in sync.

## D-007 — File-based context system for Claude
- Date: 2026-09-30
- Status: accepted
- Context: Too much project knowledge was living only in chat.
- Decision: `CLAUDE.md` (entry + rules) → `context/` (stable facts) → `memory/` (evolving state, decisions, issues, questions, session log) → `.claude/commands/` (`/start`, `/wrap-up`, `/remember`, `/verify`). The original handoff is kept as a read-only snapshot (archived 2026-10-06: `docs/archive/2026-09-30-CLAUDE_PROJECT_HANDOFF.md`).
- Consequences: Every session must read `memory/current-state.md` on start and update memory on wrap-up.

## D-008 — Continue and improve the existing code; no fresh start
- Date: 2026-09-30
- Status: accepted (user)
- Context: Substantial working code exists across three services.
- Decision: Keep the codebase. Improve incrementally: design patterns, smarter algorithms, better ways of doing things. Resolves Q1.
- Consequences: Changes follow `context/engineering-standards.md` (characterize → refactor → change behavior, small steps, strangler for replacements).

## D-009 — Workspace layout: `omnix/` root with `apps/`, separate repos kept
- Date: 2026-09-30
- Status: accepted (user)
- Context: Apps are three separate Git repos under an `OmniDesk_ai/` parent folder; context system lives in `omnix/`.
- Decision: `omnix/` is the workspace root (its own git repo for context, memory, reviews, docs, parent scripts). The three repos move to `omnix/apps/` **with their current names** (`backend-v2`, `frontend-v2`, `python-ai-service-v2`) and stay separate repos (ignored by the workspace repo). Parent-level `docs/`, `contracts/`, `scripts/`, `docker-compose.yml`, `test_e2e_pilot.sh` move to the `omnix/` root. Resolves Q2.
- Note 2026-10-04: the workspace root was never made a git repo — it is unversioned (founder zip backups); only the three apps are repos.
- Consequences: Parent scripts/compose need `./apps/...` paths (IMP-001). Renaming apps (dropping `-v2`) and a monorepo are deferred (Q7).

## D-010 — Evidence-based rewrite gate
- Date: 2026-09-30
- Status: accepted (user)
- Decision: Rate each service with the rubric in `reviews/README.md` before big changes. Rewrite only modules that score poorly, behind the same contract; a whole-service rewrite needs a failing score **and** the user's agreement.

---
_D-011…D-016: decisions already made in the project's plan documents (CTO plan 09-27, execution plan 09-29, pilot activation 09-26), recorded here so they aren't re-litigated._

## D-011 — First release scope (from CTO plan)
- Date: 2026-09-27 (inherited) · Status: accepted
- Decision: One location, one WhatsApp number, three staff accounts, **English + Turkish**, text-first intake, manually confirmed consultations, owned staff tasks, weekly report. Sell "AI International Patient Coordinator". One design-partner clinic before three.
- Consequences: Arabic (older OMNA-4/OMNA-5 docs) is not in the first release. No hair-transplant/voice/travel/CRM replacement before dental renewal is repeatable.

## D-012 — Keep the stack and LangGraph; shrink the graph (from CTO plan)
- Date: 2026-09-27 (inherited) · Status: accepted
- Decision: Keep NestJS/Next.js/Python-LangGraph/Postgres/BullMQ; no framework replacement, workflow engine, service mesh or event sourcing. Replace the rigid sales sequence with a small intent-and-policy graph (AI spec §6). Nest stays the authority for CRM writes and outbound delivery.

## D-013 — Model changes only through evaluation (from CTO plan)
- Date: 2026-09-27 (inherited) · Status: accepted
- Decision: No blind model upgrade. Compare current config vs cheaper classifier / stronger writer on the EN/TR evaluation set (C13); keep rollback switch.

## D-014 — Media and scheduling boundaries for launch (from CTO plan)
- Date: 2026-09-27 (inherited) · Status: accepted
- Decision: Autonomous dental-image interpretation disabled; optional media only through consent + staff review; audio deferred. Scheduling = clinic's existing calendar + persistent OmniX consultation record; staff verifies and confirms. Calendar connector only after a signed clinic needs it.

## D-015 — Invitation-only, founder-operated onboarding and billing
- Date: 2026-09-26 (inherited, product owner) · Status: accepted
- Decision: Public signup returns 403; operator CLI issues invitations/recovery; founder invoices manually. Self-service signup/payment later.

## D-016 — One task at a time, evidence before DONE (from execution plan)
- Date: 2026-09-29 (inherited) · Status: accepted
- Decision: Execute one P-task per run, verify, append evidence to `docs/plan/PRODUCT_EXECUTION_TASKS.md`, stop. DONE only with evidence; VERIFIED = ready for founder acceptance. Expand only the next phase at each phase review.
- Consequences: Claude's `memory/` complements, not replaces, that evidence log.

## D-017 — Document organization
- Date: 2026-09-30 · Status: accepted
- Decision: Workspace docs live in `omnix/docs/{plan,product,compliance,evidence,research,archive}`, registered in `docs/README.md`. Service-specific operational docs stay in `apps/<app>/docs/`. Superseded docs are archived with a banner, not deleted. Code clutter is removed only via reviewed cleanup commits listed in the cleanup manifest (executed in CLN-1, now `docs/archive/2026-10-cleanup-manifest.md`).

## D-018 — Code review before continuing Phase 1
- Date: 2026-09-30 · Status: **superseded by D-019** (user: no disruptive steps now)
- Decision: Secure work (push/branch), fresh baseline run, then rubric review + cleanup, then resume P1-10. See `context/roadmap.md` → "Re-scheduled next steps".

## D-019 — Read-only rating first, starting with backend
- Date: 2026-09-30 · Status: accepted (user)
- Decision: No pushes, branch moves, cleanup commits, or fixes for now. First a read-only rubric rating per app via Claude Code, backend first (`reviews/prompts/01-backend-review.md` → `reviews/backend-v2.md`). The user and Claude read the report together and decide rebuild vs improve and the to-do list. Runtime QA testing comes later as a separate phase.
- Consequences: roadmap steps A–C wait until after the reports; KI-014/KI-015 remain open risks the user has been told about.

## D-020 — Stage 2 scope: Istanbul MVP gap list accepted
- Date: accepted by founder 2026-10-01; recorded 2026-10-04 (was referenced but never written — KI-077) · Status: accepted (founder)
- Decision: Stage 2 = the gap list in `docs/product/MVP_GAP_ANALYSIS_2026-10-01.md`, as cards P2-01…P2-15 in `docs/plan/PRODUCT_EXECUTION_TASKS.md` and packages in `docs/plan/work-packages/STAGE-2-istanbul-mvp.md`: G1 WhatsApp coexistence via Embedded Signup v4; G2 phone-app echoes → takeover; G3 handoff alerts to phone; G4 staff file/media sending (+ object storage); G5 click-to-WhatsApp ad attribution; G6 saved replies; G7 import/export; G8 Meta lead-form intake; G9 "try the assistant" sandbox; G10 cross-channel contact linking. Also in: Instagram DM, minimal doctor-review → quote, staff translation (originals always visible), patient languages = English + the design partner's top 1–2; KVKK hosting/transfer decided explicitly in F03.
- Out of Stage 2: travel/hotel timeline, broadcasts, video calls, native apps, review/referral automation, AI photo analysis, calendar sync (unless the design partner signs for it), payments, voice AI.
- Note: the **staff dashboard** languages (TR / EN / AR) are a separate pre-Stage-2 item (NIGHT-1), not patient languages.

## D-021 — A patient STOP stops automation, never staff
- Date: 2026-10-03 · Status: accepted (user) · Supersedes: WP-B proposed decision 1 ("STOP blocks staff sends until START/BAŞLA")
- Decision: After a patient STOP the AI is paused and AI replies, follow-ups, consent requests and any future broadcasts/templates/reminders are blocked. Staff are alerted once and may still reply manually; no 422, no forced confirmation, no override reason — the UI shows a notice only. A STOP is only an exact whole-message command (`stop that, let's negotiate` is not one; `cancel` / `iptal` are not STOP words). START/BAŞLA re-enables automated sends but does not resume the AI. The 24 h WhatsApp window still limits staff sends (technical, not consent).
- Consequences: WP-B1 F1/F2 implement it; WP-D shows the notice instead of an error; WhatsApp coexistence (WP-M) needs no special blocking for phone-app messages. Sentence-level opt-out intent ("please stop messaging me") is not auto-detected — known limitation, revisit after F02/F03.

## D-022 — P1-11 deployment inputs: private-network gRPC, founder-run pg_dump backups (2026-10-03)
- Founder chose Nest ↔ Python gRPC over the private network (`INTERNAL_GRPC_TLS=disabled` + `INTERNAL_GRPC_PRIVATE_NETWORK=true`), valid only if both services share one Railway project with private networking; otherwise revisit TLS.
- Staging backups go to external `pg_dump` storage. Claude prepares the commands and the founder runs them; Claude gets no deploy token.
- P1-10 is verified before P1-11 starts. Staging environment and RPO/RTO owner are still open (KI-018).

## D-023 — Staging: new Railway environment by founder; RPO 24 h / RTO 4 h owned by founder (2026-10-03)
- Founder confirmed no staging exists and will create a `staging` Railway environment (own Postgres + Redis, no real patients) following `docs/archive/2026-10-work-packages-done/P1-11-staging-setup.md`.
- Backup targets for staging: RPO 24 h (daily `pg_dump`), RTO 4 h; owner: founder. Revisit before real patient data.
- Meta/provider checks out of P1-11 scope (Phase 5); staging uses placeholder Meta/OpenAI values, so no paid model calls or real sends.

## D-024 — Phase 1 accepted (P1-12), with the staff-messaging rule confirmed
- Date: 2026-10-04 · Status: accepted (founder)
- Decision: Phase 1 (P1-01…P1-12) is accepted. Founder condition, confirmed in code on `main` (backend ef2cdfa): staff can always send a manual message (inside the WhatsApp 24 h window); a staff message pauses the AI **for that conversation only**; when staff resume the AI it answers again; a patient STOP stops the AI and automated messages but **never** blocks staff — staff decide (D-021).
- Not implied: real patient traffic is still not approved until backups (KI-018), health check + rollback rehearsal (KI-074) and production rotation (KI-013/KI-068) are done.

## D-025 — QA-1F defaults accepted
- Date: 2026-10-04 · Status: accepted (founder)
- Decision: (1) refresh-token reuse grace 10 s for parallel tabs (KI-070); (2) messages that arrive while the AI is paused are not auto-answered on resume — the AI answers the next new message; (3) staff who already belong to a clinic cannot create another clinic (already enforced by the idempotent create-workspace flow); (4) a clinic without an AI persona hands conversations to staff (AI paused + one alert, KI-086).

## D-026 — Clinic owners manage their team's roles
- Date: 2026-10-05 · Status: accepted (founder)
- Decision: holders of `organization:manage` (by default the clinic `Super Admin` role, i.e. the owner; not `Manager`) can change a member's role and remove a member. Guards: only grant roles whose permissions you hold; no self change/removal; at least one active Super Admin always remains; removed/demoted users lose access immediately; audited. Implemented as NIGHT-1 N5.

## D-027 — One repo, one docs folder, light card process
- Date: 2026-10-06 · Status: accepted (founder) · Supersedes: D-009 (separate repos), D-017 (document organization), the work-package shared rules and evidence-file routine (D-016 "evidence before DONE" now = a `docs/LOG.md` entry). Resolves Q7 / IMP-008.
- Context: three repos made CI fragile (peer token, commit pins, cross-repo contract checks) and ~70 docs repeated the same facts in 4–5 places; the founder lost track and credits went to paperwork.
- Decision: (1) one GitHub repo `omnix`; apps keep their folder names under `apps/`; history of all three repos imported (backend + frontend from `main` merged with NIGHT-1 N4/N5, Python from `main`); old repos archived read-only. (2) All documentation in `docs/`: `PLAN.md`, `README.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `ISSUES.md`, `LOG.md`, plus `docs/reference/` (business, specs, ops runbooks; read only when a card points there). Root `AGENTS.md` is the entry for every agent; `CLAUDE.md` imports it. No app-level `.md` files. (3) Card process: one prompt, branch + PR, tests only as the card says, end with `PLAN.md` + `LOG.md`; no evidence files; deleted history (archive, evidence, reviews, memory, context, graphify) is in git history of the old repos and `_backup/omnix-docs-before-restructure-2026-10-06.zip` (local, not in git).
- Consequences: Railway services must point to the new repo with root directories; GitHub CI secret `CROSS_REPO_READ_TOKEN` no longer needed (KI-015 closed). Per-file `git log` for pre-import commits: use `git log` on the whole repo.

## D-028 — MVP = one real clinic on WhatsApp; Stage 2 cut to 5 items
- Date: 2026-10-06 · Status: accepted (founder) · Narrows: D-020 (Stage 2 scope stays the long list, but only these come before the first clinic)
- Decision: before the first clinic only M1 P2-01 coordination records, M2 P2-02 + P2-08 handoff/notes/phone alert, M3 P2-03 consultation flow, M4 P2-04 + P2-05 WhatsApp coexistence + phone echoes, M5 go-live basics (backups, health check + rollback, production rotation, gRPC settings). Everything else in D-020 waits for first-clinic feedback and a founder "yes".
- Consequences: `docs/PLAN.md` is the only card list. Ideas-file ⚑ items for P2-09/P2-10 move with those cards; the full ideas review happens after the MVP instead of at P2-15.

## D-029 — One small CI check on pull requests
- Date: 2026-10-06 · Status: accepted (founder)
- Decision: `.github/workflows/ci.yml` runs on pull requests only: backend build + unit tests + contract check, frontend build + vitest, Python pytest. No browser or database suites in CI; cards run those locally only when they say so.
- Consequences: replaces the backend cross-service workflow and the Python workflow; hosted browser/DB coverage is gone on purpose (cost).

## D-030 — Validate with clinics first; build only WhatsApp coexistence now
- Date: 2026-10-06 · Status: accepted (founder) · Supersedes: D-028 build order; amends D-029 (CI)
- Context: founder wants to test the market before building more; the current product (WhatsApp AI replies, handoff, Inbox, leads, TR/EN/AR) is enough to demo and pilot.
- Decision: (1) next work is validation: deploy, go-live basics, a staging demo, 10 clinic conversations, one pilot (`PLAN.md` V1–V5). (2) The only build card now is **M4 = P2-04 + P2-05 WhatsApp coexistence** — the clinic keeps its own number and phone app, a better experience than a second Cloud API number. (3) M1–M3 wait until a pilot clinic needs them; P2-01 partial work parked on `p2-01/coordination-records` @ 44033f6 (schema + migration, untested, not merged). (4) CI runs by hand only (`workflow_dispatch`); agents never wait for or fix CI unless the founder asks.
- Consequences: Meta Business verification + Tech Provider review is now on the critical path (founder). Until it passes, a pilot can start on a dedicated Cloud API number.

## D-031 — The AI conversation is the core; measure it, then rebuild it; discover market needs in parallel
- Date: 2026-10-06 · Status: accepted (founder: "the messaging is the main core… make it best")
- Decision: (1) AI work follows `docs/reference/product/AI_SALES_PLAYBOOK.md`: AI-1 eval set first, AI-2 one coordinator agent with playbook guidelines + clinic fact sheet (replaces the forced-qualification router and five writer nodes, KI-020), AI-3 tuning + model choice by eval. (2) Discovery D1–D5 runs in parallel; its findings can change the playbook and the build list. (3) Builders no longer edit `PLAN.md`; the planner updates it after review (fewer merge conflicts).
- Consequences: paid model calls are allowed only for founder-run eval runs (small, a few dollars); unit tests stay on fake models.
