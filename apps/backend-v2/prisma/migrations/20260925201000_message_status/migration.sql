-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'PROCESSED', 'SENT', 'CANCELLED', 'FAILED', 'DELIVERED', 'READ');

-- AlterTable
ALTER TABLE "messages" ADD COLUMN "status" "MessageStatus" NOT NULL DEFAULT 'PENDING';
