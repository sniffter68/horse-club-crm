ALTER TABLE "Client" ADD COLUMN "telegramUserId" TEXT, ADD COLUMN "telegramUsername" TEXT;
CREATE UNIQUE INDEX "Client_telegramUserId_key" ON "Client"("telegramUserId");
ALTER TABLE "Booking" ADD COLUMN "telegramRequestId" UUID,
  ADD COLUMN "telegramConsentVersion" TEXT,
  ADD COLUMN "telegramConsentedAt" TIMESTAMPTZ(6);
CREATE UNIQUE INDEX "Booking_telegramRequestId_key" ON "Booking"("telegramRequestId");
