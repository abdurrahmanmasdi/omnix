CREATE TABLE "account_invitations" (
  "id" UUID NOT NULL PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "tokenHash" TEXT NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'PILOT_ACTIVATION',
  "issuedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "account_invitations_tokenHash_key" ON "account_invitations"("tokenHash");
CREATE INDEX "account_invitations_userId_createdAt_idx" ON "account_invitations"("userId", "createdAt");
CREATE INDEX "account_invitations_expiresAt_idx" ON "account_invitations"("expiresAt");
CREATE TABLE "account_activation_events" (
  "id" UUID NOT NULL PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "invitationId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "account_activation_events_userId_createdAt_idx" ON "account_activation_events"("userId", "createdAt");
