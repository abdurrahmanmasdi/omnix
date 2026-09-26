CREATE TYPE "OutboundAttemptStatus" AS ENUM ('PENDING', 'SENDING', 'ACCEPTED', 'UNKNOWN', 'FAILED', 'CANCELLED');

CREATE TABLE "outbound_attempts" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "messageId" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "status" "OutboundAttemptStatus" NOT NULL DEFAULT 'PENDING',
  "providerId" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbound_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "outbound_attempts_messageId_key" ON "outbound_attempts"("messageId");
CREATE UNIQUE INDEX "outbound_attempts_dedupeKey_key" ON "outbound_attempts"("dedupeKey");
CREATE UNIQUE INDEX "outbound_attempts_providerId_key" ON "outbound_attempts"("providerId");
CREATE INDEX "outbound_attempts_status_startedAt_idx" ON "outbound_attempts"("status", "startedAt");
CREATE INDEX "outbound_attempts_organizationId_conversationId_idx" ON "outbound_attempts"("organizationId", "conversationId");
ALTER TABLE "outbound_attempts" ADD CONSTRAINT "outbound_attempts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outbound_attempts" ADD CONSTRAINT "outbound_attempts_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outbound_attempts" ADD CONSTRAINT "outbound_attempts_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
