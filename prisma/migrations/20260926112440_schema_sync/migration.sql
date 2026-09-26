-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "mediaExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
