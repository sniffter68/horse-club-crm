CREATE TABLE "VkConversationState" (
    "peerId" BIGINT NOT NULL,
    "botPausedUntil" TIMESTAMPTZ(6),
    "isBotPaused" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "VkConversationState_pkey" PRIMARY KEY ("peerId")
);
