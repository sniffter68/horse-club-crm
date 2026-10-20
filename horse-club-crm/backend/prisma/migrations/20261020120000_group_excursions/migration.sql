ALTER TABLE "Service" ADD COLUMN "isPerPerson" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lesson" ADD COLUMN "participantsCount" INTEGER DEFAULT 1,
 ADD COLUMN "pricePerPerson" DECIMAL(12,2);
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_participantsCount_check" CHECK ("participantsCount" BETWEEN 1 AND 100);
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_pricePerPerson_check" CHECK ("pricePerPerson" >= 0);
