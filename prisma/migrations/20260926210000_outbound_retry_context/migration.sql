ALTER TABLE "outbound_attempts"
  ADD COLUMN "conversationVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'reply';
