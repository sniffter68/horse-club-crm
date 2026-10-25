BEGIN;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "vkId" TEXT;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "vkId" TEXT,
ADD COLUMN     "vkScreenName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_vkId_key" ON "User"("vkId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_vkId_key" ON "Client"("vkId");


-- Preserve existing client and employee delivery bindings. Trainer accounts take precedence.
UPDATE "Client" SET "vkId" = "vkUserId"::text WHERE "vkUserId" IS NOT NULL;
UPDATE "User" u SET "vkId" = COALESCE(t."vkUserId", u."vkUserId")::text FROM "Trainer" t WHERE u."trainerId" = t.id AND COALESCE(t."vkUserId", u."vkUserId") IS NOT NULL;
UPDATE "User" SET "vkId" = "vkUserId"::text WHERE "vkId" IS NULL AND "vkUserId" IS NOT NULL;

COMMIT;
