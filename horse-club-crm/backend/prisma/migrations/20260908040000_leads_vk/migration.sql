-- Fail on duplicate phone numbers instead of silently merging client identities.
CREATE UNIQUE INDEX "Client_phone_key" ON "Client"("phone");
ALTER TABLE "Client" ADD COLUMN "vkUserId" BIGINT;
CREATE UNIQUE INDEX "Client_vkUserId_key" ON "Client"("vkUserId");
CREATE TABLE "LeadRequest" (
  "id" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "serviceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeadRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LeadRequest_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LeadRequest_clientId_serviceId_key" ON "LeadRequest"("clientId", "serviceId");
CREATE INDEX "LeadRequest_serviceId_idx" ON "LeadRequest"("serviceId");
