ALTER TABLE "conversations" ADD COLUMN "generationOwner" TEXT,
ADD COLUMN "generationLeaseUntil" TIMESTAMP(3);
ALTER TABLE "messages" ADD COLUMN "processingOwner" TEXT,
ADD COLUMN "processingLeaseUntil" TIMESTAMP(3),
ADD COLUMN "recoveryQueuedAt" TIMESTAMP(3);
CREATE INDEX "messages_status_processingLeaseUntil_idx" ON "messages"("status", "processingLeaseUntil");
CREATE INDEX "conversations_generationLeaseUntil_idx" ON "conversations"("generationLeaseUntil");
