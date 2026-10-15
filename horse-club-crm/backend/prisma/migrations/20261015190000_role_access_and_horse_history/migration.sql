ALTER TABLE "User" ADD COLUMN "trainerId" UUID;
CREATE UNIQUE INDEX "User_trainerId_key" ON "User"("trainerId");
ALTER TABLE "User" ADD CONSTRAINT "User_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RoleAccess" (
  "role" "Role" NOT NULL,
  "horseReplaceOwn" BOOLEAN NOT NULL DEFAULT false,
  "horseReplaceAny" BOOLEAN NOT NULL DEFAULT false,
  "healthRead" BOOLEAN NOT NULL DEFAULT true,
  "healthWrite" BOOLEAN NOT NULL DEFAULT false,
  "financeRead" BOOLEAN NOT NULL DEFAULT false,
  "boardingAccess" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "RoleAccess_pkey" PRIMARY KEY ("role"),
  CONSTRAINT "RoleAccess_trainer_any_check" CHECK ("role" <> 'TRAINER' OR NOT "horseReplaceAny"),
  CONSTRAINT "RoleAccess_health_write_check" CHECK (NOT "healthWrite" OR "healthRead")
);
INSERT INTO "RoleAccess" ("role", "horseReplaceOwn", "horseReplaceAny", "healthRead", "healthWrite", "financeRead", "boardingAccess", "updatedAt") VALUES
 ('ADMIN', true, true, true, true, true, true, NOW()),
 ('MANAGER', true, true, true, true, true, true, NOW()),
 ('TRAINER', true, false, true, false, false, true, NOW());

CREATE TABLE "BookingHorseChange" (
 "id" UUID NOT NULL, "bookingId" UUID NOT NULL, "actorUserId" UUID NOT NULL,
 "oldHorseId" UUID, "newHorseId" UUID NOT NULL, "reason" TEXT,
 "changedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "BookingHorseChange_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "BookingHorseChange_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "BookingHorseChange_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "BookingHorseChange_bookingId_changedAt_idx" ON "BookingHorseChange"("bookingId", "changedAt");
