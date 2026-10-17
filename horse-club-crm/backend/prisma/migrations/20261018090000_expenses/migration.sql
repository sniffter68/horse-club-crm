CREATE TYPE "ExpensePaymentMethod" AS ENUM ('CASH', 'CARD');
CREATE TYPE "ExpenseCategory" AS ENUM ('FEED', 'BEDDING', 'VET_FARRIER', 'AMMUNITION', 'MAINTENANCE', 'SALARY', 'OTHER');
CREATE TABLE "Expense" (
  "id" UUID NOT NULL,
  "requestId" UUID,
  "amount" DECIMAL(12,2) NOT NULL CHECK ("amount" > 0),
  "paymentMethod" "ExpensePaymentMethod" NOT NULL,
  "category" "ExpenseCategory" NOT NULL,
  "description" VARCHAR(500) NOT NULL CHECK (length(btrim("description")) > 0),
  "date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" UUID NOT NULL,
  "receiptUrl" TEXT,
  "shiftId" UUID,
  "cancelledAt" TIMESTAMPTZ(6),
  "cancelledById" UUID,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Expense_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Expense_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "CashShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Expense_requestId_key" ON "Expense"("requestId");
CREATE INDEX "Expense_cancelledAt_date_idx" ON "Expense"("cancelledAt", "date");
CREATE INDEX "Expense_paymentMethod_category_date_idx" ON "Expense"("paymentMethod", "category", "date");
CREATE INDEX "Expense_createdById_date_idx" ON "Expense"("createdById", "date");
CREATE INDEX "Expense_shiftId_idx" ON "Expense"("shiftId");
