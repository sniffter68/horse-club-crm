-- Safe to reapply through psql. Legacy clocks and day-off indexes are preserved.
ALTER TABLE "ClubSchedule" ADD COLUMN IF NOT EXISTS "weekDays" JSONB;
UPDATE "ClubSchedule" s SET "weekDays" = (
  SELECT jsonb_agg(jsonb_build_object(
    'dayOfWeek', d, 'isWorkingDay', NOT ((d % 7) = ANY(s."daysOfWeekOff")),
    'openTime', s."openTime", 'closeTime', s."closeTime") ORDER BY d)
  FROM generate_series(1, 7) d
) WHERE s."weekDays" IS NULL;

CREATE TABLE IF NOT EXISTS "ClubNotificationSettings" (
  "id" INTEGER NOT NULL DEFAULT 1 PRIMARY KEY,
  "clientReminder24h" BOOLEAN NOT NULL DEFAULT true,
  "clientReminder2h" BOOLEAN NOT NULL DEFAULT true,
  "trainerNewBooking" BOOLEAN NOT NULL DEFAULT true,
  "trainerCancellation" BOOLEAN NOT NULL DEFAULT true,
  "adminDigest" BOOLEAN NOT NULL DEFAULT false,
  "adminDigestTime" TEXT NOT NULL DEFAULT '20:00',
  "adminRecipientIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
