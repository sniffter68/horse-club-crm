ALTER TABLE "User" ADD COLUMN "vkUserId" BIGINT;
CREATE UNIQUE INDEX "User_vkUserId_key" ON "User"("vkUserId");
ALTER TABLE "VkNotification" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "VkNotification_sentAt_nextAttemptAt_idx" ON "VkNotification"("sentAt", "nextAttemptAt");
