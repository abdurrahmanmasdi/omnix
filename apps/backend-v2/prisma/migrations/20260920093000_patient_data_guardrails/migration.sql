-- OMNA-15 patient-data guardrails. Apply with Prisma migrate deploy.
ALTER TABLE "organizations" ADD COLUMN "crmSyncEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "conversations" ADD COLUMN "aiDisclosureSent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organization_experiences" ADD COLUMN "consentObtained" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ai_personas" ADD COLUMN "aiDisclosureText" TEXT;

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "actor" TEXT NOT NULL DEFAULT 'system',
  "action" TEXT NOT NULL,
  "targetId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

CREATE TABLE "crm_sync_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "leadId" UUID NOT NULL,
  "externalContactId" TEXT,
  "fieldsHash" TEXT NOT NULL,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_sync_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "crm_sync_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "crm_sync_logs_organizationId_leadId_idx" ON "crm_sync_logs"("organizationId", "leadId");
