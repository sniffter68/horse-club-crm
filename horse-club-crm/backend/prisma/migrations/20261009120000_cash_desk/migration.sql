ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CARD_TERMINAL';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'SBP';
CREATE TABLE "CashShift" (
 "id" UUID NOT NULL PRIMARY KEY, "cashierId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "openedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "closedAt" TIMESTAMPTZ(6),
 "startingCash" DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK ("startingCash" >= 0), "notes" TEXT
);
CREATE INDEX "CashShift_cashierId_openedAt_idx" ON "CashShift"("cashierId", "openedAt");
CREATE UNIQUE INDEX "CashShift_one_open_per_cashier" ON "CashShift"("cashierId") WHERE "closedAt" IS NULL;
ALTER TABLE "Booking" ADD COLUMN "isPaid" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Booking" b SET "isPaid" = true WHERE EXISTS (SELECT 1 FROM "Payment" p WHERE p."bookingId" = b."id" AND p."status" = 'PAID');
DROP INDEX IF EXISTS "Payment_membershipId_key";
ALTER TABLE "Payment" ADD COLUMN "cashGiven" DECIMAL(12,2), ADD COLUMN "cashChange" DECIMAL(12,2),
 ADD COLUMN "cashierId" UUID REFERENCES "User"("id") ON DELETE RESTRICT,
 ADD COLUMN "shiftId" UUID REFERENCES "CashShift"("id") ON DELETE RESTRICT,
 ADD COLUMN "serviceId" UUID REFERENCES "Service"("id") ON DELETE RESTRICT,
 ADD COLUMN "serviceType" TEXT, ADD COLUMN "notes" TEXT, ADD COLUMN "requestId" UUID;
CREATE UNIQUE INDEX "Payment_requestId_key" ON "Payment"("requestId");
CREATE INDEX "Payment_cashierId_paidAt_idx" ON "Payment"("cashierId", "paidAt");
CREATE INDEX "Payment_shiftId_idx" ON "Payment"("shiftId");
CREATE INDEX "Payment_membershipId_idx" ON "Payment"("membershipId");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cash_values_check" CHECK (
 ("cashGiven" IS NULL AND "cashChange" IS NULL) OR
 ("method" = 'CASH' AND "cashGiven" >= "amount" AND "cashChange" = "cashGiven" - "amount")
);

ALTER TABLE "LedgerTransaction" ADD COLUMN "cashDeskPaymentId" UUID UNIQUE REFERENCES "Payment"("id") ON DELETE RESTRICT;
