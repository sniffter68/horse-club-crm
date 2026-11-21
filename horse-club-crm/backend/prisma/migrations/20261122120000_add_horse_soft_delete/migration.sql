ALTER TABLE "Horse" ADD COLUMN "deletedAt" TIMESTAMPTZ(6);

CREATE INDEX "Horse_deletedAt_idx" ON "Horse"("deletedAt");
