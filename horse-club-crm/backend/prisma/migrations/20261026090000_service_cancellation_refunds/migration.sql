ALTER TABLE "Lesson" ADD COLUMN "cancelledAt" TIMESTAMPTZ(6), ADD COLUMN "deletedAt" TIMESTAMPTZ(6);
ALTER TABLE "Membership" ADD COLUMN "cancelledAt" TIMESTAMPTZ(6);
ALTER TABLE "BoardingContract" ADD COLUMN "cancelledAt" TIMESTAMPTZ(6);
ALTER TABLE "Expense" ADD COLUMN "refundPaymentId" UUID;
CREATE UNIQUE INDEX "Expense_refundPaymentId_key" ON "Expense"("refundPaymentId");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_refundPaymentId_fkey" FOREIGN KEY ("refundPaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TYPE "CashOperationType" AS ENUM ('INCOME', 'EXPENSE', 'REFUND');
ALTER TABLE "Payment" ADD COLUMN "operationType" "CashOperationType" NOT NULL DEFAULT 'INCOME';
ALTER TABLE "Expense" ADD COLUMN "operationType" "CashOperationType" NOT NULL DEFAULT 'EXPENSE';
