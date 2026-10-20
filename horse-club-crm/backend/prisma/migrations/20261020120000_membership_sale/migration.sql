ALTER TABLE "Membership"
  ADD COLUMN "serviceId" UUID,
  ADD COLUMN "serviceTitle" TEXT,
  ADD COLUMN "pricePerLesson" DECIMAL(12,2),
  ADD COLUMN "totalPrice" DECIMAL(12,2),
  ADD COLUMN "paymentMethod" "PaymentMethod",
  ADD COLUMN "saleRequestId" UUID,
  ADD COLUMN "saleFingerprint" TEXT,
  ADD COLUMN "soldById" UUID,
  ADD COLUMN "cashboxPosted" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Membership_saleRequestId_key" ON "Membership"("saleRequestId");
CREATE INDEX "Membership_serviceId_idx" ON "Membership"("serviceId");
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_soldById_fkey" FOREIGN KEY ("soldById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_sale_amounts_check" CHECK (
  ("pricePerLesson" IS NULL OR "pricePerLesson" >= 0) AND
  ("totalPrice" IS NULL OR "totalPrice" >= 0) AND
  ("paymentMethod" IS NULL OR "paymentMethod" IN ('CASH', 'CARD'))
);
