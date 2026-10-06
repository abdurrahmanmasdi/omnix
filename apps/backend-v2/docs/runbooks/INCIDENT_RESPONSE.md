# Incident response and recovery

Owner assignment and alert delivery are pending S17 staging verification. Do not assume that a `/metrics` endpoint means it is scraped or paged. Record every incident in the restricted operations log with UTC times, environment, tenant, incident owner, and sanitized event IDs. Never paste credentials, patient messages, media, provider payloads, or full database URLs into tickets.

## First response

1. The on-call owner acknowledges the alert, identifies the affected tenant and first failing component, and records the time. If real patient data or a possible disclosure is involved, stop automation for the affected clinic and follow the agreed clinic incident contact process.
2. Check the backend process, Python worker/gRPC health, Postgres, Redis/BullMQ, provider status, and outbox age. Confirm whether sends are `PENDING`, `ACCEPTED`, `UNKNOWN`, or confirmed failed before taking action.
3. For an ambiguous Meta send, wait for callback reconciliation or perform provider-side review using the restricted evidence store. **Do not blindly resend** an `UNKNOWN` or accepted attempt: it may duplicate a patient message.
4. Record the root cause, affected window, recovery action, and verification result. Notify the clinic owner through the agreed channel when required.

## Queue backlog, stuck outbox, provider failure, worker down

- Queue backlog: verify worker availability and database/Redis health; compare oldest pending age and processing rate. Pause new automation if it cannot catch up safely. Re-enable only after a synthetic message completes end to end.
- Stuck outbox: inspect tenant-scoped event state and the related outbound attempt. Confirm the event is retryable and its provider result is known before moving a failed event back to pending. There is no public replay endpoint; a reviewed operator action must target explicit IDs for one tenant.
- Provider failure: check provider status and credential state. Confirmed rejection may be retried under the existing bounded policy. Ambiguous acceptance requires callback/provider reconciliation.
- Worker down: restore worker health, then verify that leases expire/recover and no accepted outbound message is sent again. Capture queue age before and after.

Alert thresholds, escalation destination, and named owner are not configured or verified here. S17 requires firing each alert in staging and recording receipt in `docs/STAGING_VERIFICATION_2026-09-28.md`.

## Backup and restore exercise

1. Record the staging backup timestamp and restore start. Use a separately named, isolated database and the matching original credential encryption key. Restrict network access and use synthetic contacts only.
2. Restore using the database provider's documented procedure. Inspect migration status before starting the application against the restore. Never run `prisma db push --accept-data-loss` or drop tables as an incident shortcut.
3. Point a separate staging application instance to the restored database. Verify login, one organization membership, one lead, one conversation, one message, and credential decryption without sending any provider traffic.
4. Record backup age as observed RPO and elapsed restore-to-working-login as observed RTO. Keep the restored instance isolated, then retire it under the retention policy.
5. If a schema rollback is necessary, review a forward migration and application compatibility with the engineering owner. Prisma does not provide a safe automatic down migration.

No backup restore, RPO/RTO, or alert receipt has yet been observed. Keep real patient traffic disabled until the staging matrix and operations sign-off are complete.

## Credential incident

Revoke the credential at Meta or HubSpot first. Mark the tenant credential revoked through `CredentialsService`, confirm outbound calls stop, rotate to a new least-privilege credential, and verify only the affected tenant resumes. Preserve the audit trail and follow the clinic incident contact process if exposure is suspected.
