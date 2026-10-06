-- History, claim and 24 h window queries filter messages by conversation (KI-030).
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");
