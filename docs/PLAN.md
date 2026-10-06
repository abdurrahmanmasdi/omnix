# OmniX plan — the compass

## Now
_Rewrite this section at the end of every card/session (≤ 25 lines). Last: 2026-10-06 22:00._

- **Goal:** find out if clinics want this **before building more** (D-030). Success = one Istanbul clinic agrees to a 14-day pilot and uses OmniX with real patients.
- **What already works (enough to demo and to pilot):** WhatsApp → AI reply (from the clinic's approved knowledge) → handoff to staff (AI pauses, alert) → staff reply from the Inbox; leads + pipeline; TR/EN/AR dashboard; team roles; clinic connects WhatsApp by pasting Cloud API credentials in Settings → Channels (works for a **dedicated number** that is not on the phone app).
- **Only one build card now: M4 WhatsApp coexistence** (founder 2026-10-06: clinics keep their own number and phone app — a much better experience than a second Cloud API number). Everything else is frozen except fixes a pilot clinic needs; M1–M3 wait until a clinic asks.
- **This week (founder, no code):** (1) push the repo + switch Railway (steps in `LOG.md`); (2) M5 go-live basics; (3) staging demo clinic with synthetic knowledge; (4) show it to clinics from `reference/research/` and ask for a pilot.
- **Founder, start today:** Meta Business verification + Tech Provider app review — M4 cannot go live without it and Meta is slow.
- **Parked:** P2-01 partial work (schema + migration, untested) on branch `p2-01/coordination-records` @ `44033f6`.
- **Open founder decisions:** Q14 pilot mode (draft mode recommended), Q5 which clinic.

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
| M4 | **P2-04 + P2-05** (no dependency on M1) Connect the clinic's existing WhatsApp number (coexistence) + phone-app replies pause the AI | Clinic keeps its number and phone app | **Meta Business verification + Tech Provider** (founder; start now, it is slow) | **Now** (founder decision 2026-10-06) |
| M5 | Go-live basics | (now V2) | Railway | Before real patients |

Full original card text: `reference/plan/PRODUCT_EXECUTION_TASKS.md` → grep `#### P2-0X`. Acceptance criteria: `reference/plan/CTO_DELIVERY_BACKLOG_2026-09-27.md`. Embedded Signup v2/v3 die 15 Oct 2026 — M4 builds only on v4.

### M1 — P2-01 coordination records (short)
Tenant-scoped Prisma models + migration + `src/coordination/` module: `Consultation`, `CoordinatorTask`, `InternalNote` (+ revision), `PatientFact` (key, value, state KNOWN/UNKNOWN/DECLINED, evidence message id, source — ideas #1/#2), `OutcomeEvent` (append-only), `ActionRecord` (unique action id per clinic). Status transitions as pure functions; updates are compare-and-set on `version` → 409 on conflict. New permissions `consultations:*`, `tasks:*`, `notes:*` for default roles. Verify: transition unit tests; disposable-DB e2e (migration on empty + existing DB, cross-clinic link fails, duplicate action id → one record, concurrent update → one 409). Stop: no UI, no AI action changes. Also KI-081 (multi-clinic login) is noted for this card.

### M2 — P2-02 + P2-08 handoff, notes, phone alert (short)
Existing handoff (AI action, UNKNOWN routing, STOP alert) creates one `CoordinatorTask` in the same transaction as the pause. APIs: claim, acknowledge, reassign, wait, complete, cancel (permissions, audit, socket to new owner). Overdue/unowned → notify the clinic manager. Notes CRUD in the Inbox patient panel; a test proves notes never reach an outbound message. Inbox header shows owner + task state, TR/EN. Phone alert: PWA manifest + service worker + web push per device, opt-in, revoked on logout/removal, one alert per handoff, no patient data in the push ("New handoff" + link). Stop: no email/SMS fallback unless the founder picks a provider.

### M3 — P2-03 consultation flow (short)
New versioned AI action `request_consultation` on both sides of the contract; Nest validates and returns a receipt (`committed|rejected|retryable_failure`); the reply may say "request recorded" only when committed. Staff: confirm (slot, duration, attests the clinic calendar is free), reschedule, cancel, attended/no-show; no duplicate or overlapping confirmations. Patient-facing times in the patient's IANA time zone (test across the late-October DST change). Inbox consultation card, TR/EN. Founder demo: one synthetic patient from enquiry to attended. Stop: no calendar sync (D-014), no reminders.

### M4 — P2-04 + P2-05 WhatsApp coexistence (short)
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
