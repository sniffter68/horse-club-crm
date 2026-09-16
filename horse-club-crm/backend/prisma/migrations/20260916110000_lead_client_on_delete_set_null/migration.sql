ALTER TABLE "LeadRequest"
DROP CONSTRAINT "LeadRequest_clientId_fkey";

ALTER TABLE "LeadRequest"
ADD CONSTRAINT "LeadRequest_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
