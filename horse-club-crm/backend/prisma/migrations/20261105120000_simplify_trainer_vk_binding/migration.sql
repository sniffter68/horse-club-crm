-- Rename in place: preserve all existing trainer bindings without copying accounts.
ALTER TABLE "Trainer" RENAME COLUMN "vkUserId" TO "vkId";
ALTER INDEX "Trainer_vkUserId_key" RENAME TO "Trainer_vkId_key";
-- Trainer binding no longer uses temporary codes. Client codes remain unchanged.
DELETE FROM "VkLinkCode" WHERE "kind" = 'TRAINER';
