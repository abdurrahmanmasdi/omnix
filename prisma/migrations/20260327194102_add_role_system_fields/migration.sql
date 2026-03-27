-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "is_system" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slug" TEXT;

-- Backfill existing default roles so security logic can rely on slug/is_system.
UPDATE "roles"
SET "slug" = CASE
	WHEN lower("name") IN ('kurucu', 'owner') OR "name_translations"->>'en' = 'Owner' THEN 'owner'
	WHEN lower("name") IN ('yönetici', 'yonetici', 'manager') OR "name_translations"->>'en' = 'Manager' THEN 'manager'
	WHEN lower("name") IN ('temsilci', 'agent') OR "name_translations"->>'en' = 'Agent' THEN 'agent'
	ELSE "slug"
END
WHERE "slug" IS NULL;

UPDATE "roles"
SET "is_system" = true
WHERE "slug" IN ('owner', 'manager', 'agent');
