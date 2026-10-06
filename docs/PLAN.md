# OmniX plan — the compass

## Now
_Rewrite this section at the end of every card/session (≤ 25 lines). Last: 2026-10-06._

- **Goal:** one real Istanbul clinic uses OmniX on its WhatsApp with real patients, supervised, as soon as possible — to test the market (D-028).
- **Done:** Phase 1 foundation accepted (D-024). NIGHT-1 dashboard basics N1–N5 (TR/EN/AR languages, profile, team page, platform admin, role change/removal) are on `main` of the new monorepo (merged 2026-10-06 during the restructure; not yet deployed).
- **Repo:** one GitHub repo `omnix` with all three apps and one small CI (D-027, D-029). Docs = `docs/` only.
- **Next card:** **M1 = P2-01 coordination records** (backend only). Prompt was written 2026-10-06 but never run — re-issue it for the monorepo.
- **Founder now:** (1) create the `omnix` GitHub repo and push (steps in `LOG.md` 2026-10-06); (2) switch the 3 Railway services to the new repo + root directory, deploy `main` (N2–N5 bring 3+ migrations), set `PLATFORM_ADMIN_EMAILS`; (3) archive the old repos; (4) keep Meta Business verification moving (blocks M4).
- **Open founder decisions:** Q14 pilot mode (draft mode recommended), Q5 which clinic.

## MVP path (D-028) — only these before the first clinic

| # | Card | What the clinic gets | Needs | Status |
| --- | --- | --- | --- | --- |
| M1 | **P2-01** Coordination records | Records for consultations, staff tasks, notes, patient facts, outcomes (backend only, no UI) | — | **NEXT** |
| M2 | **P2-02 + P2-08** Owned handoff + notes + phone alert | Handoff becomes a task a staff member claims; private notes in the Inbox; one push alert on the phone per handoff | M1 | queued |
| M3 | **P2-03** Consultation request → confirm → reschedule/cancel → attended | The first full journey: patient asks, staff confirm a slot, outcome recorded | M2 | queued |
| M4 | **P2-04 + P2-05** Connect the clinic's existing WhatsApp number (Embedded Signup v4, coexistence) + messages sent from the phone app pause the AI | Clinic keeps its number and phone app; staff replies from the phone are a takeover | M1 + **Meta Business verification + Tech Provider** (founder) | queued — blocked on Meta |
| M5 | **Go-live basics** (founder, no code) | Safe hosting: scheduled backups (KI-018), `/health` checks + rollback rehearsal (KI-074), production password rotation + membership check (KI-013/KI-068), production gRPC settings (KI-002) | Railway | open |

Order: M1 → M2 → M3, M4 as soon as Meta access exists (Embedded Signup v2/v3 die 15 Oct 2026 — build only on v4). M5 any time, must be done before real patients.
Full original card text (files, steps, verify, stop): `reference/plan/PRODUCT_EXECUTION_TASKS.md` → grep `#### P2-0X`. Acceptance criteria per ticket: `reference/plan/CTO_DELIVERY_BACKLOG_2026-09-27.md` → grep `C05`/`C06`/`C07`.

### M1 — P2-01 coordination records (short)
Tenant-scoped Prisma models + migration + `src/coordination/` module: `Consultation`, `CoordinatorTask`, `InternalNote` (+ revision), `PatientFact` (key, value, state KNOWN/UNKNOWN/DECLINED, evidence message id, source — ideas #1/#2), `OutcomeEvent` (append-only), `ActionRecord` (unique action id per clinic). Status transitions as pure functions; updates are compare-and-set on `version` → 409 on conflict. New permissions `consultations:*`, `tasks:*`, `notes:*` for default roles. Verify: transition unit tests; disposable-DB e2e (migration on empty + existing DB, cross-clinic link fails, duplicate action id → one record, concurrent update → one 409). Stop: no UI, no AI action changes. Also KI-081 (multi-clinic login) is noted for this card.

### M2 — P2-02 + P2-08 handoff, notes, phone alert (short)
Existing handoff (AI action, UNKNOWN routing, STOP alert) creates one `CoordinatorTask` in the same transaction as the pause. APIs: claim, acknowledge, reassign, wait, complete, cancel (permissions, audit, socket to new owner). Overdue/unowned → notify the clinic manager. Notes CRUD in the Inbox patient panel; a test proves notes never reach an outbound message. Inbox header shows owner + task state, TR/EN. Phone alert: PWA manifest + service worker + web push per device, opt-in, revoked on logout/removal, one alert per handoff, no patient data in the push ("New handoff" + link). Stop: no email/SMS fallback unless the founder picks a provider.

### M3 — P2-03 consultation flow (short)
New versioned AI action `request_consultation` on both sides of the contract; Nest validates and returns a receipt (`committed|rejected|retryable_failure`); the reply may say "request recorded" only when committed. Staff: confirm (slot, duration, attests the clinic calendar is free), reschedule, cancel, attended/no-show; no duplicate or overlapping confirmations. Patient-facing times in the patient's IANA time zone (test across the late-October DST change). Inbox consultation card, TR/EN. Founder demo: one synthetic patient from enquiry to attended. Stop: no calendar sync (D-014), no reminders.

### M4 — P2-04 + P2-05 WhatsApp coexistence (short)
Re-check Meta's current docs first. Embedded Signup v4 with `whatsapp_business_app_onboarding`; backend swaps the code server-side, stores the token encrypted, creates the channel, subscribes `history`, `smb_app_state_sync`, `smb_message_echoes`; idempotent. History import read-only, deduped, no AI run, no sends. Graph API version in one config value (KI-076). Echoes (`smb_message_echoes`) → stored as staff message "sent from phone", AI paused + `stateVersion` bumped in one transaction (in-flight AI reply dropped). Ideas ⚑ #14: the channel shows whether it is alive. Live test only with Meta test assets and the founder present.

## Pilot gate — before the first real patient
- [ ] M1–M5 done and deployed; founder demo passed on staging.
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
