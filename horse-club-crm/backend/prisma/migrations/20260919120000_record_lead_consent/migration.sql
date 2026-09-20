ALTER TABLE "LeadRequest"
ADD COLUMN "consentVersion" TEXT,
ADD COLUMN "consentedAt" TIMESTAMPTZ(6),
ADD COLUMN "consentSource" TEXT;

COMMENT ON COLUMN "LeadRequest"."consentVersion" IS 'Редакция отдельного согласия, принятого посетителем при отправке заявки';
COMMENT ON COLUMN "LeadRequest"."consentedAt" IS 'Серверное время подтверждения согласия';
COMMENT ON COLUMN "LeadRequest"."consentSource" IS 'Канал подтверждения: LANDING или VK';

CREATE TABLE "VkConsent" (
  "vkUserId" BIGINT NOT NULL,
  "consentVersion" TEXT NOT NULL,
  "consentedAt" TIMESTAMPTZ(6) NOT NULL,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VkConsent_pkey" PRIMARY KEY ("vkUserId")
);
