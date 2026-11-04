ALTER TABLE "Trainer" ADD COLUMN "maxParallelLessons" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "Trainer" ADD CONSTRAINT "Trainer_maxParallelLessons_check" CHECK ("maxParallelLessons" BETWEEN 1 AND 100);
