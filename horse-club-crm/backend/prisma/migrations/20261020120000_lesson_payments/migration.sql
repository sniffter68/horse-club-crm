CREATE TYPE "LessonPaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');
ALTER TABLE "Lesson"
  ADD COLUMN "cost" DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN "paymentStatus" "LessonPaymentStatus" NOT NULL DEFAULT 'UNPAID',
  ADD COLUMN "prepaymentAmount" DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN "prepaymentMethod" "PaymentMethod",
  ADD COLUMN "finalPaymentAmount" DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN "finalPaymentMethod" "PaymentMethod";
-- Preserve legacy membership resolution; new lessons explicitly record their agreed cost.
UPDATE "Lesson" SET "cost" = NULL;
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_nonnegative_payments" CHECK (
  ("cost" IS NULL OR "cost" >= 0) AND COALESCE("prepaymentAmount",0) >= 0
  AND COALESCE("finalPaymentAmount",0) >= 0
  AND ("cost" IS NULL OR COALESCE("prepaymentAmount",0) + COALESCE("finalPaymentAmount",0) <= "cost")
);

ALTER TABLE "Booking"
  ADD COLUMN "prepaymentAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "prepaymentMethod" "PaymentMethod",
  ADD COLUMN "finalPaymentAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "finalPaymentMethod" "PaymentMethod";
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_nonnegative_payments" CHECK (
  "prepaymentAmount" >= 0 AND "finalPaymentAmount" >= 0
  AND "prepaymentAmount" + "finalPaymentAmount" <= GREATEST("costAmount", 0)
);
