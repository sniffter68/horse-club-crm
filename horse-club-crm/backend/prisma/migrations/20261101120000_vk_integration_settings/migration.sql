CREATE TABLE "VkIntegrationSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "encryptedConfig" TEXT NOT NULL,
    "updatedById" UUID NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "VkIntegrationSettings_pkey" PRIMARY KEY ("id")
);
