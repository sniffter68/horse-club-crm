CREATE TABLE "StallTransferLog" (
  "id" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sourceStallId" UUID NOT NULL,
  "targetStallId" UUID NOT NULL,
  "horseId" UUID NOT NULL,
  "swappedHorseId" UUID,
  CONSTRAINT "StallTransferLog_pkey" PRIMARY KEY ("id")
);
-- Snapshots intentionally survive removal of users, horses and stalls.
CREATE INDEX "StallTransferLog_createdAt_idx" ON "StallTransferLog"("createdAt");
