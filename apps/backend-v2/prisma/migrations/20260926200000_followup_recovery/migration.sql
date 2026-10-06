ALTER TABLE "scheduled_follow_ups"
  ADD COLUMN "processingOwner" TEXT,
  ADD COLUMN "processingLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "recoveryQueuedAt" TIMESTAMP(3);
CREATE INDEX "scheduled_follow_ups_processingLeaseUntil_idx" ON "scheduled_follow_ups"("processingLeaseUntil");
