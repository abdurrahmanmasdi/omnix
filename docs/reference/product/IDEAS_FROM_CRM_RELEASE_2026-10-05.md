# Ideas from "crm-release" (Comp AI CRM) — review after Phase 2

_Written 2026-10-05 from `~/Desktop/test/crm-release` (Comp AI CRM, open source, MIT licence: "an agentic-first CRM"). Read: README, AGENTS.md, CONTRIBUTING.md, docs/agent.md, api.md, agent-panel.md, connections.md, tracking.md, telemetry.md, currency.md, crm-plan.md (parts), and the agent skills `evidence.md`, `data-boundaries.md`, `writing-a-brief.md`. Not read: most of the source code._

**When to use this file:** at **P2-15 (Phase 2 acceptance + Phase 3 expansion)**. Go through the table, decide each idea (take / later / no), and turn the "take" ones into Phase 3 cards. A few ideas are marked **⚑ earlier**: they matter during Phase 2 itself — decide those when the named card starts.

**Their stack is not a reason to change ours.** They use Bun, a Turbo monorepo, tRPC and Vercel's "eve" agent framework. Moving would be a rewrite (D-010: rewrites only through the review gate) with no benefit for clinics. Take ideas, not code.

## Summary table

| # | Idea | Area | When | Effort |
| --- | --- | --- | --- | --- |
| 1 | Evidence, not confidence — the AI cites the patient's message for every field it fills | AI | Phase 3 | M |
| 2 | Evidence kinds for patient data (own message > voice transcript > inference) | AI | Phase 3 | S |
| 3 | Every scheduled AI action says why | AI / Inbox | Phase 3 | S |
| 4 | "No dead ends": every AI tool result carries the ids of related records | AI | Phase 3 | S |
| 5 | Patient brief rules: facts only, no adjectives, no guessing | AI | Phase 3 | S |
| 6 | Egress rules: what patient data may leave, and to whom | AI / KVKK | ⚑ earlier: P2-09 (translation) | S |
| 7 | Agent sandbox — not needed now; the rule for when it is | AI | only if we add code/web tools | — |
| 8 | Cheaper model + strict tools | AI cost | Phase 3 | M |
| 9 | "Ask about this patient" box on every lead | AI / UI | Phase 4 | L |
| 10 | Clinic-built automations with a Deploy approval | AI | after MVP | L |
| 11 | Automations that message patients state their own limits next to the switch | UI / safety | ⚑ earlier: any Phase 2 automation | S |
| 12 | Two lanes: non-AI work never waits behind AI generation | Backend | after Phase 2 load | S–M |
| 13 | Work is a row with `dueAt`, not a cron | Backend | rule for new code | S |
| 14 | Failure on the surface: integrations show liveness | UI / ops | ⚑ earlier: P2-04 | S |
| 15 | Optional integrations are capabilities and never crash | Backend | ⚑ earlier: every Stage 2 card | S |
| 16 | Archive first, purge later (with a KVKK erase path) | Data | Phase 3 | M |
| 17 | Money: the amount the patient pays + a frozen converted amount for totals | Data | ⚑ earlier: P2-10 quotes | M |
| 18 | Clinic-defined custom fields (JSONB + registry) | Data | later | M |
| 19 | First-party website form → lead with attribution | Growth | later (after G8) | M |
| 20 | Privacy-safe product telemetry | Ops | later | S |
| 21 | The button and the 403 never disagree | UI / auth | rule for new code | S |
| 22 | Strict issue list at the end of every work report | Process | now (tiny) | S |
| 23 | "Working on X → read Y" table in each app's CLAUDE.md | Process | after Phase 2 | S |
| 24 | Tunable numbers in one config file per area | Code | after Phase 2 | S |
| 25 | Parse untyped data at the boundary (no `Record<string, unknown>`) | Code | after Phase 2 | M |
| 26 | Automatic check for hard-coded (untranslated) UI text | Code / i18n | ⚑ earlier: start of Phase 2 | S |
| 27 | Tests can never reach a real database | Testing / safety | ⚑ earlier: soon | S |
| 28 | A test may not delete a row it did not create | Testing | rule for new tests | S |
| 29 | Local pre-push check | Process | after CI is green | S |

Effort: S ≈ under a session, M ≈ 1–2 sessions, L = a package of its own.

---

## A. The AI

### 1. Evidence, not confidence
**What they do.** The agent never sets a confidence score. A tool reports what it *observed* (for example "their own email signature says Head of Security"), and one central write path (`lib/facts.ts`) decides what that evidence is worth. That path enforces three rules a prompt cannot: never overwrite a value a human entered, never offer again a suggestion a human dismissed, never write a field without a primary source. Strong evidence fills a **blank** field directly. Anything else becomes a suggestion that a person accepts or dismisses. When two sources disagree, the fact is **held**, not averaged.

**Why it matters for us.** Our AI learns things from WhatsApp: treatment interest, number of implants, travel month, country, budget, preferred language. WP-A already limited *which* fields the AI may touch. This idea controls *how* it touches them.

**OmniX example.**
- The patient writes: *"I need 2 implants, I can come in March."* The lead's treatment interest is empty. The AI records `treatmentInterest = "Implants (2)"` and `travelWindow = "March 2027"`, each pointing to that message's id. Both fields are blank, so they are filled, and the lead page shows a small "from patient message, 12 Oct" link.
- A week later: *"Actually maybe veneers instead."* Treatment interest already has a value, so this becomes a **suggestion**: "Treatment interest → Veneers? (patient, 19 Oct) [Accept] [Dismiss]".
- The coordinator had typed "All-on-4" by hand. The AI **never** replaces it; at most it offers a suggestion.
- The coordinator dismisses "Veneers". The AI must not offer "Veneers" again for that lead.

**How to check / implement.** One backend write path for AI-sourced lead fields (`LeadFactService`), a `lead_field_suggestions` table (field, value, sourceMessageId, status), and a rule in the action contract: an AI field update without a `sourceMessageId` is rejected.

### 2. Evidence kinds for patient data
**What they do.** A fixed list of evidence kinds, split into *primary* (enough on its own) and *supporting* (true, but not enough alone), plus `contradiction`. Two observations from the same page count once, never twice.

**OmniX version.**
| Kind | Primary? | Example |
| --- | --- | --- |
| `patient.text-message` | yes | "My budget is around 3,000 euros" |
| `patient.form` | yes | Meta lead form answer (G8) |
| `staff.entry` | yes, and it always wins | Coordinator typed it |
| `patient.voice-transcript` | supporting | A voice note transcribed as "thirteen thousand" may really be "three thousand" → suggestion, never auto-filled |
| `ad.referral` | supporting | Click-to-WhatsApp ad says "Implant campaign" (G5) — tells you the source, not the patient's choice |
| `ai.inference` | supporting | "Probably wants a hotel" because they asked about distances → suggestion only |
| `contradiction` | holds the field | "March" in one message, "after Ramadan" in another |

### 3. Every scheduled AI action says why
**What they do.** When the agent books a follow-up it must give a reason, and the rep sees it. "An agent that cannot say why it will be back in fourteen days does not have a reason, it has a default."

**OmniX example.** Today every AI turn schedules generic 12 h / 24 h follow-ups (QA-1 observation). Instead the Inbox shows: *"AI follow-up Thu 10:00 — reason: patient said 'I'll send the X-rays after work tomorrow'. [Cancel]"*. No follow-up is created without a reason, and staff can cancel it in one click.

### 4. "No dead ends"
**What they do.** Every read tool returns the ids of neighbouring records (contact → company, deals, colleagues). A tool result that names a record without its id is treated as a bug, because the only way to recover is to ask the human.

**OmniX example.** When the Python AI reads the lead summary, the result includes the open consultation id, the latest quote id and its status (P2-03, P2-10). Then the AI can answer "Your quote from 12 Oct is still valid until 12 Nov" instead of asking the patient "Which quote do you mean?".

### 5. Patient brief rules
**What they do.** The "Background" panel is two or three sentences, facts only, from sources. No adjectives about the person ("seasoned", "passionate"). The test: *could the rep repeat this sentence to the person without embarrassment?*

**OmniX example.**
- Good: *"Sarah, UK, asked about 2 implants on 12 Oct and plans to travel in March. She sent a panoramic X-ray (consented). Prefers English."*
- Bad: *"Sarah seems anxious and price-sensitive, probably a wealthy client."* — guesses about the person; never.
- Nothing about health beyond what the patient wrote and the treatment needs, and nothing about religion, politics or ethnicity even if the patient mentions it (KVKK special categories).

### 6. Egress rules ⚑ earlier: decide at P2-09 (staff translation)
**What they do.** The agent may read everything internal. The boundary is **what leaves**: no customer text in a third-party query; message bodies never go into the sandbox; nothing sensitive is logged.

**OmniX version — a written list of where patient text may go:**
| Destination | Allowed? | Condition |
| --- | --- | --- |
| OpenAI (reply generation) | yes | already the case; subprocessor in F03 |
| Translation provider (P2-09) | yes | only if the clinic enabled it; provider listed as a subprocessor (F03); logged per call |
| Any web search / research tool | **no patient text, ever** | derived questions only |
| Logs, error tracking, LangSmith | no message bodies | ids only (KI-058 decision) |
| Product telemetry (#20) | never | — |

### 7. The agent sandbox — not needed now
**What they do.** Their agent has a sandbox: `bash`, `grep`, `glob` and a `/workspace` folder, with **deny-all network egress**. Custom "team agents" run in their own deny-all sandboxes, with permissions declared up front ("empty never means all"). They need it because their agent writes research files and runs commands while it researches people on the web.

**Why we don't need it today.** Our patient AI does not run code, browse, or write files. It is a fixed LangGraph flow with a fixed set of tools, and it can only *propose* actions from a narrow list (action contract v1, narrowed in WP-A). The backend validates every action before anything happens, and the Python service reads the database through a least-privilege role (`omnix_python_runtime`). That design is our sandbox, and it is stricter than a shell sandbox.

**When we would need one — trigger list.** Add a real sandbox (isolated container, deny-all egress except named hosts, no secrets, time and memory limits, nothing persisted) **before** any of these ship:
- the AI fetches web pages (e.g. "build the clinic's knowledge base from its website URL");
- the AI runs code (analysing an uploaded spreadsheet or PDF with scripts);
- clinics build their own automations (#10);
- the AI calls a third-party API chosen at runtime.

**One thing worth checking now (cheap).** Make sure the Python service has no generic "fetch any URL" path (document ingest, image download). If one exists, restrict it to known hosts. Their equivalent is `@crm/db/safe-fetch`, because vendor URLs are an SSRF risk. **Check at P2-15:** grep Python and backend for outbound HTTP calls and list every host.

### 8. Cheaper model + strict tools
**What they do.** They deliberately use a non-frontier model: wrong answers are refused by the tools and the evidence rules, not by model strength.

**OmniX example.** Routine replies ("What are your opening hours?", "How long does an implant take?") use a smaller model; escalation-prone turns (price disputes, medical questions, complaints) use the stronger one. Measure it on the fake-model EN/TR scenario set from QA-1 before switching. It could cut AI cost per clinic noticeably — **measure, don't assume**.

### 9. "Ask about this patient" on every lead
**What they do.** Every record has an Agent tab: a chat about *that* record, with history kept per record.

**OmniX example.** On a lead, the coordinator asks: *"What did she say about dates?"* → *"On 12 Oct she said March; on 19 Oct 'after Ramadan' (contradiction, see #2)."* Each answer links to the messages. Read-only: it answers, it does not change the record. Lessons from their notes: a stopped stream must not lock the box; offline is shown as offline, not "working".

### 10. Clinic-built automations (after MVP)
**What they do.** A user describes an agent in one sentence → a builder drafts it → a review screen shows its triggers, scope, actions and permissions → **only a human "Deploy" makes it live**, and it pins an immutable version. Every action is recorded before it runs. "Stopping a run is a row": cancelling marks the row, so even if the stop signal never arrives, nothing more is written.

**OmniX example.** Clinic owner: *"When a lead has not replied for 3 days, remind the assigned coordinator."* → draft → owner reviews "Trigger: no reply 3 days · Action: staff reminder only · Scope: all leads" → Deploy. Anything that messages patients needs #11, plus our existing eligibility checks (STOP, 24 h window, templates).

### 11. Automations state their own limits ⚑ earlier: any Phase 2 automation
**What they do.** "Anything that messages a customer states its own limits next to the switch."

**OmniX example.** Next to the AI follow-up switch: *"Sends at most 1 follow-up per day. Stops when the patient replies, a staff member takes over, or the patient sends STOP. Only inside WhatsApp's 24-hour window."* Next to lead-form intake (P2-13): *"Sends one approved first-contact template per form submission, never twice."*

---

## B. Backend, data and operations

### 12. Two lanes
**What they do.** Work that needs no AI (logos, photos) runs in a fast lane; AI research runs in another. Before the split, the quick jobs waited 25 minutes behind 60 AI runs.

**OmniX check after Phase 2.** Make sure STOP processing, media download, consent requests, staff alerts and template sends never wait behind AI generation in the same queue. Load test: 30 patients write at once while 1 sends STOP — the STOP takes effect within seconds.

### 13. Work is a row with `dueAt`, not a cron
Anything like "every N minutes, the oldest ten contacts" belongs in a task row's `dueAt`, claimed with a lease (`FOR UPDATE SKIP LOCKED`). We already do this for follow-ups and the outbox. **Rule for Stage 2 code:** a new periodic job must be a row with a lease, not a new cron.

### 14. Failure on the surface ⚑ earlier: P2-04 Meta onboarding
**What they do.** Each connection card leads with liveness: "Last call arrived 31 minutes ago", "1 call needs a look", "3 of 4 matched". "An automation you cannot see rot in is one nobody will own."

**OmniX example — Channels page:** *"WhatsApp +90 555 … — last patient message 12 min ago · last send OK 3 min ago · 0 uncertain sends"* or, in red, *"Credential error since 10:14 — patient messages are still saved (KI-080), replies paused. [Reconnect]"*. The same for Instagram (P2-11) and push alerts (P2-08).

### 15. Optional integrations are capabilities ⚑ earlier: every Stage 2 card
**What they do.** One `capabilities.ts` knows what is configured. It prints the list at startup ("on/off Web research (KEY)"), tells the agent at the start of each session, and a missing key removes one capability and **never throws**.

**OmniX rule.** Required secrets (JWT, DB, RPC, Meta app secret) still stop startup — that is correct and stays. Optional ones (translation key, VAPID push keys, Instagram, object storage, CRM sync) are capabilities:
- Settings → System shows *"Translation: off — no provider configured · Push alerts: on · Instagram: off"*.
- The AI is told *"translation unavailable"* instead of failing on a call.
- An unset key never causes a 500.

### 16. Archive first, purge later
**What they do.** "Delete" sets `archivedAt` (hidden from every list, restorable). "Delete forever" purges; a retention job purges archived rows after N days (default 180).

**OmniX example.** A coordinator deletes a lead by mistake → it is in "Archived" and can be restored for 30 days. A patient asks for erasure under KVKK → "Delete forever" now: messages, media and audit-safe traces removed according to the F03 decision. Check against our current `deletedAt` soft deletes and patient media expiry (KI-026).

### 17. Money ⚑ earlier: decide when P2-10 (doctor review → quote) starts
**What they do.** Two amounts. `amount + currency` is what the customer pays and is never converted in place. `baseAmount` (plus the rate and its date) is the only value any total or chart uses. The rate is **frozen** when the amount is saved; a missing rate is shown as missing, never as zero ("3 deals in CHF are not included").

**OmniX example.** Quotes go out in EUR, GBP, USD and TRY. The clinic's dashboard reports in EUR:
- Quote A: €3,200 → base €3,200.
- Quote B: £2,500 at 1.17 on 14 Oct → base €2,925, and stays €2,925 even if the pound moves.
- Quote C in USD with no rate yet → *"1 quote in USD not included in the total"*, never counted as €0.

Never sum `amount` across currencies — "€3,200 + £2,500 = 5,700" is the bug they hit (`$2.0M` that was really euros plus dollars).

### 18. Clinic-defined custom fields (later)
Values in one JSONB column on the lead, validated on every write against a field registry (type, label, options), with an index for filtering. **OmniX example:** a clinic adds "Preferred implant brand" (select: Straumann / Nobel / Other) and "Needs hotel?" (yes/no) without a migration.

### 19. First-party website form → lead (later, after G8)
Their tracking script lives on the customer's own site; the only purpose is "a form submission becomes a contact", and page views only give that contact a story. **OmniX example:** the clinic's "Get a free quote" form creates a lead with *"came from the Google ad 'implants-uk', viewed the price page 3 times"*. No third-party pixel, first-party cookie only — fits KVKK better than vendor trackers.

### 20. Privacy-safe product telemetry (later)
Server-side only, one anonymous install id, capabilities as **booleans, never values**, no IP address, no names, no message text, one off switch. **OmniX example:** "Clinic X: 1 WhatsApp channel connected, AI on, 42 conversations today" — counts and booleans only. It tells us which features clinics use without holding any patient data.

### 21. The button and the 403 never disagree (rule for new code)
Permissions are computed once on the server, and the same result both hides the button and blocks the request. N3 already did this (`canManageTeam`). **Rule:** every new action button reads a server-computed `can…` flag; never re-derive permissions in the frontend.

---

## C. How we work

### 22. Strict issue list at the end of every report (tiny — can be done now)
Their reports end with an `## Issues` list. Each line starts with **BROKEN** (failing now), **RISK** (fails later), **NOT DONE** (unbuilt) or **UNKNOWN** (not investigated), with one line for the fix and "I caused this" when it applies. If there are none, the list says "None."

**Why for us:** real problems hid inside paragraphs. KI-065, which locked out every invited staff member, sat in a "new findings" paragraph of the WP-C evidence.

**Example ending for a work package:**
```
## Issues
1. RISK — Arabic translations are machine drafts. Wrong wording reaches staff.
   Fix: native review (founder).
2. NOT DONE — Change role / remove member. Owners cannot manage staff yet.
   Fix: N5.
3. UNKNOWN — Hosted CI status on the n-branches. Not checked from this session.
```
**Implement:** add as rule 11 in `docs/plan/work-packages/README.md`.

### 23. "Working on X → read Y" table (after Phase 2)
Their AGENTS.md opens with a table: area → the one doc to read first. Each of our app `CLAUDE.md` files could start the same way, e.g. backend: *webhooks/delivery → `docs/OUTBOUND_DELIVERY.md` · permissions → `docs/AUTHORIZATION_MATRIX.md` · deploy → `docs/DEPLOYMENT.md`*. Sessions then read one short doc instead of exploring.

### 24. Tunable numbers in one config file per area (after Phase 2)
No magic numbers next to their first use; one `as const` object per area, with units derived from one base. **OmniX example:** the numbers we tuned in Stage 1 are spread across files — 7 s outbox debounce, 10 s poll, 2-minute generation lease, 25 s turn deadline (< Nest's 30 s), 10 s refresh grace, 30-day media retention, 7-day failed-job retention, 24 h WhatsApp window. They become `delivery.config.ts`, `auth.config.ts` and so on, so changing a timeout never needs a grep.

### 25. Parse untyped data at the boundary (after Phase 2)
JSON columns, webhook bodies and API responses are parsed into a typed shape **when they enter the process**; no `Record<string, unknown>` passed around. They enforce it with a lint rule ("anti-slop"). **OmniX example:** `Message.metadata` (`role: 'disclosure'`, `pendingHandoff`, `pendingPause`), `Notification.params`, `Lead` JSON fields and Meta webhook payloads each get one schema module; consumers only see the parsed type.

### 26. Automatic check for hard-coded UI text ⚑ earlier: start of Phase 2
Their i18n proposal: an AST check fails CI on hard-coded JSX text and translatable attributes, and a pseudo-locale catches what static analysis cannot. N1 ran the scan **once**; nothing stops a Phase 2 screen from adding English-only text again. **Implement:** one ESLint rule or a small script in the frontend gate, plus the existing message-key parity test. Every new Phase 2 screen then has to be TR/EN/AR from day one.

### 27. Tests can never reach a real database ⚑ earlier: soon
Their test suite runs only against `TEST_DATABASE_URL`, whose database name must end in `_test`, and refuses to start otherwise. They added this after a test run locked a developer out of their own workspace. **Why for us:** we already hit the trap — `apps/backend-v2/.env` is auto-loaded from the working directory (QA-1 trap), and Codex needed a temporary guard script to keep `.env` out of test runs. A test that ever runs with production `DATABASE_URL` could delete clinic data. **Implement:** the test bootstrap refuses any database URL whose name does not end in `_test` or `_disposable`.

### 28. A test may not delete a row it did not create (rule for new tests)
Snapshot-and-restore is not enough; a crashed run leaves the hole. Tests create their own clinic, user and lead, and delete only those.

### 29. Local pre-push check (after CI is green)
A `pre-push` hook runs type-check, lint and tests, so a push that would fail CI fails in seconds on your machine. `--no-verify` remains the escape hatch. We have lint-staged on commit (KI-072); this adds the bigger checks before push. Only worth it once hosted CI is green again.

---

## Not to copy

- **Their stack** (Bun, Turbo monorepo, tRPC, eve, Vercel). A rewrite with no clinic benefit.
- **"Never write code comments."** We keep short comments where they explain *why*.
- **Single-tenant design.** They have no tenancy ("one organization, and it is not a tenancy boundary"). We are multi-tenant by design; never weaken tenant isolation because their code does without it.
- **Researching people on the web** (LinkedIn, enrichment, photos). For patients this would be a KVKK problem; our evidence comes only from what the patient tells the clinic.
- **Their writing style rule (ASD-STE100 for all messages).** The issue-list format (#22) is the useful part.

## Review checklist for P2-15

- [ ] For each row of the summary table: take / later / no, with a one-line reason.
- [ ] ⚑ items: confirm they were decided at their card (P2-04 #14, P2-09 #6, P2-10 #17, Phase 2 start #26, every card #15).
- [ ] Turn every "take" into a Phase 3 card with acceptance criteria and an example like the ones above.
- [ ] Check #7: list every outbound host the Python service and backend call.
