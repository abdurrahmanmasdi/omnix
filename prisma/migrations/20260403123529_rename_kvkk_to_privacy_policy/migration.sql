/*
  Warnings:

  - You are about to drop the column `client_accepted_kvkk` on the `proposals` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "proposals" DROP COLUMN "client_accepted_kvkk",
ADD COLUMN     "client_accepted_privacy_policy" BOOLEAN NOT NULL DEFAULT false;
