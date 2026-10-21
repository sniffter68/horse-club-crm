BEGIN;

-- Keep cash receipts, booking audit and membership operations after lesson deletion.
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_lessonId_fkey";
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_lessonId_fkey"
  FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A detached legacy booking is an audit record, never a new resource reservation.
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_triad_check";
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_triad_check" CHECK (
  ("legacyLessonBinding" AND ("lessonId" IS NOT NULL OR "status" = 'cancelled_club'))
  OR ("horseId" IS NOT NULL AND "arenaId" IS NOT NULL AND "serviceType" IS NOT NULL)
);

COMMIT;
