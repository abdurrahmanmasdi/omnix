-- Forward-only guard. Run npm run db:deploy with writers stopped so the explicit
-- encrypted backfill verifies and scrubs legacy sources before this constraint.
-- An unsafe direct migrate deploy fails closed on unrepaired databases.
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_no_legacy_plaintext"
  CHECK ("encryptedPayload" NOT LIKE 'PLAINTEXT_MIGRATE:%');
ALTER TABLE "channels" ADD CONSTRAINT "channels_no_legacy_plaintext"
  CHECK ("accessToken" IS NULL OR "accessToken" = '');
UPDATE "channels" SET "accessToken" = NULL WHERE "accessToken" = '';
CREATE INDEX "outbox_events_status_updatedAt_idx" ON "outbox_events" ("status", "updatedAt");
CREATE INDEX "sessions_expiresAt_idx" ON "sessions" ("expiresAt");
