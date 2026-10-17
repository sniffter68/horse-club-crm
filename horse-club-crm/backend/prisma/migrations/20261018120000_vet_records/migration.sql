CREATE TYPE "HorseHealthStatus" AS ENUM ('HEALTHY', 'TREATMENT', 'QUARANTINE', 'RETIRED');
CREATE TYPE "VetRecordType" AS ENUM ('VACCINATION', 'DEWORMING', 'BLOOD_TEST', 'FARRIER', 'EXAMINATION', 'TREATMENT', 'DENTAL');
ALTER TABLE "Horse" ADD COLUMN "healthStatus" "HorseHealthStatus" NOT NULL DEFAULT 'HEALTHY', ADD COLUMN "quarantineUntil" TIMESTAMPTZ(6);
UPDATE "Horse" SET "healthStatus" = CASE "status"::text WHEN 'sick' THEN 'TREATMENT'::"HorseHealthStatus" WHEN 'quarantine' THEN 'QUARANTINE'::"HorseHealthStatus" WHEN 'retired' THEN 'RETIRED'::"HorseHealthStatus" ELSE 'HEALTHY'::"HorseHealthStatus" END;
CREATE TABLE "VetRecord" (
  "id" UUID NOT NULL, "horseId" UUID NOT NULL, "type" "VetRecordType" NOT NULL,
  "title" TEXT NOT NULL, "performedAt" TIMESTAMPTZ(6) NOT NULL, "nextDueDate" TIMESTAMPTZ(6),
  "specialist" TEXT NOT NULL, "medication" TEXT, "notes" TEXT, "cost" DECIMAL(12,2), "documentUrl" TEXT,
  "createdById" UUID NOT NULL, "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "VetRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VetRecord_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VetRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VetRecord_cost_check" CHECK ("cost" IS NULL OR "cost" >= 0),
  CONSTRAINT "VetRecord_dates_check" CHECK ("nextDueDate" IS NULL OR "nextDueDate" > "performedAt")
);
CREATE INDEX "VetRecord_horseId_performedAt_idx" ON "VetRecord"("horseId", "performedAt");
CREATE INDEX "VetRecord_type_performedAt_idx" ON "VetRecord"("type", "performedAt");
CREATE INDEX "VetRecord_nextDueDate_idx" ON "VetRecord"("nextDueDate");
CREATE INDEX "VetRecord_createdById_idx" ON "VetRecord"("createdById");
