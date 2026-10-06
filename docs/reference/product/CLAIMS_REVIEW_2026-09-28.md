# S18 claim review — 2026-09-28

Scope inspected: public landing page, invitation-only signup, dashboard lead/conversation/channel screens, lead drawer mock content, `docs/ABOUT_PROJECT.md`, and current privacy/onboarding drafts. Historical QA, strategy, and implementation-plan documents retain quotations of rejected claims for traceability; they are not approved sales copy.

| Current statement or product behavior | Evidence and limit | Status / owner |
| --- | --- | --- |
| Invitation-only pilot; public signup unavailable | `backend-v2/test/first-organization.e2e-spec.ts` tests rejected public signup and operator invitation → acceptance → workspace. | Locally verified; product owner to confirm pilot invitation wording. |
| WhatsApp enquiry ingestion and duplicate protection | `backend-v2/test/inbound-claim.e2e-spec.ts` uses signed synthetic ingress, rapid arrivals, replay, and recovery tests. Live Meta evidence is S17. | Locally verified; staging pending. |
| Staff handoff, pause, and tenant-aware views | `backend-v2/test/inbound-claim.e2e-spec.ts`, `tenant-isolation.e2e-spec.ts`, `authorization-socket.e2e-spec.ts`; S16 single-command run records cumulative status. No staffed response-time promise. | Locally verified; staging pending. |
| Clinic documents can inform answers; uncertain answers can go to staff | `python-ai-service-v2/tests/test_graph_delivery.py` and `test_retrieval_fallbacks.py` exercise empty/error retrieval and handoff. They do not prove every generated answer is correct. | Locally verified; pilot review pending. |
| Media consent, withdrawal, and expiry cleanup | `backend-v2/test/media-consent.e2e-spec.ts` and `src/webhooks/whatsapp-media.service.spec.ts`; clinic-specific legal basis, retention, and transfers remain for product/privacy review. | Locally verified; product/privacy owner approval pending. |
| HubSpot connection available for pilot setup | Adapter and credential code exist; no live sync/rotation proof. The landing page now says staging verification is needed. | S17 staging pending. |
| Pipeline percentage | Backend analytics counts `READY_TO_BOOK` and `WON` leads over all leads. The dashboard calls this pipeline progress; it is not AI-attributed conversion, confirmed appointments, attendance, or revenue. | Locally code-reviewed; product owner to confirm wording. |

Removed or qualified: SOC 2 certification, 24/7 and sub-30-second promises, automatic calendar booking, guaranteed clinical or sales outcomes, fabricated demo pricing/financing/warranty, hallucination prevention, full isolation assurance, and claims that disabled note/attachment controls work. The landing-page sample is marked illustrative. Dead footer links to unapproved privacy/terms/contact pages were removed; published legal pages and contact details still need owner-supplied content.

**Publication approval:** pending product/privacy owner review of patient-data wording, retention, media consent, subprocessors and transfers, clinic-specific notice, and the final rendered page. No approval has been assumed. Until S17 evidence and this approval exist, do not present the pilot as ready for real patient traffic.
