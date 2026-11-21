ALTER TABLE "Client" ADD COLUMN "telegramChatId" TEXT;
CREATE UNIQUE INDEX "Client_telegramChatId_key" ON "Client"("telegramChatId");
CREATE TABLE "TelegramIntegrationSettings" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "encryptedConfig" TEXT NOT NULL,
  "updatedById" UUID NOT NULL,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "TelegramIntegrationSettings_pkey" PRIMARY KEY ("id")
);
