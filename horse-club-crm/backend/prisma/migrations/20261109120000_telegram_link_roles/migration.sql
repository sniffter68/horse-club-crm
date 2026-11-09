ALTER TABLE "User" ADD COLUMN "telegramUserId" TEXT, ADD COLUMN "telegramUsername" TEXT;
CREATE UNIQUE INDEX "User_telegramUserId_key" ON "User"("telegramUserId");
CREATE TABLE "TelegramLinkToken" (
 "tokenHash" TEXT NOT NULL PRIMARY KEY,
 "codeHash" TEXT NOT NULL,
 "entityType" TEXT NOT NULL,
 "entityId" UUID NOT NULL,
 "createdById" UUID NOT NULL,
 "expiresAt" TIMESTAMPTZ(6) NOT NULL
);
CREATE UNIQUE INDEX "TelegramLinkToken_codeHash_key" ON "TelegramLinkToken"("codeHash");
CREATE UNIQUE INDEX "TelegramLinkToken_entityType_entityId_key" ON "TelegramLinkToken"("entityType", "entityId");
CREATE INDEX "TelegramLinkToken_expiresAt_idx" ON "TelegramLinkToken"("expiresAt");
CREATE TABLE "TelegramNotification" (
 "key" TEXT NOT NULL PRIMARY KEY,
 "peerId" TEXT NOT NULL,
 "message" TEXT NOT NULL,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "sentAt" TIMESTAMPTZ(6),
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "nextAttemptAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TelegramNotification_sentAt_nextAttemptAt_idx" ON "TelegramNotification"("sentAt", "nextAttemptAt");
