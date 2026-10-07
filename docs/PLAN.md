# OmniX plan — the compass

## Now
_Planner rewrites this section after each review (≤ 25 lines). Last: 2026-10-07 00:35._

- **Goal:** find out what clinics need before building more (D-030) and make the AI conversation excellent (D-031).
- **AI status:** coordinator v2 on `ai-2/coordinator-v2` (PR #3): **80% pass, 4.55/5** vs old graph 27.5% on the 40-scenario eval (gpt-6-luna, ~$0.03 per v2 run). Fixes after that run (`1891fca`) not yet measured. v2 is off until a clinic id is listed in `COORDINATOR_V2_ORG_IDS`.
- **Done 2026-10-07:** v2 rerun **33/40 (82.5%), 4.51/5**; PR #3 merged (follow-up fixes merged locally afterwards, `c6f30bc`).
- **Then:** plan AI-3 together — tools, knowledge use (when to put all facts in the prompt vs search), handoff rules, photo consent, prompt-injection answer, appointment-confirmation block (KI-095), Arabic handoff copy, model choice (KI-097 Railway settings before deploy).
- **Founder, in parallel:** Railway switch (V1), Meta verification + v4 config, D2 mystery shopping + D3 interviews (Claude writes the materials).
- **Open founder decisions:** Q14 pilot mode (draft mode recommended), Q5 which clinic.
- **Parked:** P2-01 partial work on `p2-01/coordination-records` @ `44033f6`.

## Discovery — learn what the market needs (D-031)

| Step | What | Who | Output |
| --- | --- | --- | --- |
| D1 | Desk research: how Istanbul dental clinics get and handle international leads (ads, agencies, Instagram), team sizes, tools they already pay for (WhatsApp Business, Kommo, respond.io, Bitrix24…), AI/chatbot competitors and prices. Builds on `reference/research/OMNA-9_Competitor_Landscape_Brief.md` | Claude | **Done** — `reference/research/D1_MARKET_MAP_2026-10.md` |
| D2 | Mystery shopping: message 10 clinics on WhatsApp as a patient (script + sheet from Claude); log reply time, price handling, photo request, follow-ups | Founder | Filled sheet |
| D3 | 5 interviews with clinic owners/coordinators (question guide from Claude, "Mom Test" style: past behavior, not opinions) | Founder | Notes per interview |
| D4 | Synthesis: rank needs by pain × frequency × willingness to pay → what to build, what to drop, pricing, pitch | Claude | Updated `PLAN.md` + playbook |
| D5 | Pilot offer to the best-fit clinic | Founder | Signed pilot |

## AI cards (D-031)

| # | Card | Status |
| --- | --- | --- |
| AI-1 | Eval set (~40 scenarios EN/TR/AR) + simulated patient + judge + hard checks + one command; synthetic demo clinic fact sheet; runs with a fake model in tests, real model only when the founder runs it | **Done** (PR #2); baseline run by founder pending |
| AI-2 | Coordinator v2: playbook guidelines file + clinic fact sheet in prompt + one agent + tools, behind a per-clinic switch; old graph kept until v2 wins on evals | **Done** (PR #3, 80% vs 27.5%) |
| AI-3a | **Done (merged)** Safety + behavior: block appointment-confirmation wording (KI-095), EN/TR/AR handoff copy, off-topic/manipulation levels (D-033), photo consent, fewer early handoffs, price confidence; new eval scenarios | **Done** (38/51; handoff overuse fixed in AI-3b item 0) |
| AI-3b | Clinic fact sheet (settings page + approval), save-patient-facts via existing actions, handoff summary shown in Inbox, active offers, patient report | **Done** (PR #5, migration `20261007000000_clinic_fact_sheets`); founder eval run pending |
| AI-3c | Model comparison luna vs sol on the evals (founder runs) + Railway settings (KI-097) | queued |
| REP-1 | Weekly owner report (leads, reply speed, handoffs, consultations requested, top questions, AI vs staff) (per-patient report done in AI-3b) | **NEXT** (Claude Code) |
| INT-1 | Generic CRM connector: outbound webhooks for lead/handoff/consultation events (Zapier/Make) + CSV export; native connector only for the CRM most interviewed clinics use | queued |
| AI-4 | More tools: consultation request (staff confirm), forward patient file to doctor (with consent), smart follow-ups (templates/24 h rule) | queued |
| M4b | 360dialog connector: clinic connects its WhatsApp Business app number via its own 360dialog account (coexistence) and pastes the API key; OmniX sends/receives through 360dialog incl. phone echoes → AI pause. Needed because OmniX cannot be a Meta Tech Provider without a company (README §0) | queued — before the first pilot |
| UX-1 | Dashboard redesign (colors, layout, profile page) — **last**, after the designer delivers the palette (founder 2026-10-07) | queued |

## Validate first (D-030)

| Step | What | Who | Done when |
| --- | --- | --- | --- |
| V1 | Push repo, switch Railway, deploy staging + production | Founder | `/ready` OK, login works |
| V2 | **M5 go-live basics**: scheduled backups (KI-018), `/health` + rollback (KI-074), production password rotation (KI-013/KI-068), production gRPC settings (KI-002) | Founder (Claude writes exact steps on request) | All four ticked |
| V3 | Demo clinic on staging: persona, 1-page synthetic price/treatment list, a test WhatsApp number; a 5-minute demo script (patient asks price in EN/TR → AI answers from knowledge → asks for photos/medical → hands to staff → staff replies) | Founder + Claude (script) | Demo runs end to end on a phone |
| V4 | Talk to 10 clinics from the 25-clinic list; show the demo; offer the 14-day pilot (price hypothesis in `reference/product/PRODUCT_STRATEGY_AND_MVP_PLAN_2026-09-26.md`). Write down every "no, because…" and every "yes, if…" in `LOG.md` | Founder | 10 conversations logged |
| V5 | First pilot: the clinic's own number via M4 coexistence (fallback while Meta review is pending: a dedicated Cloud API number), draft mode, founder onboards by hand (invite, knowledge, persona, staff accounts) | Founder + clinic | Real patients flowing, weekly check-in |

**Build rule:** M4 is built now, in parallel with V1–V4. Any other card starts only when a pilot clinic (or several "yes, if…" answers) needs it.

## Build cards (M4 now; the rest on demand — D-030)

| # | Card | What the clinic gets | Needs | Build when |
| --- | --- | --- | --- | --- |
| M1 | **P2-01** Coordination records | Records for consultations, staff tasks, notes, patient facts, outcomes (backend only) | — | Before M2/M3 |
| M2 | **P2-02 + P2-08** Owned handoff + notes + phone alert | Handoff becomes a task a staff member claims; private notes; one push alert per handoff | M1 | Clinic misses handoffs or wants notes |
| M3 | **P2-03** Consultation request → confirm → attended | Tracked consultation journey | M2 | Clinic wants bookings tracked in OmniX |
| M4 | **P2-04 + P2-05** (no dependency on M1) Connect the clinic's existing WhatsApp number (coexistence) + phone-app replies pause the AI | Clinic keeps its number and phone app | **Meta Business verification + Tech Provider** (founder; start now, it is slow) | **Implemented; PR review + founder-supervised Meta test pending** |
| M5 | Go-live basics | (now V2) | Railway | Before real patients |

Full original card text: `reference/plan/PRODUCT_EXECUTION_TASKS.md` → grep `#### P2-0X`. Acceptance criteria: `reference/plan/CTO_DELIVERY_BACKLOG_2026-09-27.md`. Embedded Signup v2/v3 die 15 Oct 2026 — M4 builds only on v4.

### M1 — P2-01 coordination records (short)
Tenant-scoped Prisma models + migration + `src/coordination/` module: `Consultation`, `CoordinatorTask`, `InternalNote` (+ revision), `PatientFact` (key, value, state KNOWN/UNKNOWN/DECLINED, evidence message id, source — ideas #1/#2), `OutcomeEvent` (append-only), `ActionRecord` (unique action id per clinic). Status transitions as pure functions; updates are compare-and-set on `version` → 409 on conflict. New permissions `consultations:*`, `tasks:*`, `notes:*` for default roles. Verify: transition unit tests; disposable-DB e2e (migration on empty + existing DB, cross-clinic link fails, duplicate action id → one record, concurrent update → one 409). Stop: no UI, no AI action changes. Also KI-081 (multi-clinic login) is noted for this card.

### M2 — P2-02 + P2-08 handoff, notes, phone alert (short)
Existing handoff (AI action, UNKNOWN routing, STOP alert) creates one `CoordinatorTask` in the same transaction as the pause. APIs: claim, acknowledge, reassign, wait, complete, cancel (permissions, audit, socket to new owner). Overdue/unowned → notify the clinic manager. Notes CRUD in the Inbox patient panel; a test proves notes never reach an outbound message. Inbox header shows owner + task state, TR/EN. Phone alert: PWA manifest + service worker + web push per device, opt-in, revoked on logout/removal, one alert per handoff, no patient data in the push ("New handoff" + link). Stop: no email/SMS fallback unless the founder picks a provider.

### M3 — P2-03 consultation flow (short)
New versioned AI action `request_consultation` on both sides of the contract; Nest validates and returns a receipt (`committed|rejected|retryable_failure`); the reply may say "request recorded" only when committed. Staff: confirm (slot, duration, attests the clinic calendar is free), reschedule, cancel, attended/no-show; no duplicate or overlapping confirmations. Patient-facing times in the patient's IANA time zone (test across the late-October DST change). Inbox consultation card, TR/EN. Founder demo: one synthetic patient from enquiry to attended. Stop: no calendar sync (D-014), no reminders.

### M4 — P2-04 + P2-05 WhatsApp coexistence (short)
**Status (2026-10-06):** implementation and synthetic checks complete on `m4/whatsapp-coexistence`; review and founder-supervised Meta test remain. No live provider call, deployment or database migration was performed. Meta docs re-read in Chrome (v4 page updated 2026-09-03; coexistence 2026-06-26); Graph API default v26.0, session-info schema 3.
Re-check Meta's current docs first. Embedded Signup v4 with `whatsapp_business_app_onboarding`; backend swaps the code server-side, stores the token encrypted, creates the channel, subscribes `history`, `smb_app_state_sync`, `smb_message_echoes`; idempotent. History import read-only, deduped, no AI run, no sends. Graph API version in one config value (KI-076). Echoes (`smb_message_echoes`) → stored as staff message "sent from phone", AI paused + `stateVersion` bumped in one transaction (in-flight AI reply dropped). Ideas ⚑ #14: the channel shows whether it is alive. Live test only with Meta test assets and the founder present.

## Pilot gate — before the first real patient
- [ ] V1–V3 done (deployed, go-live basics, demo runs).
- [ ] Design-partner clinic chosen (F01, Q5), its knowledge pack approved (F02), staffed hours + escalation contacts set.
- [ ] KVKK/hosting/transfer decision and clinic agreement (F03, Q6); privacy notice from `reference/compliance/`.
- [ ] Pilot mode decided (Q14). Recommended: **draft mode** — the AI suggests, staff approve every reply — because the AI quality gaps (KI-020, Phase 3) are not fixed yet; staff carry that risk.
- [ ] Native Turkish check of STOP/START words and handoff/consent/disclosure copy (Q13).
- [ ] Staff trained (F04).

## Later — only after first-clinic feedback (each needs a "yes" from the founder)
P2-06 ad-click attribution · P2-07 staff file/media sending + object storage (KI-026) · P2-09 saved replies + staff translation · P2-10 doctor review → quote · P2-11 Instagram DM · P2-12 import/export + contact linking · P2-13 Meta lead forms · P2-14 "try the assistant" sandbox · Phase 3 AI rebuild (C08–C13: approved knowledge, retrieval, memory, new graph, EN/TR evals) · Phase 4 clinic operation (C14–C18) · review the whole ideas file.
Out of scope until a customer pays for it: calendar sync, payments, broadcasts, native apps, voice, travel/hotel, AI photo analysis, public signup, self-serve billing.

## Founder track (parallel)
F01 find the design-partner clinic (`reference/research/`) · F02 EN/TR knowledge pack · F03 counsel: KVKK hosting/transfers · F04 staff training · Meta Business verification + Tech Provider review (blocks M4).
