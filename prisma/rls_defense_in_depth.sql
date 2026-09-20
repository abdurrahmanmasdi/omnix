-- Run this manually if you want strict DB-level defense in depth.
-- By default, Prisma Client Extension isolates tenants application-side.

-- Enable RLS on core tenant-bound tables
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "channels" ENABLE ROW LEVEL SECURITY;

-- Create policies.
-- These assume the application executes: `SET LOCAL app.current_tenant_id = 'uuid';`
-- before querying. The 'true' parameter in set_config makes it local to the transaction.

CREATE POLICY tenant_isolation_leads ON "leads"
    USING ("organizationId"::text = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_conversations ON "conversations"
    USING ("organizationId"::text = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_messages ON "messages"
    USING (
        "conversationId" IN (
            SELECT id FROM "conversations" WHERE "organizationId"::text = current_setting('app.current_tenant_id', true)
        )
    );

CREATE POLICY tenant_isolation_credentials ON "credentials"
    USING ("organizationId"::text = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_channels ON "channels"
    USING ("organizationId"::text = current_setting('app.current_tenant_id', true));

-- Note: The superuser (postgres default) automatically bypasses RLS unless FORCE ROW LEVEL SECURITY is used.
