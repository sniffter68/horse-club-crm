ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'UNSPECIFIED' BEFORE 'CASH';

ALTER TABLE "Payment" ADD COLUMN "membershipId" UUID;

CREATE UNIQUE INDEX "Payment_membershipId_key" ON "Payment"("membershipId");

ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_membershipId_fkey"
FOREIGN KEY ("membershipId") REFERENCES "Membership"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
