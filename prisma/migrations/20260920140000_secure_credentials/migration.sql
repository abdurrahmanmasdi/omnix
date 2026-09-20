-- Safe rollout: retain legacy plaintext columns so a separately reviewed job can
-- migrate each tenant and scrub only after verification.
CREATE TYPE "CredentialProvider" AS ENUM ('WHATSAPP_CLOUD_API', 'INSTAGRAM_GRAPH_API', 'HUBSPOT');
CREATE TYPE "CredentialStatus" AS ENUM ('ACTIVE', 'ROTATED', 'REVOKED', 'ERROR');
CREATE TABLE "credentials" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "provider" "CredentialProvider" NOT NULL,
  "encryptedPayload" TEXT NOT NULL,
  "keyVersion" INTEGER NOT NULL DEFAULT 1,
  "status" "CredentialStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastVerifiedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "credentials_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credentials_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "credentials_organizationId_provider_status_idx" ON "credentials"("organizationId", "provider", "status");
ALTER TABLE "channels" ADD COLUMN "credentialId" UUID;
ALTER TABLE "channels" ADD CONSTRAINT "channels_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
DROP INDEX "channels_provider_providerAccountId_key";
CREATE UNIQUE INDEX "channels_organizationId_provider_providerAccountId_key" ON "channels"("organizationId", "provider", "providerAccountId");
