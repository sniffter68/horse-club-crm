ALTER TABLE "ClubSchedule"
ADD COLUMN "daysOfWeekOff" INTEGER[] NOT NULL DEFAULT ARRAY[1]::INTEGER[];

UPDATE "ClubSchedule"
SET "daysOfWeekOff" = ARRAY["dayOfWeekOff"];
