/*
  Warnings:

  - The `status` column on the `organization_memberships` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED');

-- AlterTable
ALTER TABLE "organization_memberships" DROP COLUMN "status",
ADD COLUMN     "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING';
