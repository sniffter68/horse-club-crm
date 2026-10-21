ALTER TABLE "Payment" ADD COLUMN "archivedAt" TIMESTAMPTZ(6);
ALTER TABLE "Expense" ADD COLUMN "archivedAt" TIMESTAMPTZ(6), ADD COLUMN "isEncashment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CashShift" ADD COLUMN "archivedAt" TIMESTAMPTZ(6);
CREATE TABLE "CashAuditLog" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB NOT NULL,
    CONSTRAINT "CashAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CashAuditLog_requestId_key" ON "CashAuditLog"("requestId");
CREATE INDEX "CashAuditLog_createdAt_idx" ON "CashAuditLog"("createdAt");
