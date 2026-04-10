-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'OFF_SHIFT');

-- CreateEnum
CREATE TYPE "AgentTier" AS ENUM ('JUNIOR', 'STANDARD', 'SENIOR', 'MANAGER');

-- AlterTable
ALTER TABLE "organization_memberships" ADD COLUMN     "agent_tier" "AgentTier" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "availability_status" "AvailabilityStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "commission_rate" DECIMAL(5,2),
ADD COLUMN     "job_title" TEXT,
ADD COLUMN     "max_active_leads" INTEGER,
ADD COLUMN     "monthly_revenue_target" DECIMAL(12,2),
ADD COLUMN     "specializations" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar_url" TEXT,
ADD COLUMN     "phone_number" TEXT,
ADD COLUMN     "spoken_languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "whatsapp_number" TEXT;
