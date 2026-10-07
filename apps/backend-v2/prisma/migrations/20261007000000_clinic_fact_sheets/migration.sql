CREATE TABLE "clinic_fact_sheets" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "facts" JSONB NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "clinic_fact_sheets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "clinic_fact_sheets_version_positive" CHECK ("version" > 0),
    CONSTRAINT "clinic_fact_sheets_approval_pair" CHECK (("approvedAt" IS NULL) = ("approvedBy" IS NULL)),
    CONSTRAINT "clinic_fact_sheets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "clinic_fact_sheets_organizationId_version_key" ON "clinic_fact_sheets"("organizationId", "version");
CREATE INDEX "clinic_fact_sheets_organizationId_approvedAt_idx" ON "clinic_fact_sheets"("organizationId", "approvedAt");
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "clinic_fact_sheets" TO omnix_backend_runtime;
GRANT SELECT ON TABLE "clinic_fact_sheets" TO omnix_python_runtime;
