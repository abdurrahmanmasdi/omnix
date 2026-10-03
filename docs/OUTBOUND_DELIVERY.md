# Outbound delivery in the invitation-only pilot

Every patient-facing WhatsApp send — AI reply bubbles, follow-up bubbles, staff manual replies (`purpose = staff`, key `staff-<messageId>`) and the media-consent request (`purpose = consent-request`) — has a stable `messages.idempotencyKey` and one `outbound_attempts` row. The attempt is committed before the provider POST. `SENDING` is a claim, not proof of delivery. A successful Meta response and the local message update commit together as `ACCEPTED`/`SENT`. A timeout, missing provider ID, or local commit failure leaves `UNKNOWN` (or a `SENDING` row that becomes `UNKNOWN` after two minutes). The worker never resends an `UNKNOWN` attempt automatically. Signed Meta status webhooks can reconcile by provider ID or `biz_opaque_callback_data`; the latter is correlation data, not provider-side deduplication.

All sends share one eligibility check (clinic active, channel + credential, recipient, 24 h window) plus purpose-specific rules:

| Purpose           | Blocked by opt-out (STOP)                                         | Blocked by AI pause                                                      | Blocked by staff assignment / newer version |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------- |
| `reply` (AI)      | yes                                                               | yes                                                                      | yes                                         |
| `follow-up`       | yes                                                               | yes                                                                      | yes                                         |
| `consent-request` | yes                                                               | yes                                                                      | no                                          |
| `staff`           | **no** — sent, response carries `warnings: ['PATIENT_OPTED_OUT']` | no (the send pauses the AI and bumps the version itself, before sending) | no                                          |

A STOP stops automation, never people (D-021): a staff send to an opted-out patient is not rejected for the opt-out; it is delivered (subject to the 24 h window), returns a warning, and its `conversation.staff_message_sent` audit row records `patientOptedOut: true`. When a STOP newly opts a patient out, eligible staff get one "Patient sent STOP" alert (in the inbound transaction, so replays do not repeat it). A staff send that is not eligible for other reasons is rejected with 422 and a reason code (`OUTSIDE_24H_WINDOW`, `CHANNEL_UNAVAILABLE`, `NO_CONTACT`, `CLINIC_INACTIVE`).

A failure before the provider POST (credential missing, revoked or unreadable) is `FAILED` with `LOCAL_CREDENTIAL_*`: Meta was never contacted, so it is not `UNKNOWN` and is not retried.

When an attempt becomes `UNKNOWN` it is routed to people once (`escalatedAt`): the AI is paused and the conversation version bumped, eligible staff get a "Delivery uncertain — check WhatsApp before replying" alert through the outbox, and an `outbound.delivery_unknown` audit row is written. A per-minute sweep covers `SENDING`→`UNKNOWN` and crashes before routing. A later provider callback can still mark the attempt `ACCEPTED`; it does not resume the AI.

Confirmed HTTP 429 or provider `failed` status is retried at most three attempts, with authorization checked again. Other explicit 4xx rejections remain `FAILED` for operator review. The worker checks conversation version, pause, opt-out, assignment, organization and channel before each send. Pending follow-ups are canceled in the inbound message transaction, and a recovery cron re-enqueues due records when Redis scheduling fails or a worker stops. A leased follow-up processor prevents competing jobs from generating/sending concurrently.

Meta's [official WhatsApp Business Platform status reference](https://www.postman.com/meta/whatsapp-business-platform/folder/fuaee8l/statuses-object) says free-form messages require a rolling customer-service window and business-initiated sends after 24 hours require a template. This pilot has no configured/approved follow-up template, so the service cancels a free-form send once the last customer message is outside that window. The same guard applies to delayed replies.

Operators can inspect unresolved attempts without exposing patient content:

```sql
SELECT a.id, a."organizationId", a."conversationId", a."messageId",
       a.status, a."providerId", a."lastErrorCode", a."attemptCount",
       a."startedAt", a."updatedAt"
FROM outbound_attempts a
WHERE a.status IN ('UNKNOWN', 'FAILED')
ORDER BY a."updatedAt" DESC;
```

For `UNKNOWN`, inspect signed provider status evidence and the Meta dashboard before any manual intervention. Do not reset the row to `PENDING` or re-enqueue the same content merely because no callback arrived: the customer may already have received it. The conversation has already been paused and staff alerted automatically; if provider evidence remains unavailable, a person decides whether to write to the patient again and records the investigation outside the automated sender. Do not infer delivery from `biz_opaque_callback_data` alone.

The migrations are additive and preserve earlier history. Tests use synthetic accounts and a disposable PostgreSQL database. A provider sandbox fault exercise and production status-webhook verification are still required before real patient traffic (S17).
