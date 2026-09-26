# Outbound delivery in the invitation-only pilot

Every AI reply bubble and WhatsApp follow-up bubble has a stable `messages.idempotencyKey` and one `outbound_attempts` row. The attempt is committed before the provider POST. `SENDING` is a claim, not proof of delivery. A successful Meta response and the local message update commit together as `ACCEPTED`/`SENT`. A timeout, missing provider ID, or local commit failure leaves `UNKNOWN` (or a `SENDING` row that becomes `UNKNOWN` after two minutes). The worker never resends an `UNKNOWN` attempt automatically. Signed Meta status webhooks can reconcile by provider ID or `biz_opaque_callback_data`; the latter is correlation data, not provider-side deduplication.

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

For `UNKNOWN`, inspect signed provider status evidence and the Meta dashboard before any manual intervention. Do not reset the row to `PENDING` or re-enqueue the same content merely because no callback arrived: the customer may already have received it. If provider evidence remains unavailable, route the conversation to a human and record the investigation outside the automated sender. Do not infer delivery from `biz_opaque_callback_data` alone.

The migrations are additive and preserve earlier history. Tests use synthetic accounts and a disposable PostgreSQL database. A provider sandbox fault exercise and production status-webhook verification are still required before real patient traffic (S17).
