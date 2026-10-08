BEGIN;

-- CreateEnum
CREATE TYPE "HorseOwnerType" AS ENUM ('club', 'private');

-- CreateEnum
CREATE TYPE "HorseStatus" AS ENUM ('active', 'rest', 'sick', 'quarantine');

-- CreateEnum
CREATE TYPE "ArenaType" AS ENUM ('indoor_arena', 'outdoor_arena', 'round_pen', 'trail');

-- CreateEnum
CREATE TYPE "MembershipType" AS ENUM ('fixed_lessons', 'deposit', 'boarding');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'frozen', 'expired', 'exhausted');

-- CreateEnum
CREATE TYPE "BookingServiceType" AS ENUM ('dressage', 'jumping', 'walks', 'beginners', 'photoshoot', 'corde');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('scheduled', 'completed', 'no_show', 'cancelled_client', 'cancelled_club', 'penalty_cancellation');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('purchase', 'usage', 'penalty_cancellation', 'refund', 'boarding_charge', 'manual_adjustment');

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_horseId_fkey";

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_lessonId_fkey";

-- AlterTable
ALTER TABLE "Arena" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxRidersCapacity" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "type" "ArenaType" NOT NULL DEFAULT 'indoor_arena',
ALTER COLUMN "capacity" SET DEFAULT 6;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "arenaId" UUID,
ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "costAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "endTime" TIMESTAMPTZ(6),
ADD COLUMN     "legacyLessonBinding" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "serviceType" "BookingServiceType",
ADD COLUMN     "startTime" TIMESTAMPTZ(6),
ADD COLUMN     "status" "BookingStatus" NOT NULL DEFAULT 'scheduled',
ADD COLUMN     "trainerId" UUID,
ALTER COLUMN "lessonId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Horse" ADD COLUMN     "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastVetCheckAt" TIMESTAMPTZ(6),
ADD COLUMN     "maxDailyWorkloadMinutes" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "maxRiderWeight" INTEGER NOT NULL DEFAULT 85,
ADD COLUMN     "nextShoeingDate" TIMESTAMPTZ(6),
ADD COLUMN     "ownerId" UUID,
ADD COLUMN     "ownerType" "HorseOwnerType" NOT NULL DEFAULT 'club',
ADD COLUMN     "requiredRestMinutes" INTEGER NOT NULL DEFAULT 45,
ADD COLUMN     "stallNumber" TEXT,
ADD COLUMN     "status" "HorseStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "suitability" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "maxDailyMinutes" SET DEFAULT 120,
ALTER COLUMN "minRestMinutes" SET DEFAULT 45;

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "allowedDisciplines" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "initialUnits" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "legacyUnassigned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "remainingUnits" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "status" "MembershipStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "title" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "type" "MembershipType" NOT NULL DEFAULT 'fixed_lessons',
ADD COLUMN     "validFrom" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "validTo" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "remainedLessons" SET DEFAULT 0,
ALTER COLUMN "validUntil" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Trainer" ADD COLUMN     "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "fullName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "specializations" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "telegramId" TEXT;

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "bookingId" UUID,
    "membershipId" UUID,
    "transactionType" "TransactionType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceMembershipOpId" UUID,

    CONSTRAINT "LedgerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_sourceMembershipOpId_key" ON "LedgerTransaction"("sourceMembershipOpId");

-- CreateIndex
CREATE INDEX "LedgerTransaction_clientId_createdAt_idx" ON "LedgerTransaction"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerTransaction_membershipId_createdAt_idx" ON "LedgerTransaction"("membershipId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerTransaction_bookingId_transactionType_idx" ON "LedgerTransaction"("bookingId", "transactionType");

-- CreateIndex
CREATE INDEX "Booking_startTime_endTime_idx" ON "Booking"("startTime", "endTime");

-- CreateIndex
CREATE INDEX "Booking_trainerId_status_startTime_endTime_idx" ON "Booking"("trainerId", "status", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "Booking_horseId_status_startTime_endTime_idx" ON "Booking"("horseId", "status", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "Booking_arenaId_status_startTime_endTime_idx" ON "Booking"("arenaId", "status", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "Horse_ownerId_idx" ON "Horse"("ownerId");

-- CreateIndex
CREATE INDEX "Horse_status_idx" ON "Horse"("status");

-- CreateIndex
CREATE INDEX "Membership_clientId_status_validTo_idx" ON "Membership"("clientId", "status", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "Trainer_telegramId_key" ON "Trainer"("telegramId");

-- CreateIndex
UPDATE "Trainer" SET "phone" = NULL WHERE btrim("phone") = '';
CREATE UNIQUE INDEX "Trainer_phone_key" ON "Trainer"("phone");

-- AddForeignKey
ALTER TABLE "Horse" ADD CONSTRAINT "Horse_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_arenaId_fkey" FOREIGN KEY ("arenaId") REFERENCES "Arena"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_sourceMembershipOpId_fkey" FOREIGN KEY ("sourceMembershipOpId") REFERENCES "MembershipOp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve all existing records and fill the new representation before enforcing it.
UPDATE "Trainer" SET "fullName" = "name";
UPDATE "Arena" SET "maxRidersCapacity" = "capacity", "isActive" = NOT "isUnavailable";
UPDATE "Horse" SET "maxDailyWorkloadMinutes" = "maxDailyMinutes", "requiredRestMinutes" = "minRestMinutes",
  "status" = CASE WHEN "isUnavailable" THEN 'rest'::"HorseStatus" ELSE 'active'::"HorseStatus" END;
UPDATE "Horse" h SET "ownerId" = c."clientId", "ownerType" = CASE WHEN c."clientId" IS NULL THEN 'club'::"HorseOwnerType" ELSE 'private'::"HorseOwnerType" END,
  "stallNumber" = s."name"
FROM "BoardingContract" c LEFT JOIN "Stall" s ON s."id" = c."stallId"
WHERE c."horseId" = h."id" AND c."status" IN ('ACTIVE', 'SUSPENDED') AND c."startsAt" <= CURRENT_TIMESTAMP
  AND (c."endsAt" IS NULL OR c."endsAt" > CURRENT_TIMESTAMP);

UPDATE "Membership" m SET "initialUnits" = m."totalLessons", "remainingUnits" = m."remainedLessons",
  "validFrom" = LEAST(m."createdAt", m."validUntil"), "validTo" = m."validUntil", "legacyUnassigned" = (m."clientId" IS NULL),
  "title" = COALESCE(p."name", 'Абонемент'),
  "status" = CASE WHEN m."validUntil" < CURRENT_TIMESTAMP THEN 'expired'::"MembershipStatus"
    WHEN m."remainedLessons" <= 0 THEN 'exhausted'::"MembershipStatus" ELSE 'active'::"MembershipStatus" END
FROM (SELECT "id", "name" FROM "PricingPlan" UNION ALL SELECT NULL::uuid, 'Абонемент') p
WHERE p."id" = m."pricingPlanId" OR (p."id" IS NULL AND m."pricingPlanId" IS NULL);

UPDATE "Booking" b SET "trainerId" = l."trainerId", "arenaId" = l."arenaId", "startTime" = l."startTime", "endTime" = l."endTime",
  "legacyLessonBinding" = true, "costAmount" = s."price",
  "status" = CASE WHEN l."status" = 'CANCELLED' THEN 'cancelled_club'::"BookingStatus"
    WHEN b."attendanceStatus" = 'NO_SHOW' OR l."status" = 'NO_SHOW' THEN 'no_show'::"BookingStatus"
    WHEN b."attendanceStatus" = 'ATTENDED' OR l."status" = 'COMPLETED' THEN 'completed'::"BookingStatus"
    ELSE 'scheduled'::"BookingStatus" END
FROM "Lesson" l JOIN "Service" s ON s."id" = l."serviceId" WHERE l."id" = b."lessonId";
ALTER TABLE "Booking" ALTER COLUMN "trainerId" SET NOT NULL, ALTER COLUMN "startTime" SET NOT NULL, ALTER COLUMN "endTime" SET NOT NULL;
ALTER TABLE "Horse" ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "Horse" ADD CONSTRAINT "Horse_physiology_check" CHECK ("maxRiderWeight" > 0 AND "maxDailyWorkloadMinutes" > 0 AND "requiredRestMinutes" >= 0);
ALTER TABLE "Arena" ADD CONSTRAINT "Arena_capacity_check" CHECK ("maxRidersCapacity" > 0);
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_interval_check" CHECK ("endTime" > "startTime"),
  ADD CONSTRAINT "Booking_triad_check" CHECK (("legacyLessonBinding" AND "lessonId" IS NOT NULL) OR ("horseId" IS NOT NULL AND "arenaId" IS NOT NULL AND "serviceType" IS NOT NULL)),
  ADD CONSTRAINT "Booking_cost_check" CHECK ("costAmount" >= 0);
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_client_check" CHECK ("clientId" IS NOT NULL OR "legacyUnassigned"),
  ADD CONSTRAINT "Membership_units_check" CHECK ("initialUnits" >= 0 AND "remainingUnits" >= 0),
  ADD CONSTRAINT "Membership_period_check" CHECK ("validTo" >= "validFrom");

-- Partial indexes support scheduled-resource lookups without indexing cancelled history.
CREATE INDEX "Booking_scheduled_trainer_interval_idx" ON "Booking" ("trainerId", "startTime", "endTime") WHERE "status" = 'scheduled';
CREATE INDEX "Booking_scheduled_horse_interval_idx" ON "Booking" ("horseId", "startTime", "endTime") WHERE "status" = 'scheduled';
CREATE INDEX "Booking_scheduled_arena_interval_idx" ON "Booking" ("arenaId", "startTime", "endTime") WHERE "status" = 'scheduled';

-- Keep old operations unchanged and project only journals with a known client.
INSERT INTO "LedgerTransaction" ("id", "clientId", "bookingId", "membershipId", "transactionType", "amount", "description", "createdAt", "sourceMembershipOpId")
SELECT o."id", m."clientId", (SELECT b."id" FROM "Booking" b WHERE b."lessonId" = o."lessonId" AND b."membershipId" = m."id" AND b."clientId" = m."clientId" ORDER BY b."createdAt", b."id" LIMIT 1),
  m."id", CASE WHEN o."type" = 'CREDIT' THEN 'purchase'::"TransactionType" WHEN o."type" = 'REFUND' THEN 'refund'::"TransactionType"
    WHEN l."status" = 'CANCELLED' THEN 'penalty_cancellation'::"TransactionType" ELSE 'usage'::"TransactionType" END,
  CASE WHEN o."type" = 'DEBIT' THEN -o."amount" ELSE o."amount" END, o."reason", o."createdAt", o."id"
FROM "MembershipOp" o JOIN "Membership" m ON m."id" = o."membershipId" LEFT JOIN "Lesson" l ON l."id" = o."lessonId"
WHERE m."clientId" IS NOT NULL;

COMMIT;
