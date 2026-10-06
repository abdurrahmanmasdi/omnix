# OmniX — product rules and how we work

_Single source of truth since 2026-10-06 (D-027). Older docs: `docs/reference/` and git history._

## 1. What OmniX is

- **Brand:** OmniX. Old names: OmniDesk AI, OmniDesk_ai, AI Sales Agent. Same product.
- **Market:** dental clinics in **Istanbul** serving **international patients** (many languages, time zones, currencies). Long-term: an AI sales employee for other industries. **Now: dental only** (D-001).
- **Parts:** an AI patient coordinator on WhatsApp (answers from clinic-approved knowledge, collects lead info, handles objections, sees consultation intent, hands off to staff) + an internal CRM (leads, pipeline, conversations = **source of truth**) + a staff dashboard (Inbox, leads, settings, human takeover).
- **Users:** operator (OmniX side, issues invitations) · clinic owner/admin (sets up clinic, persona, knowledge, channels, roles) · staff/coordinator (Inbox, takeover, leads, confirm consultations) · patient (WhatsApp).
- **Invitation-only pilot** (D-005, D-015). Public signup is off. Real patient traffic is **not approved** yet (see `PLAN.md` → Pilot gate).
- **First release** (D-011): one location, one WhatsApp number, three staff, English + Turkish, text-first, staff-confirmed consultations, owned staff tasks, weekly report. Pricing in `reference/product/PRODUCT_STRATEGY_AND_MVP_PLAN_2026-09-26.md` is an untested guess.

## 2. Non-negotiable rules

Product / patient safety
1. A **booking request is never a confirmed appointment.** Staff confirm availability and appointments.
2. Clinic facts (prices, treatments, policies) need **approved evidence**. Missing info → clarify or hand to staff. Never invent.
3. No diagnosis, no guaranteed outcomes, no personal medical advice. Medical questions → staff.
4. **AI identity is disclosed** to patients.
5. **Human takeover is core:** once staff take over or the AI is paused, no stale AI reply may be sent. A staff message pauses the AI for that conversation (D-024).
6. Keep intent, commercial readiness, consent and medical risk as **separate dimensions**.
7. A patient STOP stops automation, never staff (D-021).

Engineering
8. Internal Postgres records are the source of truth. HubSpot/Zoho are optional adapters; a CRM outage must never lose a lead.
9. Keep every invariant in `ARCHITECTURE.md` → Invariants (signed raw-body webhooks, dedupe, leases/stateVersion, UNKNOWN sends, opt-out, media consent, tenant isolation, encrypted credentials). Code that looks strange there is often deliberate — check the app's "Deliberate" list first.
10. The AI proposes actions; **the Nest backend validates and executes** them. The action contract lives in Python and Nest — **change both together**.
11. Tenant isolation and permissions (assigned-only, PII, message history) hold on **both HTTP and Socket.IO**.
12. Generated contracts (protobuf, action contract, socket contract, OpenAPI → Orval) are regenerated, never hand-edited.
13. LLM models/providers come from config and are validated at startup.
14. Refactors and behavior changes go in **separate** commits.

Honesty / claims
15. Keep **implemented** vs **historically evidenced** vs **proposed** apart. A spec is not code; an old test run is not current proof.
16. Never claim: SOC 2, guaranteed conversion or response time, 24/7 SLA, automatic calendar booking, proven CRM sync, production readiness, clinical outcomes.

Data hygiene
17. Never read, copy, print or commit `.env` files, tokens, keys, real transcripts, patient images or raw webhook payloads. Use secret *names* and synthetic data.
18. `npm run db:deploy` runs migrations **and credential upgrades** — only against the intended dev DB.

## 3. How we work

**Roles.** The founder decides and clicks (Railway, GitHub merges, Meta). Claude chat = planner + reviewer: writes the card prompt, reviews the result read-only, keeps `docs/` current. A coding agent (Codex or Claude Code) builds one card at a time.

**Mode.** Continue and improve the existing code (D-008). No rewrite without evidence and the founder's OK (D-010).

**Card process (light, D-027)**
1. Planner gives one prompt for one card from `PLAN.md`.
2. Builder works on branch `<card-id>/<short-name>` (e.g. `p2-01/coordination-records`), one commit per item, pushes the branch, opens a PR.
3. Builder runs only the tests the card names: tests for the files it touched while working, the app's unit suite once at the end, DB/browser suites only if the card says so. CI is manual; do not wait for it or fix it unless the founder asks (D-030).
4. Builder ends with: `PLAN.md` status updated, one `LOG.md` entry (branch, commits, test counts, decisions needed, what to click), new KIs in `ISSUES.md`. **No evidence files, no new `.md` files.**
5. Planner reviews (log entry, commits, migrations, the riskiest change) and tells the founder what to decide and click. Founder merges the PR and deploys.

**Credits.** Commit after every item so a stopped run loses nothing. Don't re-read big files; grep. No new tests, CI or tooling beyond the card — write the idea as an IMP in `ISSUES.md`. Mechanical chores don't need the strongest model.

**Ideas file** (`reference/product/IDEAS_FROM_CRM_RELEASE_2026-10-05.md`): ⚑ #15 "optional integrations are capabilities and never crash" applies to **every card**; ⚑ #14 "integrations show liveness" at P2-04; ⚑ #11 "automations state their limits" at any automation; ⚑ #6 at P2-09, ⚑ #17 at P2-10 (both later). Review the whole file after the MVP.

## 4. Memory — where to write what (write it immediately)

| What | Where |
| --- | --- |
| A decision (founder or agreed) | `DECISIONS.md` → new `D-XXX` (supersede, never delete) |
| A bug, gap or trap | `ISSUES.md` → new `KI-XXX` (next free id is written at the top) |
| Something undecided | `ISSUES.md` → Open questions `QX`; when answered → D-XXX + remove |
| An improvement idea | `ISSUES.md` → Ideas `IMP-XXX` |
| Where we are / next step | `PLAN.md` → rewrite "Now" (≤ 25 lines, no appended updates) |
| What happened | `LOG.md` → one entry, newest at the bottom |
| A stable fact about the system (module, env var, command, route) | `ARCHITECTURE.md`, right section |

Dates: YYYY-MM-DD, Europe/Istanbul. Evidence levels: **[verified]** checked in code/tests · **[doc]** from docs only · **[proposed]**. Never write secrets or patient data.

## 5. Repo, branches and deploy

- GitHub repo: `omnix` (monorepo since 2026-10-06, D-027). The old `Omnix_BE`, `Omnix_FE`, `Omnix_py` repos are archived read-only.
- `main` = what is deployed. Railway deploys each service from `main` with its root directory: Backend → `apps/backend-v2`, Frontend → `apps/frontend-v2`, Python → `apps/python-ai-service-v2`. Environments: `staging`, `production`.
- CI: `.github/workflows/ci.yml`, **run by hand only** (D-030): backend build + unit tests + contract check, frontend build + vitest, Python pytest (D-029).
- Local dev/test commands per app: `ARCHITECTURE.md` → the app's section. Full local gate (slow, only when a card asks): `bash apps/backend-v2/scripts/quality-gate.sh`; DB acceptance: `./test_e2e_pilot.sh` (Docker, disposable DB).
