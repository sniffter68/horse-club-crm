CREATE TYPE "LeadRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

ALTER TABLE "LeadRequest"
ADD COLUMN "firstName" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "preferences" TEXT,
ADD COLUMN "status" "LeadRequestStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "processedAt" TIMESTAMPTZ(6),
ADD COLUMN "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "LeadRequest" AS request
SET
  "firstName" = COALESCE(NULLIF(client."firstName", ''), NULLIF(client."name", ''), 'Без имени'),
  "phone" = COALESCE(client."phone", ''),
  "email" = client."email",
  "preferences" = client."preferences",
  "status" = 'ACCEPTED',
  "processedAt" = request."createdAt"
FROM "Client" AS client
WHERE client."id" = request."clientId";

ALTER TABLE "LeadRequest"
ALTER COLUMN "firstName" SET NOT NULL,
ALTER COLUMN "phone" SET NOT NULL,
ALTER COLUMN "clientId" DROP NOT NULL,
ALTER COLUMN "serviceId" DROP NOT NULL;

DROP INDEX IF EXISTS "LeadRequest_clientId_serviceId_key";
CREATE INDEX "LeadRequest_status_createdAt_idx" ON "LeadRequest"("status", "createdAt");
CREATE INDEX "LeadRequest_phone_status_idx" ON "LeadRequest"("phone", "status");
