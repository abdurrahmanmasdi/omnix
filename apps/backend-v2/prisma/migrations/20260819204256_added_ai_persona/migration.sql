-- CreateTable
CREATE TABLE "ai_personas" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "agentName" TEXT NOT NULL DEFAULT 'Assistant',
    "clinicName" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'Professional and empathetic',
    "businessRules" JSONB,
    "handoffMessage" TEXT NOT NULL DEFAULT 'I will transfer you to our medical coordinator.',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_personas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_personas_organizationId_key" ON "ai_personas"("organizationId");

-- AddForeignKey
ALTER TABLE "ai_personas" ADD CONSTRAINT "ai_personas_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
