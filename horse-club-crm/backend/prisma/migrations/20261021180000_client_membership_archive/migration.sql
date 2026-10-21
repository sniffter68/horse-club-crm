ALTER TABLE "Client" ADD COLUMN "deletedAt" TIMESTAMPTZ(6);
CREATE INDEX "Client_deletedAt_idx" ON "Client"("deletedAt");
ALTER TABLE "Membership" ADD COLUMN "deletedAt" TIMESTAMPTZ(6);
CREATE INDEX "Membership_deletedAt_idx" ON "Membership"("deletedAt");
