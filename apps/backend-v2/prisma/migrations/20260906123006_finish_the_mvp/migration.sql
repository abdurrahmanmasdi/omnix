/*
  Warnings:

  - You are about to drop the column `whatsappAccessToken` on the `organizations` table. All the data in the column will be lost.
  - You are about to drop the column `whatsappPhoneNumberId` on the `organizations` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ExternalCrmType" AS ENUM ('HUB_SPOT', 'ZOHO', 'NONE');

-- CreateEnum
CREATE TYPE "ChannelProvider" AS ENUM ('WHATSAPP_CLOUD_API');

-- CreateEnum
CREATE TYPE "ChannelStatus" AS ENUM ('ACTIVE', 'ERROR', 'DISCONNECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadStatus" ADD VALUE 'QUALIFIED';
ALTER TYPE "LeadStatus" ADD VALUE 'READY_TO_BOOK';

-- DropIndex
DROP INDEX "organizations_whatsappPhoneNumberId_key";

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "externalContactId" TEXT,
ADD COLUMN     "externalCrmType" "ExternalCrmType" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "externalDealId" TEXT,
ADD COLUMN     "summary" TEXT;

-- AlterTable
ALTER TABLE "organizations" DROP COLUMN "whatsappAccessToken",
DROP COLUMN "whatsappPhoneNumberId",
ADD COLUMN     "crmAccessToken" TEXT;

-- AlterTable
ALTER TABLE "pipeline_stages" ADD COLUMN     "mappedStatus" "LeadStatus";

-- CreateTable
CREATE TABLE "channels" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "provider" "ChannelProvider" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "status" "ChannelStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channels_provider_providerAccountId_key" ON "channels"("provider", "providerAccountId");

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
