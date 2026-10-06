-- AlterTable
ALTER TABLE "account_invitations" ADD COLUMN     "organizationId" UUID,
ADD COLUMN     "roleId" UUID;

-- AddForeignKey
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
