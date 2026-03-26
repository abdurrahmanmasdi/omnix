-- DropIndex
DROP INDEX IF EXISTS "permissions_name_key";

-- AlterTable
ALTER TABLE "permissions" RENAME COLUMN "name" TO "action";

-- CreateIndex
CREATE UNIQUE INDEX "permissions_action_key" ON "permissions"("action");

