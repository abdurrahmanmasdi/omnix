-- CreateEnum
CREATE TYPE "FollowUpType" AS ENUM ('AUTO_NO_REPLY', 'AI_SCHEDULED');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- AlterEnum
ALTER TYPE "ChannelProvider" ADD VALUE 'INSTAGRAM_GRAPH_API';

-- AlterEnum
ALTER TYPE "CredentialProvider" ADD VALUE 'ZOHO';

-- DropIndex (non-unique version, will be recreated as unique below)
DROP INDEX IF EXISTS "leads_organizationId_phoneNumber_idx";

-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "channels" ALTER COLUMN "accessToken" DROP NOT NULL;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "channelId" UUID,
ADD COLUMN     "stateVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "crm_sync_logs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "mediaConsentGranted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mediaConsentGrantedAt" TIMESTAMP(3),
ADD COLUMN     "mediaConsentSource" TEXT,
ADD COLUMN     "mediaConsentWithdrawnAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "idempotencyKey" TEXT;

-- Migrate existing crmAccessToken into credentials table.
-- Tokens are prefixed with "PLAINTEXT_MIGRATE:" so the application layer
-- can detect them on first read, re-encrypt with AES-256-GCM, and update
-- the row. Pure SQL cannot replicate the Node.js encryption format
-- (iv.authTag.ciphertext in base64). The prefix is never a valid encrypted
-- payload (no dots), so decrypt() will detect it reliably.
INSERT INTO credentials (id, "organizationId", provider, "encryptedPayload", "keyVersion", status, "createdAt", "updatedAt")
SELECT gen_random_uuid(), id, 'HUBSPOT',
       'PLAINTEXT_MIGRATE:' || "crmAccessToken",
       1, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM organizations WHERE "crmAccessToken" IS NOT NULL AND "crmAccessToken" <> '';

-- Verify every non-null token was migrated before dropping the column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM organizations o
    WHERE o."crmAccessToken" IS NOT NULL
      AND o."crmAccessToken" <> ''
      AND NOT EXISTS (
        SELECT 1 FROM credentials c
        WHERE c."organizationId" = o.id AND c.provider = 'HUBSPOT'
      )
  ) THEN
    RAISE EXCEPTION 'Credential backfill verification failed: some organizations still have unmigrated crmAccessToken values';
  END IF;
END $$;

-- Safe to drop now — every non-empty token has been copied
ALTER TABLE "organizations" DROP COLUMN "crmAccessToken";

-- Add status column first (without dropping isEmailVerified yet)
ALTER TABLE "users" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'PENDING';

-- Backfill user status based on isEmailVerified
UPDATE "users" SET "status" = 'ACTIVE' WHERE "isEmailVerified" = true;
UPDATE "users" SET "status" = 'PENDING' WHERE "isEmailVerified" = false;

-- Drop isEmailVerified column
ALTER TABLE "users" DROP COLUMN "isEmailVerified";

-- Deduplicate lead phone numbers before adding the unique constraint.
-- The unique index is unconditional (covers all rows, including soft-deleted).
-- Strategy: for each (org, phone) group, keep the most recently active lead
-- (prefer non-deleted, then most recent updatedAt). For duplicates, append the
-- lead ID to the phone number to make them unique while preserving traceability.
UPDATE "leads" AS l
SET "phoneNumber" = l."phoneNumber" || '_dup_' || l.id,
    "deletedAt" = COALESCE(l."deletedAt", CURRENT_TIMESTAMP)
FROM (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "organizationId", "phoneNumber"
           ORDER BY
             (CASE WHEN "deletedAt" IS NULL THEN 0 ELSE 1 END),
             "updatedAt" DESC,
             "createdAt" DESC
         ) AS rn
  FROM "leads"
) ranked
WHERE l.id = ranked.id AND ranked.rn > 1;

-- CreateTable
CREATE TABLE "organization_battlecards" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "competitorName" TEXT NOT NULL,
    "objectionType" TEXT NOT NULL,
    "rebuttalText" TEXT NOT NULL,
    "embedding" vector(3072),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_battlecards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_follow_ups" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" "FollowUpType" NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "bullJobId" TEXT,
    "aiContext" TEXT,
    "sentAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "topic" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "deviceMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_battlecards_organizationId_idx" ON "organization_battlecards"("organizationId");

-- CreateIndex
CREATE INDEX "scheduled_follow_ups_conversationId_status_idx" ON "scheduled_follow_ups"("conversationId", "status");

-- CreateIndex
CREATE INDEX "scheduled_follow_ups_organizationId_idx" ON "scheduled_follow_ups"("organizationId");

-- CreateIndex
CREATE INDEX "scheduled_follow_ups_scheduledAt_status_idx" ON "scheduled_follow_ups"("scheduledAt", "status");

-- CreateIndex
CREATE INDEX "outbox_events_status_createdAt_idx" ON "outbox_events"("status", "createdAt");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_familyId_idx" ON "sessions"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "leads_organizationId_phoneNumber_key" ON "leads"("organizationId", "phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "messages_idempotencyKey_key" ON "messages"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_battlecards" ADD CONSTRAINT "organization_battlecards_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_follow_ups" ADD CONSTRAINT "scheduled_follow_ups_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_follow_ups" ADD CONSTRAINT "scheduled_follow_ups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

