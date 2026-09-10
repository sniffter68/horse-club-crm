CREATE TABLE "PricingPlan" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "totalLessons" INTEGER NOT NULL,
    "validDays" INTEGER NOT NULL,
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "PricingPlan_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Membership" ADD COLUMN "totalLessons" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Membership" ADD COLUMN "pricingPlanId" UUID;
UPDATE "Membership" SET "totalLessons" = "remainedLessons" WHERE "totalLessons" = 0;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_pricingPlanId_fkey"
  FOREIGN KEY ("pricingPlanId") REFERENCES "PricingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Membership_pricingPlanId_idx" ON "Membership"("pricingPlanId");
