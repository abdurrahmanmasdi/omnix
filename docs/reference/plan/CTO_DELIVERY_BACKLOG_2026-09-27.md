# OmniX delivery backlog: clinic readiness

27 September 2026 • Proposed work • One developer + founder • [Master plan](CTO_CLIENT_READINESS_PLAN_2026-09-27.md) • [AI specification](AI_PATIENT_JOURNEY_SPEC_2026-09-27.md)

**Execution rule:** take one C ticket at a time, preserve existing local work, and attach acceptance evidence before closing it. Existing S-task fixes are inputs to verify, not instructions to rewrite working services. All tickets below start **planned**; reviewed source or a previous passing test is not completion of a new ticket.

Effort is focused developer days including relevant tests, review and documentation. Ranges exclude clinic/provider/counsel waiting and founder tasks. C01–C20 total 44–69 days before the integration allowance in the master plan. P tickets add scope for repeatable paid operation; F tickets run alongside engineering with a different owner.

Each ticket's result must include commit IDs, changed files, demonstrated behavior, exact commands/exit codes, scenario counts, sanitized evidence, limitations, and rollback/disable instructions where relevant. Applied migrations are forward-only. Use synthetic data for development and provider testing.

## Order and ownership

| Work package | Tickets | Primary owner | Outcome |
| --- | --- | --- | --- |
| Establish baseline | C01–C04 | Developer | Reproducible code and secure service boundaries |
| Complete product loop | C05–C07 | Developer + founder review | Owned consultation request, confirmation and outcome |
| Improve AI | C08–C13 | Developer + bilingual/clinical reviewers | Approved knowledge and evaluated conversation journey |
| Prepare clinic operation | C14–C18 | Developer | Usable screens, data controls, outbound policy and reporting |
| Prove launch | C19–C20 | Developer + founder + clinic | Staging recovery evidence and supervised pilot acceptance |
| Validate demand/content | F01–F04 | Founder + clinic/counsel | Partner, signed scope, approved knowledge and trained users |
| Paid continuation | P01–P03, F05 | Developer + founder | Repeatable service within the contracted scope |

Move a dependent task earlier only when its prerequisite contract is settled. For example, C14 can start after C06/C07 for an early demo, while final acceptance also needs C12. Complete C15/C16 before any live patient test. A demo can use simulated providers and synthetic contacts.

## C01 — Freeze and reconcile the actual baseline

**Priority:** before feature work. **Owner:** developer. **Effort:** 1–2 days. **Depends on:** none. **Maps to:** S01–S13 evidence reconciliation, S18 documentation accuracy.

1. Inventory backend/frontend/Python repositories, local modifications, generated files, scratch scripts and duplicate docs. Record the authoritative entry points, commit identifiers, dependency locks and current runtime versions. Preserve ongoing work; do not reset or bulk-delete patch files.
2. Reconcile each S01–S18 item against the latest implementation evidence. In particular, distinguish reported database tests from browser/provider evidence. Record removed legacy tool endpoints and active gRPC listeners.
3. Create one release checklist with states `planned / in progress / locally verified / staging verified / accepted`. Correct misleading product/demo copy, including unsupported certification/guarantee claims, before sharing it. Mark old architecture/model descriptions historical or update their status links.

**Acceptance:** a new engineer can identify current service entry points, reproduce the recorded type checks and Python tests, and see exactly which gates remain unverified. No old S01 compile failure is misreported as current; no S17 provider check is marked complete from mocks. Preserve evidence without treating every earlier “complete” label as global production approval.

## C02 — Version cross-service actions, events and API contracts

**Priority:** G0. **Owner:** developer. **Effort:** 2–3 days. **Depends on:** C01. **Maps to:** S14, PM01–PM03.

1. Define a versioned `AgentTurnResult` with reply intent, proposed fact changes/actions, source IDs, route, and diagnostic metadata. Use discriminated payload schemas and reject extra fields. Keep transport-level JSON strings only if necessary, with runtime schema validation at both ends.
2. Define `ActionReceipt` outcomes (`committed`, `rejected`, `retryable_failure`) with reason and stable action IDs; maintain separate provider delivery state. Include expected conversation version. Derive tenant and subject from trusted context.
3. Align protobuf, Python models, Nest DTOs, public socket events and generated Orval clients. Golden fixtures exercise every supported action/event. Document additive compatibility and how an incompatible worker is drained during deploy.

**Acceptance:** shared fixtures reject malformed payloads, cross-tenant targets, unknown fields/types/versions, invalid dates and forbidden consent/confirmation actions. Contract drift fails CI. Frontend payloads never gain sensitive fields through Prisma object spreading. Code generation is repeatable without manual edits to generated output.

## C03 — Make setup, builds and integration checks reproducible

**Priority:** G0. **Owner:** developer. **Effort:** 3–5 days. **Depends on:** C01/C02. **Maps to:** S15/S16.

1. Pin supported Node/Python/package-manager versions, lock dependencies, provide redacted environment examples, and document startup/ports. Resolve frontend build-time font fetching through bundled fonts or a tested fallback. Validate Compose service addresses and secret injection.
2. Run type checks, builds, read-only lint, backend Jest, frontend Vitest, Python tests and generated-contract checks in CI. Repair stale auth/pilot fixtures against invitation onboarding and signed webhooks; do not weaken assertions to make them green.
3. Provide one disposable-database E2E command with a unique generated database name, guarded destructive operations, migration deployment, seeded synthetic fixtures and cleanup on success/failure/interruption. Wait for queue state instead of arbitrary sleeps.

**Acceptance:** fresh checkouts pass a recorded CI run. Database upgrade/empty install, two-tenant HTTP/socket access, identity switch, rapid/duplicate inbound, pause/STOP, ambiguous outbound, action failure, refresh reuse and media controls are exercised. A deliberate regression fails nonzero and cleanup still runs. No production database or live provider is required for this local gate.

## C04 — Close active service and staff-access gaps

**Priority:** G0, reverified in G2. **Owner:** developer. **Effort:** 2–4 days. **Depends on:** C01–C03. **Maps to:** S03/S06–S09 plus newly inspected Python boundary.

1. Restrict Python gRPC, Redis and Postgres to intended private networks. Authenticate every active agent/document ingestion RPC with service identity or a fail-closed shared credential; use encrypted transport across untrusted network boundaries. Verify deployed firewall rules, not just Compose intent.
2. Restrict runtime database grants; Python CRM reads and approved knowledge ingestion must not imply unrestricted CRM writes. Document application-scoped tenancy while RLS remains inactive, or implement/test RLS separately before claiming it. Test jobs, raw SQL, relations and ingestion with forged tenant/record IDs.
3. Finish individual staff onboarding, secure account recovery, membership revocation, session invalidation and ownership transfer when staff leave. Founder-operated recovery is acceptable if it verifies identity, uses expiring single-use capabilities, revokes sessions, and is audited. Add rate limits/abuse controls and an admin access policy; use platform/identity-provider MFA where available.

**Acceptance:** unauthorized RPCs fail without model/database work; cross-tenant reads/writes fail; revoked users lose HTTP/socket/media access; two staff can join the same clinic without sharing a login or creating a second clinic accidentally. Recovery never requires sending a password or issuing an unaudited permanent bypass. Secrets are absent from logs and client bundles.

## C05 — Add the narrow patient-coordination data model

**Priority:** G1. **Owner:** developer. **Effort:** 3–4 days. **Depends on:** C02/C04. **Maps to:** PM01–PM03/PM05/PM07.

1. Add tenant-scoped Consultation, CoordinatorTask, InternalNote, PatientFact/JourneyState, OutcomeEvent and action/idempotency records, reusing existing lead/conversation IDs. Add minimal ClinicalReview and ApprovedQuote records or versioned external references sufficient to audit who approved what.
2. Consultation stores type, requested windows, actual confirmed start/end in UTC, patient/clinic IANA timezones, owner, status, calendar/reference, cancellation reason and timestamps. Task stores reason/type, priority, owner, due time, waiting party, acknowledgement and completion. Notes store author/time with an edit audit.
3. Enforce valid transitions, tenant-consistent relations, active owners, idempotency and optimistic concurrency. PatientFact stores evidence/version and explicit unknown/declined values. Define retention classifications for each new record.

**Acceptance:** migration works on empty and representative upgraded synthetic databases; existing leads/messages survive. Cross-tenant linking and duplicate requests fail safely. Concurrent updates yield one valid transition or a conflict. Seeded fixtures can express a patient waiting for clinical review while a consultation is already confirmed.

## C06 — Make handoff ownership and notes operational

**Priority:** G1. **Owner:** developer. **Effort:** 2–3 days. **Depends on:** C05. **Maps to:** PM03, S13 extension.

1. Add APIs for claim/assign, acknowledge, reassign, wait, complete and cancel. Check owner membership, permissions, assignment scope and audit each change. Preserve transactional handoff and notification outbox behavior.
2. Connect the notes UI to persistent internal notes. Clearly separate internal notes from messages to patients; remove hardcoded patient activity and guarantee statements. Never send an internal note through the provider adapter.
3. Add overdue/unowned escalation to a named manager and a fallback when the assigned person leaves or is unavailable. Keep the AI paused during human ownership; resumption requires an explicit staff action.

**Acceptance:** two eligible coordinators cannot unknowingly own the same task; unauthorized users cannot claim/read it; reassignment survives reload and notifies the correct person. An unacknowledged handoff becomes visible and escalates at its configured deadline. Staff absence does not create a false “someone is joining” message. Note content never appears in patient delivery.

## C07 — Implement consultation requests, confirmation and outcomes

**Priority:** G1; first end-to-end product slice. **Owner:** developer. **Effort:** 3–4 days. **Depends on:** C05/C06. **Maps to:** PM01/PM02.

1. Expose staff APIs and validated AI request actions for consultation, reschedule and cancellation requests. Define minimum fields: existing contact, request type, time preference/timezone when relevant. Name and media are not prerequisites to asking for help.
2. Staff checks the existing calendar and confirms a specific slot, duration and reference. Resolve date/time ambiguity; use IANA timezones and test DST. Prevent duplicate confirmation and same-resource conflicts known to OmniX. Require staff attestation of external availability; do not claim a lock on an unintegrated calendar.
3. Store changes/cancellation history and attended/no-show outcomes. Commit confirmation and outbound notification intent atomically; keep confirmed state distinguishable from delivery failure. Keep the original slot pending an approved reschedule.

**Acceptance:** a photo-free patient reaches a persistent request and owned task. Replaying a request creates one record. Only authorized staff confirm; patient messages use the correct dates/timezones and actual status. Conflicting updates, ambiguous time, cancellation, rescheduling and failed confirmation delivery have visible recoverable outcomes.

## C08 — Establish approved clinic knowledge and price facts

**Priority:** G1/G2. **Owner:** developer; founder/content approver supplies content. **Effort:** 2–3 days. **Depends on:** C05 and F02 draft. **Maps to:** PM05.

1. Add draft/approved/retired versions with source, author, approver, approval/effective/expiry dates, language and clinic. Structured facts cover services, prices/currencies, ranges versus individual quotes, inclusions, exclusions, hours, location, languages, response hours and scheduling rules.
2. Ingestion validates file size/type, tenant ownership and document-processing result; uploaded content stays draft until approved. Founder can use an operator workflow initially. Clinical content requires the designated clinician approver.
3. Provide retirement/correction and a readable knowledge preview. Remove automatic social-proof/competitor content from the initial AI path. Any later testimonial use requires its own release and clinic/legal approval.

**Acceptance:** draft/retired/expired facts never reach patient generation. An approver can preview the exact English/Turkish price/package facts. Correcting a price produces a new auditable version; missing approval blocks publication. A second clinic cannot retrieve the first clinic's content.

## C09 — Improve retrieval and factual answerability

**Priority:** G1/G2. **Owner:** developer. **Effort:** 2–3 days. **Depends on:** C08. **Maps to:** PM05, S12 extension.

1. Replace bare chunk text with structured results: document/version/fact IDs, approved excerpts, language, validity and relevance. Apply tenant/approval filters before ranking. Add lexical matching where service names or exact terms need it; retain pgvector.
2. Calibrate relevance/answerability on labeled clinic questions. Detect missing, weak, conflicting and stale information. Read prices from structured facts; never assume the nearest four chunks answer the question.
3. Bound retrieval context; cache with tenant/version/language keys and invalidate on retirement. Treat document text as untrusted data; defend against embedded instructions and cross-clinic references.

**Acceptance:** known questions retrieve approved support in both languages; unknown/conflicting price questions abstain or ask staff. Retired knowledge disappears from retrieval/cache. Every material answer fact can be traced to a current source. Retrieval quality is reported per language with explicit failure examples.

## C10 — Implement structured classification and persistent memory

**Priority:** G1/G2. **Owner:** developer. **Effort:** 2–4 days. **Depends on:** C02/C05/C09. **Maps to:** PM01.

1. Implement the dimensions and schema in the AI specification: multi-intent, relationship, language, risk, concern, readiness, fact corrections, declines and ambiguity. Ground extracted fields in authorized message IDs.
2. Replace status-derived medical evidence and per-turn resets with structured facts. Include delivered staff messages in history; keep internal notes protected. Make summaries source-linked, versioned and non-authoritative.
3. Implement context budget, last-question memory, correction semantics and restart/resumption. Do not infer gender, nationality-based priority, clinical eligibility, or consent. Remove numeric lead scoring based on photos, positivity or anger.

**Acceptance:** corrections survive reload/restart; a declined photo is not re-requested; a returning patient is not re-qualified from scratch; a staff-confirmed detail is not overwritten by an inference. Multi-intent examples retain all facts. Malformed/refused classifier output yields a safe visible fallback. Cross-tenant summary/context injection fails.

## C11 — Replace the rigid sales router and writer prompts

**Priority:** G1/G2. **Owner:** developer. **Effort:** 2–3 days. **Depends on:** C09/C10, F02 safety wording. **Maps to:** PM01/PM05.

1. Implement policy precedence from the AI specification. Remove mandatory name/photo qualification before pricing or consultation. Separate routine questions, existing-patient support, personalized clinical questions and urgent signals.
2. Fix multilingual human-request/control detection and generic-help false positives. Add negation/context tests without allowing actual unsupported guarantees. Preserve deterministic send/control constraints; improve semantic classification rather than relying solely on English regex.
3. Replace mandatory objection rebuttals/social proof with grounded answers, one useful next question, respect for declines and honest uncertainty. Merge AI disclosure into the first useful response; localize fallbacks and takeover/resume wording. All routes, including off-topic, receive final validation.

**Acceptance:** “help me book” reaches consultation; explicit English/Turkish human requests hand off; clinical cases never enter a sales sequence; photo refusal does not block progress. No repeated introduction, fabricated proof, forced closing question, or implied human identity. Known unsafe outputs remain blocked after reducing false positives.

## C12 — Connect truthful actions and conversation control

**Priority:** G1/G2. **Owner:** developer. **Effort:** 2–3 days. **Depends on:** C02/C06/C07/C11. **Maps to:** PM01–PM03, S04/S05/S13 regression.

1. Bind only supported profile, consultation, task and handoff actions. Validate proposals in Nest with current tenant, permissions, conversation version and state. Persist fact updates and business changes through the authoritative service.
2. Use action receipts to produce localized request/confirmation/handoff acknowledgments. Stop the writer from asserting side effects independently. Acknowledgments distinguish requested, committed, accepted by provider, delivered and unknown.
3. Cancel stale drafts when a patient message, opt-out or takeover arrives. Enforce control again before each outbound bubble. Bound repairs/retries; preserve action IDs and never replay committed effects merely to regenerate prose.

**Acceptance:** failure to create a consultation cannot produce “request recorded”; failure to notify cannot produce “team alerted.” Two workers, a restart, partial send, stale generation and human takeover yield one valid action or a visible recoverable error. Resuming AI includes staff history and announces the change appropriately.

## C13 — Build bilingual evaluations and select models

**Priority:** G2; initial fixtures before C10/C11. **Owner:** developer + founder/bilingual reviewer. **Effort:** 3–4 developer days. **Depends on:** C09–C12 and F02 reviewers. **Maps to:** new AI quality gate, S12/S17.

1. Build the 240-scenario dataset, runner and reports defined in the AI specification. Hold out release cases; label expected actions/facts and forbidden outputs. Separate deterministic policy/action tests from actual model trials.
2. Compare the present factory with GPT-6 Luna classification/routine writing and GPT-5.6 Terra writer variants. Test account access, SDK/API parameters, output/refusal handling, token limits and rate-limit behavior. Keep unchanged prompts where possible to isolate model effects; then compare optimized configurations separately.
3. Measure per-language routing/grounding/journey quality, total latency, repair rate, cost and reviewer agreement. Record prompt/model/knowledge versions. Keep a safe fallback and model/config rollback switch.

**Acceptance:** all AI-spec release thresholds pass with dated output and reviewer sign-off. No model wins solely on a benchmark claim or lower token rate. Actual API tests use approved synthetic inputs and bounded spend. If no candidate passes, remain draft-only and fix the failed scenarios before autonomy.

## C14 — Deliver Today and the working coordinator inbox

**Priority:** G1/G2. **Owner:** developer + founder usability review. **Effort:** 3–4 days. **Depends on:** C06/C07; final acceptance C12. **Maps to:** PM03/PM08.

1. Today shows due/unowned/overdue tasks, consultation requests, waiting clinical reviews and delivery problems, with owner, due time, reason and next action. Filters prioritize work, not arbitrary hot/cold scores.
2. Inbox provides original transcript, editable evidence-linked summary, language/timezone, clear AI/draft/human state, take over/resume, assign, notes, consultation controls and visible send failures. Patient detail shows verified facts, open tasks and outcome history.
3. Localize the critical workflow into Turkish with English available. Test keyboard use, contrast, loading/empty/error states and mobile web. Move developer tokens/configuration out of everyday staff actions; keep invitation setup founder-managed.

**Acceptance:** a coordinator on desktop and mobile can acknowledge a handoff, add a note, confirm a consultation and record attendance without a developer. Sessions switched between clinics never display old patient data, including delayed API/socket results. No sample activity or dead save buttons remain in the launch path.

## C15 — Complete patient-data lifecycle and media boundaries

**Priority:** G2. **Owner:** developer; founder/counsel specifies policy. **Effort:** 2–4 days. **Depends on:** C04/C05 and F03 approved data plan. **Maps to:** S10/S11/PM06.

1. Implement the approved retention schedule across messages, media, summaries, embeddings, caches, queues, audit records, exports and backups. Add controlled access/export/correction/deletion workflows and a deletion tombstone process that survives restores, with documented legal-retention exceptions.
2. Replace generic English-only media consent with a versioned, localized, purpose-specific request tied to a pending request/response. Distinguish media processing, optional marketing and AI control. Disable autonomous dental-image analysis at configuration and execution boundaries. Patient refusal still permits nonmedia consultation requests.
3. Gate media retrieval/staff access/reuse on current authorization and expiry. Use protected object storage/signed short-lived access if media is enabled; validate content/size and audit access. Verify redaction in provider SDK, queue, proxy and production logging/tracing paths, not just unit mocks.

**Acceptance:** grant/decline/withdraw/expire scenarios work in both languages and cannot be initiated by AI. Deleted content cannot reappear through summaries, vector search, exports or a backup restore. A patient can complete the text journey without media. The published notice matches actual retention/processing behavior and F03 decisions.

## C16 — Enforce WhatsApp delivery policy for every sender

**Priority:** G2. **Owner:** developer + founder/provider setup. **Effort:** 2–4 days. **Depends on:** C04/C12, F03 messaging policy. **Maps to:** PM04/S05/S17.

1. Implement one shared eligibility service for AI, staff, consent notices, confirmation and follow-up sends. Base the service window on the last patient message; check opt-out, pause, current state, purpose, recipient, template status/language and quiet hours as applicable.
2. Add approved-template registry and sending support for the minimal contracted notifications. Never let AI invent template names/variables or reclassify promotional content as utility. Missing/rejected/paused template means no automated send and a visible task, not free-text fallback.
3. Reuse durable outbound attempts and callback reconciliation. Unknown acceptance requires reconciliation, not blind resend. Display failed/ineligible sends and permitted next action to staff.

**Acceptance:** test at 23h59m, 24h and beyond with controlled timestamps; queue delay crossing the boundary; patient reply resetting the window; opt-out before dispatch; staff API send outside the window; template rejection/withdrawal; partial sends; and duplicate callbacks. No path bypasses the policy by sending directly through the adapter. Validate actual provider behavior in C19.

## C17 — Replace fixed nudges with stage-aware next actions

**Priority:** G2. **Owner:** developer. **Effort:** 1–2 days. **Depends on:** C06/C07/C16. **Maps to:** PM03/PM04.

1. Disable blanket 12h/24h scheduling from AI replies. Use stage events: unanswered patient question, consultation awaiting staff, clinical review pending, patient-requested callback, confirmed consultation reminder, or no-show.
2. Default to owned staff tasks. Configure due times and escalation for each event, waiting party, clinic working hours and patient timezone. Cancel/supersede stale tasks when the patient replies, staff takes over, booking changes, opt-out occurs or the case closes.
3. Where an approved automated notification is in scope, send only through C16 with a maximum frequency and no repeated pursuit after a decline. Missing timezone prompts clarification or falls back to staff rather than guessing quiet hours.

**Acceptance:** waiting for a clinician reminds staff, not the patient to send another photo. Repeated job execution does not duplicate tasks/messages. Consultation changes cancel the old reminder. Every due task has an accountable owner and visible overdue state.

## C18 — Record honest funnel outcomes and usage

**Priority:** G2. **Owner:** developer + founder reporting. **Effort:** 2–3 days. **Depends on:** C05/C07/C12. **Maps to:** PM07.

1. Emit dated events for eligible inquiry, useful AI response, consultation requested/confirmed/attended/no-show, approved quote, won/lost and unknown outcome. Record staff actor/source and correction history. Separate existing-patient support and test traffic.
2. Implement tenant usage ledger: distinct assisted contact per billing period, accepted reply turn regardless of bubbles, and separate internal attempts/model tokens/embeddings/repairs. Reconcile callbacks without double-counting. Document allowance timezone, period boundary and ambiguous-delivery treatment.
3. Provide a simple Results view or access-controlled weekly export with denominators/cohort dates and drill-through IDs. Replace the current READY_TO_BOOK + WON conversion label. Add per-tenant cost/usage alerts; limits pause automation visibly without losing inbox access.

**Acceptance:** report totals reconcile to synthetic underlying records, including repeats, cancellations, late attendance and unknown outcomes. Retries do not consume customer allowance, but their provider cost remains visible internally. “Requested” is never reported as attendance or revenue. Exports respect permissions and data minimization.

## C19 — Prove staging deployment, providers and recovery

**Priority:** G2. **Owner:** developer; founder supplies approved accounts. **Effort:** 3–4 days. **Depends on:** C03/C04/C15–C18 and provider access. **Maps to:** S17.

1. Deploy isolated staging with production-shaped TLS, private services, secret management, persistent storage, backups, readiness checks, worker shutdown/drain, resource limits and migration procedure. Keep development defaults out of production. Verify outbound email only if the chosen recovery path uses it.
2. With synthetic contacts on the intended Meta setup, verify inbound signatures, number/channel ownership, text, consent/media if enabled, template eligibility, send/delivery/failure callbacks, duplicate events, rotation/revocation and rate limits. Verify actual number migration/coexistence before promising retention of the clinic's current arrangement.
3. Exercise worker crash, AI timeout/429, Redis interruption, queue backlog, stale lease, outbox delay, provider unknown acceptance, database interruption and corrupt/expired credentials. Test restore into an isolated environment, deleted-data tombstones, and configuration rollback. Trigger alerts and prove the responsible human receives them.

**Acceptance:** dated staging matrix with sanitized evidence and named owners; measured response/queue SLOs, RPO/RTO, restore/login/record checks and runbooks. Load test at least three times the discovered expected peak, including a noisy tenant. No unsupported integration is required: HubSpot is verified here only if included in the signed scope; otherwise it stays disabled and is removed from launch claims. No provider access means G2 remains pending.

## C20 — Run full clinic acceptance and activate controlled traffic

**Priority:** G2 final gate. **Owner:** developer + founder + clinic owner. **Effort:** 2–3 days. **Depends on:** C01–C19, F01–F04.

1. Run a release-candidate browser/provider acceptance script: invitation → staff login → approved clinic knowledge → patient question → consultation without photo → owned handoff → confirmation → reminder/task → attendance → report. Also run unknown answer, Turkish takeover, clinical escalation, opt-out, deletion, duplicate inbound and failed send paths.
2. Confirm staff response hours, fallback contacts, access roles, number ownership, support terms, consent/privacy links, retention, usage limits and emergency/clinical wording. Founder and clinic sign the exact enabled feature/language matrix and list every deferred feature.
3. Begin a bounded live pilot in draft mode after all live-data prerequisites pass. Enable evaluated FAQ/intake automation gradually; review daily exceptions and a sample of normal conversations. Keep immediate clinic-wide and route-specific automation switches and a rollback procedure.

**Acceptance:** every launch-critical scenario passes on the release candidate; no unresolved critical/high-severity access, safety, false-action or data-loss issue; clinic staff perform the main tasks without developer intervention. A named owner signs G2 with evidence. Do not equate source review, local tests or a successful demo with this acceptance.

## P01 — Finish knowledge, clinical-review and quote administration

**Priority:** before repeating the paid service at several clinics; manual founder workflow may cover the first signed scope. **Owner:** developer. **Effort:** 2–3 days. **Depends on:** C08/C14/C20 pilot feedback.

Deliver a simple draft/approve/retire knowledge UI, clinical review queue and approved quote view using existing C05/C08 records. Quotes include amount/currency, scope, exclusions, approver, version and validity; no autonomous discounts or treatment selection. Preserve an external quote reference when the clinic's system remains authoritative.

**Acceptance:** clinic approver can publish/revoke content and inspect history; coordinators can request review and relay only the approved patient-specific version. AI cannot approve its own knowledge or quote. If deferred for a paying clinic, name the founder approval process, turnaround and boundaries in its operating agreement.

## P02 — Expand follow-up only from measured clinic need

**Priority:** before selling automated multiday follow-up. **Owner:** developer. **Effort:** 2–4 days. **Depends on:** C16/C17/C20 and clinic-approved cadence.

Implement only the first proven reminder/callback/no-show scenarios with approved templates in both languages. Add scheduling preview, cancellation/rescheduling propagation, frequency caps, consent/opt-out checks, template-health monitoring and pause controls. Staff review promotional wording and provider classification. Preserve staff tasks when automation is unavailable.

**Acceptance:** live provider tests demonstrate permitted delivery, revoked-template behavior and no duplicate/obsolete messages. Report patient opt-outs, failures and task outcomes. Do not sell autonomous follow-up if this ticket is deferred; include staff-managed follow-through instead.

## P03 — Package a repeatable paid account

**Priority:** G3. **Owner:** developer + founder. **Effort:** 1–2 developer days. **Depends on:** C18/C20/F05.

Add operator-managed plan/allowance/start/end metadata, approved usage blocks, invoices/payment references and renewal/cancellation state. Provide onboarding and offboarding checklists, export/deletion request handling, incident/support contact and clear feature limits. Keep manual invoicing. Correct website/demo claims against a claim-to-evidence register; publish only after founder review.

**Acceptance:** founder can provision, operate, invoice and close a clinic account from documented steps without arbitrary database edits. Reaching a limit preserves incoming messages/staff access and generates a visible action. Price, included usage, Meta fees, human support hours, data return and termination terms match the signed offer.

## Founder tasks: start now

### F01 — Find and qualify the design partner

**Owner:** founder. **Starts:** immediately. **Dependency for:** C19/C20 production-shaped configuration.

Research suitable clinics and conduct ten workflow interviews. Capture inquiry volume/languages, current calendar/CRM, staff schedule, response/ownership failures, WhatsApp ownership and buying authority. Obtain one design-partner commitment with a named coordinator, clinician approver and agreed post-pilot price. Use synthetic demos; do not pretend to be a patient to collect sales evidence. The PM's 50-clinic list is an activity target, not a forecast.

**Done:** signed bounded scope, desired outcomes, provider setup owner, two confirmed launch languages, and a clinic willing to review real workflows under agreed data arrangements. If no partner emerges, reassess the offer before adding integrations or specialties.

### F02 — Supply the knowledge pack and reviewers

**Owner:** founder + clinic approver. **Starts:** with F01; synthetic pack before a clinic signs. **Dependency for:** C08/C11/C13.

Collect approved services, price ranges/currencies, inclusions/exclusions, quote policy, consultation types, clinician credentials permitted for publication, location/travel FAQs, hours, contacts and clinical escalation wording. Each fact has an owner/date; unresolved questions remain explicitly unresolved. Recruit bilingual reviewers and the clinician for safety cases. Draft knowledge is not approved merely because it came from a website or PDF.

**Done:** a versioned English/Turkish pack and labeled examples accepted by accountable reviewers. No treatment advice, outdated price or testimonial without the appropriate approval is included.

### F03 — Finish data, provider and customer agreements

**Owner:** founder + qualified counsel + clinic decision-maker. **Starts:** during baseline work. **Dependency for:** C15/C16/C20.

Map controllers/processors, health-related text/media, actual providers/locations, transfer mechanisms, retention/backups, subprocessor contracts, subject requests and incident responsibilities. Assess applicable Turkish health-advertising rules and any foreign-patient obligations relevant to the offer. Complete clinic-specific privacy notices and processing agreement; separate communications permission from media consent and service access. Approve the intended WhatsApp workflow against current Meta terms. Specify support hours, scope, fees, exit and liability terms with counsel.

**Done:** documented decisions for the actual deployment and approved notice/contract text, not a generic “KVKK compliant” claim. Required provider agreements/access and clinic instructions are in place before patient data is processed.

### F04 — Train and rehearse clinic operation

**Owner:** founder + clinic manager. **Starts:** synthetic demo available. **Dependency for:** C20.

Train each individual user to acknowledge/reassign tasks, take over/resume AI, confirm consultations, mark outcomes, handle clinical escalation, correct knowledge and recognize delivery failures. Agree staffed response deadlines, backup staff, after-hours wording and support escalation. Rehearse a missed handoff, provider outage and patient deletion request.

**Done:** staff complete the main scenario without the developer; every queue has a primary/backup owner; the clinic understands automation hours versus human staffing and can disable AI immediately.

### F05 — Run the pilot, measure value and decide continuation

**Owner:** founder + clinic manager. **Starts:** G2. **Dependency for:** G3/P03.

Run 14 live days starting after activation, within the agreed contact/turn caps. Review exceptions daily, hold weekly feedback sessions, and record staff effort and direct delivery cost. Reconcile consultation outcomes to actual records; aim for at least 30 eligible inquiries before interpreting the funnel. Continue tracking delayed outcomes for the agreed 30–60-day observation period without implying free service throughout.

**Done:** a dated pilot report with sample size, failures, unresolved outcomes, costs, staff use, buyer decision and continuation price. Seek paid continuation and renewal. An underpowered sample is inconclusive; repeated safety or operational failures require restricted automation and remediation, not a larger rollout. Expand to two further clinics only after the first is stable.

## Traceability to previous plans

| Previous requirement | Where it is handled now |
| --- | --- |
| S01–S03 compilation, migration, onboarding | C01/C03/C04 verify and extend; preserve existing fixes |
| S04/S05/S13 durable processing and truthful actions | C02/C12/C16/C19; regression evidence required |
| S06–S09 tenant/access/session | C03/C04/C14/C19; active Python boundary explicitly rechecked |
| S10/S11 consent, retention, logging | C15/C19/F03 |
| S12 graph/tool safety | C08–C13 and AI specification |
| S14 contracts | C02 |
| S15/S16 reproducible checks | C03 plus final feature acceptance C20 |
| S17 live providers and recovery | C19/C20; CRM conditional on signed scope |
| S18 honest claims | C01/F03/P03 and release review |
| PM01/PM02 consultation journey | C05/C07/C10–C13 |
| PM03 ownership/notes | C06/C14/C17 |
| PM04 follow-up | C16/C17/P02 |
| PM05 knowledge/handoff | C08/C09/C11/C12/P01/F02 |
| PM06 onboarding/data | C04/C15/C19/C20/F03/F04 |
| PM07 metrics | C18/F05 |
| PM08 Turkish/mobile staff experience | C14/F02/F04 |
| PM09 CRM handoff | Explicit manual handoff initially; separate estimated connector ticket only after signed demand |

## Deliberately deferred scope

Public signup, self-service subscription billing, autonomous calendar scheduling, native mobile apps, Instagram rollout, live voice agent, autonomous image assessment, hotel/flight booking, dental charting, clinical decision support, full CRM migration, universal agent builder, fine-tuning and multi-provider failover are not in these estimates. Each needs a customer-backed case, a bounded specification, an estimate and relevant safety/operating evidence before entering the backlog.

Any essential newly discovered clinic integration changes the scope and schedule. Do not hide it inside an existing two-day ticket. The weekly planning decision is which accepted customer outcome comes next and what evidence will prove it works.
