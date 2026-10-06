# OmniX: current pilot scope

OmniX is an invitation-only pilot for dental clinics. It helps clinic staff handle WhatsApp enquiries, keep a lead and conversation record, and take over when a patient needs a person. Public signup and unattended patient traffic are not approved yet.

## Implemented and locally tested

- An operator can invite a user; the user accepts the invitation, logs in, and creates a clinic workspace. Public signup is disabled. See `backend-v2/test/first-organization.e2e-spec.ts`.
- Tenant-aware HTTP and socket access, assignment checks, and signed Meta webhook verification have disposable-database tests. See `backend-v2/test/tenant-isolation.e2e-spec.ts` and `backend-v2/test/authorization-socket.e2e-spec.ts`.
- Inbound messages are recorded with duplicate protection. The local test suite covers rapid messages, retries, ambiguous outbound acceptance, failed actions, and staff handoff. See `backend-v2/test/inbound-claim.e2e-spec.ts`.
- Patient media requires purpose-specific consent before download. Withdrawal clears stored media references, and expired media has a cleanup path. See `backend-v2/test/media-consent.e2e-spec.ts` and `backend-v2/src/webhooks/whatsapp-media.service.spec.ts`.
- The AI uses clinic-provided documents where available. Missing or unverified information must not be presented as a clinic fact; medical uncertainty and human requests go to staff. See `python-ai-service-v2/tests/test_graph_delivery.py`.
- The dashboard supports staff review, lead management, and conversation handling. A HubSpot adapter and credential controls exist, but live synchronization and rotation need S17 staging evidence.

These are local implementation and test results, not a measured service level or production-provider validation. The full pilot acceptance run is tracked in S16 of `docs/IMPLEMENTATION_PLAN_2026-09-26.md`.

## Limits before a real-clinic pilot

- A booking request is not a confirmed appointment. No external calendar slot is reserved automatically; clinic staff must confirm availability and the booking.
- No response-time, conversion, attendance, revenue, or clinical-outcome guarantee has been measured. Automated replies also depend on provider availability, queue health, clinic data, and staffed handoff capacity.
- WhatsApp and HubSpot sandbox behavior, backup restore, and alert delivery require the dated S17 staging matrix. Local fakes do not establish provider reliability.
- The patient privacy notice is a draft. The product and privacy owners must approve clinic-specific retention, consent, processing, and transfer wording before publication or patient traffic. Media consent alone does not settle all patient-data handling decisions.
- Internal notes and the attachment area in the lead drawer are unavailable in the pilot view. Instagram, external calendar synchronization, self-serve billing, and public signup remain future work.

## Pilot approach

Start with a synthetic-contact staging exercise, then an owner-approved, supervised clinic pilot with explicit hours, escalation contacts, and a measured response/restore report. Define prices and any claims about business impact from observed results and the clinic agreement, not from the current mock demo.
