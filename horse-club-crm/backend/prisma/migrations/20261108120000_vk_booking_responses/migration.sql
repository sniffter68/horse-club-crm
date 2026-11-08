ALTER TABLE "Booking"
  ADD COLUMN "clientConfirmed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "clientCancellationRequested" BOOLEAN NOT NULL DEFAULT false;
