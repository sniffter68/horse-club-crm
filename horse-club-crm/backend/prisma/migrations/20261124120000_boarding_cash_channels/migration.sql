ALTER TABLE "Expense" ADD COLUMN "cashboxType" VARCHAR(16) NOT NULL DEFAULT 'MAIN';
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_cashboxType_check" CHECK ("cashboxType" IN ('MAIN', 'BOARDING'));
CREATE INDEX "Expense_cashboxType_date_idx" ON "Expense" ("cashboxType", "date");
