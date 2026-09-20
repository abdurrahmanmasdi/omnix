# Incident Response & Operations Runbook

This document outlines the standard operating procedures for handling production incidents, performing database rollbacks, and managing day-to-day operations for the OmniDesk backend.

## 1. Observability & Alerting

The system is configured with `nestjs-pino` for structured logging and `@willsoto/nestjs-prometheus` for metrics.

* **Metrics Endpoint:** `GET /metrics` exposes Prometheus metrics.
* **Logs:** Logs are emitted in JSON format in production. Local development uses `pino-pretty` for readability.

## 2. Database Restore & Rollback

### Point-in-Time Recovery (PITR)
If data corruption occurs (e.g., accidental mass deletion), use your database provider's (e.g., AWS RDS, Supabase) Point-in-Time Recovery feature to restore the database to a state exactly before the incident.

### Reverting Migrations
If a deployment introduces a bad schema change:
1. Stop the application servers to prevent further writes.
2. If the migration was additive (e.g., new tables), it may be safe to roll back the application version without reverting the database.
3. To manually revert a migration, run the down-migration script or manually execute `DROP TABLE` / `ALTER TABLE` commands. Prisma does not have a native `migrate down` command, so schema changes must be pushed forward (e.g., create a new migration that reverts the changes).

### Resolving Duplicate Constraints
If a unique constraint (like `organizationId_phoneNumber` on leads) fails due to duplicate data during a migration:
1. Run `npx ts-node cleanup_duplicates.ts` to identify and remove soft-deleted or duplicate rows.
2. Re-apply the schema with `npx prisma db push --accept-data-loss` (or `migrate dev`).

## 3. Webhook Failures & Outbox Replay

The system uses a Transactional Outbox pattern to ensure message delivery. If an external provider (e.g., Meta) is down, messages will fail to send and be marked as `FAILED` in the `outbox_events` table.

### How to Replay Failed Events
If you notice `FAILED` events in the database, you can replay them once the external service is restored:
1. Connect to the server or database.
2. Run the following Prisma query or use an admin endpoint (to be implemented) that calls `OutboxReplayService.replayFailedEvents()`.
3. The background cron job (`OutboxProcessor`) will automatically pick up the events and attempt to relay them again.

## 4. Credential Leaks & Rotation

If a tenant's Meta or HubSpot credentials are leaked:
1. Immediately revoke the credential in the external provider's dashboard.
2. Use the `CredentialsService.revoke(organizationId, credentialId)` method to mark it as `REVOKED` in the database. This instantly stops all outbound API calls using that credential.
3. Instruct the tenant to re-authenticate and provide a new set of credentials.
4. (Optional) Use `CredentialsService.operatorRecovery` to force rotate or clear error states if the provider was temporarily unreachable.
