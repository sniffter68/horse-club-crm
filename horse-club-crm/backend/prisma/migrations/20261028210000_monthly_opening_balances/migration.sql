ALTER TABLE "MonthlyFinancialClosing"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'CLOSED',
  ADD COLUMN "cashBalanceCarriedOver" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "membershipsAdvanceRows" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE "OpeningBalance" (
  "id" UUID NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL CHECK ("month" BETWEEN 1 AND 12),
  "incomingCashBalance" DECIMAL(14,2) NOT NULL,
  "incomingAdvanceBalance" DECIMAL(14,2) NOT NULL,
  "closingId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "OpeningBalance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OpeningBalance_closingId_fkey" FOREIGN KEY ("closingId") REFERENCES "MonthlyFinancialClosing"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OpeningBalance_year_month_key" ON "OpeningBalance"("year", "month");
CREATE UNIQUE INDEX "OpeningBalance_closingId_key" ON "OpeningBalance"("closingId");
