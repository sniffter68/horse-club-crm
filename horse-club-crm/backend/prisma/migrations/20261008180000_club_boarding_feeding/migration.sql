-- Existing private contracts and their payments remain unchanged.
ALTER TABLE "BoardingContract" ALTER COLUMN "clientId" DROP NOT NULL;
ALTER TABLE "Horse" ADD COLUMN "feedingNotes" TEXT;

-- Club placements never carry a boarding rate.
ALTER TABLE "BoardingContract" ADD CONSTRAINT "BoardingContract_club_rate_check"
  CHECK ("clientId" IS NOT NULL OR "monthlyRate" = 0);
