-- Account profile/password updates before a clinic membership also need an audit row.
ALTER TABLE "audit_logs" ALTER COLUMN "organizationId" DROP NOT NULL;
