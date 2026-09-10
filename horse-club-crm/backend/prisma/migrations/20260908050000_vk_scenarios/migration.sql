-- CreateEnum
CREATE TYPE "BookingAttendance" AS ENUM ('PENDING', 'ATTENDED', 'NO_SHOW');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "attendanceStatus" "BookingAttendance" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "isLead" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "clientId" UUID;

-- AlterTable
ALTER TABLE "Trainer" ADD COLUMN     "vkUserId" BIGINT;

-- CreateTable
CREATE TABLE "VkLinkCode" (
    "id" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "recordId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "usedBy" BIGINT,

    CONSTRAINT "VkLinkCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VkNotification" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "peerId" BIGINT NOT NULL,
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VkNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VkLinkCode_codeHash_key" ON "VkLinkCode"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "VkNotification_key_key" ON "VkNotification"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Trainer_vkUserId_key" ON "Trainer"("vkUserId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill only unambiguous ownership; never expose a shared legacy membership.
UPDATE "Membership" m SET "clientId" = owners."clientId"::uuid
FROM (SELECT "membershipId", min("clientId"::text) AS "clientId" FROM "Booking"
      WHERE "membershipId" IS NOT NULL GROUP BY "membershipId" HAVING count(DISTINCT "clientId") = 1) owners
WHERE m.id = owners."membershipId";
UPDATE "Booking" SET "attendanceStatus" = 'ATTENDED' WHERE attended = true;
UPDATE "Booking" b SET "attendanceStatus" = 'NO_SHOW' FROM "Lesson" l
WHERE b."lessonId" = l.id AND l.status = 'NO_SHOW' AND b.attended = false;
