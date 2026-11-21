CREATE TABLE IF NOT EXISTS "TelegramIntegrationSettings" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "encryptedConfig" TEXT NOT NULL,
  "updatedById" UUID NOT NULL,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramIntegrationSettings_pkey" PRIMARY KEY ("id")
);
