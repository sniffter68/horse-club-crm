-- CreateEnum
CREATE TYPE "HealthLogType" AS ENUM ('VACCINATION', 'FARRIER', 'DEWORMING', 'INSPECTION');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BoardingContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'TERMINATED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Horse"
ADD COLUMN "unavailableReason" TEXT,
ADD COLUMN "unavailableFrom" TIMESTAMPTZ(6),
ADD COLUMN "unavailableUntil" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "Arena" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "isUnavailable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Arena_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorseHealthLog" (
    "id" UUID NOT NULL,
    "horseId" UUID NOT NULL,
    "type" "HealthLogType" NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL,
    "nextDueAt" TIMESTAMPTZ(6),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "HorseHealthLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stall" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isUnavailable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Stall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardingContract" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "horseId" UUID NOT NULL,
    "stallId" UUID,
    "status" "BoardingContractStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6),
    "monthlyRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "BoardingContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "bookingId" UUID,
    "boardingContractId" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMPTZ(6),
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- Move the legacy lesson horse to every existing participant booking.
ALTER TABLE "Booking" ADD COLUMN "horseId" UUID;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "Lesson" AS lesson
        WHERE NOT EXISTS (
            SELECT 1
            FROM "Booking" AS booking
            WHERE booking."lessonId" = lesson."id"
        )
    ) THEN
        RAISE EXCEPTION 'Cannot remove Lesson.horseId: at least one lesson has no booking to receive the horse';
    END IF;
END $$;

UPDATE "Booking" AS booking
SET "horseId" = lesson."horseId"
FROM "Lesson" AS lesson
WHERE booking."lessonId" = lesson."id"
  AND booking."horseId" IS NULL;

-- Replace the lesson-level horse and arena indexes.
DROP INDEX "Lesson_horseId_startTime_endTime_idx";
ALTER TABLE "Lesson" DROP CONSTRAINT "Lesson_horseId_fkey";
ALTER TABLE "Lesson" DROP COLUMN "horseId";
ALTER TABLE "Lesson" ADD COLUMN "arenaId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Arena_name_key" ON "Arena"("name");
CREATE UNIQUE INDEX "Stall_name_key" ON "Stall"("name");
CREATE INDEX "Lesson_arenaId_startTime_endTime_idx" ON "Lesson"("arenaId", "startTime", "endTime");
CREATE INDEX "Booking_horseId_idx" ON "Booking"("horseId");
CREATE INDEX "HorseHealthLog_horseId_occurredAt_idx" ON "HorseHealthLog"("horseId", "occurredAt");
CREATE INDEX "HorseHealthLog_type_nextDueAt_idx" ON "HorseHealthLog"("type", "nextDueAt");
CREATE INDEX "BoardingContract_clientId_idx" ON "BoardingContract"("clientId");
CREATE INDEX "BoardingContract_horseId_status_idx" ON "BoardingContract"("horseId", "status");
CREATE INDEX "BoardingContract_stallId_status_idx" ON "BoardingContract"("stallId", "status");
CREATE INDEX "Payment_clientId_createdAt_idx" ON "Payment"("clientId", "createdAt");
CREATE INDEX "Payment_bookingId_idx" ON "Payment"("bookingId");
CREATE INDEX "Payment_boardingContractId_idx" ON "Payment"("boardingContractId");
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_arenaId_fkey" FOREIGN KEY ("arenaId") REFERENCES "Arena"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HorseHealthLog" ADD CONSTRAINT "HorseHealthLog_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoardingContract" ADD CONSTRAINT "BoardingContract_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BoardingContract" ADD CONSTRAINT "BoardingContract_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BoardingContract" ADD CONSTRAINT "BoardingContract_stallId_fkey" FOREIGN KEY ("stallId") REFERENCES "Stall"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_boardingContractId_fkey" FOREIGN KEY ("boardingContractId") REFERENCES "BoardingContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
