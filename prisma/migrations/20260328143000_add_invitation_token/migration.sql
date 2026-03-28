-- Add invitation token support for frontend invite links
ALTER TABLE "invitations"
ADD COLUMN "token" TEXT;

-- Backfill existing rows before enforcing NOT NULL/UNIQUE constraints
UPDATE "invitations"
SET "token" = md5(random()::text || clock_timestamp()::text || id::text)
WHERE "token" IS NULL;

ALTER TABLE "invitations"
ALTER COLUMN "token" SET NOT NULL;

CREATE UNIQUE INDEX "invitations_token_key"
ON "invitations"("token");
