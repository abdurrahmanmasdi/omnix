# MVP gap analysis — Istanbul dental clinics

_2026-10-01 · Inputs: the three code reviews (`reviews/`), the plan (`docs/plan/`, C01–C20, P01–P03, PM01–PM09, F01–F05), and competitor pages checked 2026-10-01. Market: **Istanbul clinics serving international patients**. Status: proposal for founder decision — nothing here is scheduled yet._

## 1. Where the three reviews leave us

| App | Verdict | Score | What it means |
| --- | --- | --- | --- |
| backend-v2 | Keep & improve | 2.9 | Reliability core (outbox, leases, UNKNOWN sends, tenancy) is strong; side paths are weak (STOP/consent atomicity, staff manual send, AI allowed to change phone/email and set WON/LOST) |
| frontend-v2 | Keep & improve, **rebuild the Inbox** | 2.6 | Session/API core is sound; Inbox shows unsent drafts as sent, takeover button uses stale data, handoff alerts never fire |
| python-ai-service-v2 | Keep foundation, **replace the agent graph** (already Phase 3) | 2.4 | Boundary/tenancy/fail-closed good; today's AI breaks real conversations (any "help" → handoff, voice notes ignored, staff text treated as patient text, battlecard SQL broken, "Senior Medical Sales Consultant" persona) |

**No rewrite from zero.** Two module rebuilds, both already in the plan: Inbox (= first slice of C14) and agent graph (= C09–C11).
**Must-fix-before-patients items:** 11 backend + 7 frontend + 11 Python = **29**, plus 12 founder questions spread across the reports.

## 2. Features Istanbul competitors have that we lack and the plan doesn't cover

Only items **not** already in C01–C20 / P01–P03 / PM01–PM09. Ranked for an Istanbul MVP.

### Critical for MVP (a clinic won't adopt or can't operate without it)

| # | Gap | Why it matters in Istanbul | Who has it | What exists today |
| --- | --- | --- | --- | --- |
| G1 | **Keep the clinic's own WhatsApp number and phone app** — WhatsApp *Coexistence* via Meta Embedded Signup (Tech Provider onboarding) | Coordinators work from the WhatsApp Business app on their phones. Moving the number to API-only means they lose it, which is a deal-breaker. Coexistence is live in Türkiye; it syncs up to 180 days of history. Embedded Signup v2 is deprecated **2026-10-15**, so build on v4 | ClinicAI ("connects to existing clinic number"), most BSP inboxes | Tokens pasted manually in settings; C19 only says "verify coexistence before promising it" |
| G2 | **Detect replies sent from the phone app** (message echoes) → count them as staff takeover, pause the AI, and show them in the Inbox | With coexistence, staff will answer from their phone. If OmniX doesn't see it, the AI talks over the human. This is our rule 5 (takeover), applied to a new channel | Any coexistence-capable inbox | Not handled |
| G3 | **Handoff alerts that reach a phone** — web push (installable PWA) and/or a WhatsApp/email alert to the assigned coordinator | A handoff is useless if the coordinator isn't looking at the dashboard. Clinics expect "you get notified on your phone" | Hastam (mobile app, real-time), EVED (staff notifications), MeduAI360 (push) | In-app bell only (and the frontend review found its handoff alert never fires); no email or push provider at all |
| G4 | **Staff can send files and media** from the Inbox: price list, treatment plan, clinic location, before/after (consented) images | The daily coordinator job in dental tourism is sending documents and photos. Text-only staff replies aren't workable | Hastam, EVED (document sharing), every WhatsApp inbox | Staff manual send is text-only (and bypasses the delivery pipeline — backend critical) |
| G5 | **Ad-source capture** — store the Click-to-WhatsApp ad `referral` data (ad/campaign/source, click ID) on the lead's first message | Istanbul health-tourism clinics buy Meta and Instagram ads. The owner wants to know which ads bring consultations. That is the ROI story that sells us | Hastam (channel/revenue reports), EVED (Meta/Google ad sources), DentClosers (Meta/TikTok lead ingestion), HealthStay (lead-source analytics) | Lead sources are manual labels; the webhook `referral` field is ignored |

### Important for MVP (weakens the sale or daily use; can follow in the first weeks)

| # | Gap | Why | Who has it | Today |
| --- | --- | --- | --- | --- |
| G6 | **Saved replies / quick answers** (TR + EN), shared by the team | Coordinators repeat the same answers all day | Every WhatsApp inbox | None |
| G7 | **Import existing leads** (CSV/Excel) + **export** leads/conversations | Clinics switching from spreadsheets or another CRM need their pipeline; export answers the "no lock-in" objection | Hastam (CSV/Excel import), EVED (CSV export) | No import; `leads:export` permission exists but there's no endpoint |
| G8 | **Meta Lead Ads (Instagram/Facebook form) intake** → lead + first-contact WhatsApp template | Many campaigns use instant forms, not click-to-chat. Needs one approved first-contact template (touches C16) | Hastam (lead forms, Meta Ads), EVED, DentClosers | None |
| G9 | **"Try the assistant" sandbox** — founder/clinic chats with the AI on the clinic's own knowledge before going live, no WhatsApp needed | Needed for cold-outreach demos and for the clinic approver to check answers (supports C08/F02) | Common in AI assistant products | None (G1 "synthetic demo" exists only as a gate, not as a feature) |
| G10 | **Same patient on two channels / returning patient** — link or merge contacts, recognize returning patients | Becomes necessary as soon as Instagram or a second number exists | Hastam, EVED ("returning patient handling") | Only same-phone uniqueness per clinic |

### Not needed for the Istanbul MVP (competitors have them; skip on purpose)

Operation timeline (flights, hotels, transfers, interpreters), supplier approvals, bulk campaigns/broadcast, video calls, native mobile app (use PWA + push for G3), Google review/referral automation, AI photo analysis, calendar sync, deposits/payments, 100+ languages. These match the plan's deferred list and would stretch one developer too thin.

**Watch in F01 interviews (don't build yet):** voice/phone AI (Asistan 7/24, aicalls.com.tr offer it) and links to local clinic software such as **Dentsoft** and **Estesoft Stella** (Asistan 7/24 integrates natively). If the design partner runs one of these, a calendar/patient sync with it becomes the first integration to scope.

## 3. In the plan, but the Istanbul market says "too late" or "too narrow" — reconsider

These are already decided in the plan, so they aren't new gaps. Competitors treat them as basic, though, so it's worth a founder decision.

| Item | Plan today | Market signal | Suggestion |
| --- | --- | --- | --- |
| **Instagram DMs** | Deferred (D-011, backlog "deferred scope") | Every Istanbul competitor checked has it (Dentebot, Hastam, Asistan 7/24, MeduAI360, Invekto). Dentebot's entry plan is *Instagram-only*. A large share of Istanbul clinic leads start on Instagram | Move into MVP scope as the second channel. Partial code exists (`instagram.service.ts`: verify/disconnect only). Same Meta onboarding work as G1/G5 |
| **Patient languages** | EN + TR (D-011) | International patients write in English, Arabic, German, Russian, French. Turkish is mostly for staff and domestic patients. ClinicAI offers 11 languages, Dentebot "staff sees Turkish, patient gets their language" | Staff UI in Turkish; patient side = English + the design partner's top 1–2 languages (strategy doc already says "first clinic's two highest-volume languages"). Evaluate them in C13 |
| **Staff translation** (patient message ↔ Turkish, original kept) | PM08 "first paid iteration" | Dentebot and Hastam sell it as core. Turkish coordinators + foreign patients | Pull into the C14 Inbox slice |
| **Doctor review of photos → treatment-plan quote** | ClinicalReview/ApprovedQuote records in C05; admin UI + quote in P01 (after pilot) | This *is* the dental-tourism funnel: photo/X-ray → doctor → package quote. Hastam has a 5-minute multilingual PDF quote with link approval; MeduAI360 generates quotes with physician approval | Keep AI out of clinical judgment, but pull a minimal staff flow into Phase 2: consented photos → "doctor review" task → staff sends the approved quote PDF (uses G4) |
| **KVKK hosting and transfers** | F03 (counsel) | Competitors advertise "EU data center, KVKK/GDPR". Health data is special-category under KVKK; OpenAI/Railway abroad = cross-border transfer | Make hosting region and the transfer mechanism an explicit F03 decision before sales material |

## 4. What to do next (proposed order)

1. **Decision session (founder + Claude, ~1 hour):** answer the report questions (STOP + manual messages, AI-settable statuses, photos to OpenAI, LangSmith, Instagram/HubSpot scope, languages, patient media retention) and accept or reject G1–G10 and the §3 changes. Record them as decisions.
2. **Turn the 29 critical items into work packages**, not 29 tickets:
   - WP-A *Patient-safe AI replies now* (Python criticals: help-regex, TR handoff, staff-text, voice, summary injection, persona, contract narrowing + Nest side)
   - WP-B *Delivery and consent correctness* (backend: STOP/consent atomicity, manual send via pipeline, consent request, media expiry, UNKNOWN routing)
   - WP-C *Access & config* (clinic-invite takeover, startup config validation, TLS, DB passwords, frontend single-flight refresh + cross-tab)
   - WP-D *Inbox rebuild* = first C14 slice (delivery states, explicit pause/resume, error states, handoff alert) — and the right place for G3, G4, G6
3. **Resume the queue:** P1-10 → P1-12 with WP-A…C folded in, then Phase 2 (C05–C07 + WP-D). Add G1/G2/G5 as a *Meta onboarding* work package in Phase 2 (one Meta Business verification / Tech Provider effort covers coexistence, echoes, ad referral and later Instagram).
4. **QA phase** after WP-A…C: run the scenarios listed in each review §11.
5. **Founder track now:** F01 (design partner — ask about Instagram share, languages, whether they use the phone app, ad spend, quote process), F02 knowledge pack, start Meta Business verification early (it can take weeks).

## Sources

- Dentebot — features & pricing: https://dentebot.com/
- ClinicAI — features & pricing: https://tryclinicai.co.uk/
- Hastam — features & pricing: https://hastam.app/
- EVED — features & pricing: https://www.eved.ai/tr
- Invekto — features: https://invekto.com/features
- Asistan 7/24 — features/integrations: https://asistan7-24.com/en
- MeduAI360 (Projemed) — health-tourism AI: https://projemed.com/saglik-turizmi-yapay-zeka
- HealthStay.io — medical-tourism platform: https://www.healthstay.io/
- DentClosers: https://www.dentclosers.com/ (page not reachable today; from earlier OMNA-9 research)
- WhatsApp coexistence, what syncs, Embedded Signup v2 deprecation 2026-10-15: https://www.instantreply.co/blog/whatsapp-coexistence-what-actually-syncs-2026
- Coexistence availability incl. Türkiye: https://chakrahq.com/article/whatsapp-coexistence-live-eu-uk-europe-whatsapp-business-for-api-live/
- Click-to-WhatsApp ad click ID / referral on inbound messages: https://www.twilio.com/en-us/changelog/new--click-id--callback-parameter-for-inbound-whatsapp-messages-
- Earlier research: `docs/research/OMNA-9_Competitor_Landscape_Brief.md`, `docs/product/PRODUCT_STRATEGY_AND_MVP_PLAN_2026-09-26.md`

_Caveat: a feature missing from a competitor's public page doesn't prove they lack it, and vendor claims (e.g. "80% fewer no-shows") are unverified marketing._
