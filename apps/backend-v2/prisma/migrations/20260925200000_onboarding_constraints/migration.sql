-- CreateIndex: enforce unique organization slugs at the database level.
-- The application already checks via findFirst, but this prevents TOCTOU
-- race conditions under concurrent requests.
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex: prevent a user from holding duplicate memberships in the
-- same organization (guards concurrent createWorkspace calls).
CREATE UNIQUE INDEX "organization_memberships_userId_organizationId_key" ON "organization_memberships"("userId", "organizationId");
