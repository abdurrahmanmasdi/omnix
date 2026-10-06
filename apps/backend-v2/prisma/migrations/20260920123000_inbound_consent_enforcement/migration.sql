-- OMNA-21 / OMNA-18 findings 001, 002, 007 and 008:
-- durable, tenant-scoped suppression state for automated messaging.
ALTER TABLE "leads"
  ADD COLUMN "optedOutAt" TIMESTAMP(3),
  ADD COLUMN "optOutReason" TEXT;

CREATE INDEX "leads_organizationId_phoneNumber_idx"
  ON "leads"("organizationId", "phoneNumber");
