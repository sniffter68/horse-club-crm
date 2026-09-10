-- AlterTable
ALTER TABLE "Horse" ADD COLUMN     "maxDailyMinutes" INTEGER NOT NULL DEFAULT 240,
ADD COLUMN     "minRestMinutes" INTEGER NOT NULL DEFAULT 15;

-- CreateTable
CREATE TABLE "ClubSchedule" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "openTime" TEXT NOT NULL DEFAULT '09:00',
    "closeTime" TEXT NOT NULL DEFAULT '21:00',
    "dayOfWeekOff" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ClubSchedule_pkey" PRIMARY KEY ("id")
);
