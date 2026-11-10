-- Preserve recognized revenue when an unpaid lesson is settled at a revised price.
CREATE FUNCTION adjust_one_off_booking_revenue() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."costAmount" IS NOT DISTINCT FROM OLD."costAmount" OR NEW."membershipId" IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.status = 'completed' OR EXISTS (SELECT 1 FROM "Lesson" WHERE id = NEW."lessonId" AND status = 'COMPLETED') THEN
    PERFORM assert_financial_period_open(NEW."startTime");
    INSERT INTO "RevenueRecognition" ("bookingId", type, amount, "recognizedAt", "createdById")
      SELECT NEW.id, 'ONE_OFF_PRICE_ADJUSTMENT', NEW."costAmount" - COALESCE(SUM(amount), 0), NEW."startTime", NEW."financialActorId"
      FROM "RevenueRecognition" WHERE "bookingId" = NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Booking_one_off_price_adjustment" AFTER UPDATE OF "costAmount" ON "Booking"
  FOR EACH ROW EXECUTE FUNCTION adjust_one_off_booking_revenue();

CREATE OR REPLACE FUNCTION reverse_booking_revenue(booking_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE original "RevenueRecognition";
BEGIN
  SELECT * INTO original FROM "RevenueRecognition" WHERE "bookingId" = booking_id AND type = 'REVENUE_RECOGNITION';
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM assert_financial_period_open(original."recognizedAt");
  INSERT INTO "RevenueRecognition" ("bookingId", "membershipId", type, amount, "recognizedAt", "createdById")
    VALUES (booking_id, original."membershipId", 'REVENUE_REVERSAL', -original.amount, original."recognizedAt", original."createdById")
    ON CONFLICT ("bookingId", type) DO NOTHING;
  -- Reversals preserve the original one-off recognition and both transfer entries.
  INSERT INTO "RevenueRecognition" ("bookingId", "membershipId", type, amount, "recognizedAt", "createdById")
    SELECT "bookingId", "membershipId", CASE type
      WHEN 'ONE_OFF_PRICE_ADJUSTMENT' THEN 'ONE_OFF_PRICE_ADJUSTMENT_REVERSAL'
      WHEN 'ONE_OFF_REVENUE_TRANSFER' THEN 'ONE_OFF_REVENUE_TRANSFER_REVERSAL'
      ELSE 'MEMBERSHIP_REVENUE_REVERSAL' END, -amount, "recognizedAt", "createdById"
    FROM "RevenueRecognition" WHERE "bookingId" = booking_id
      AND type IN ('ONE_OFF_REVENUE_TRANSFER', 'MEMBERSHIP_REVENUE_RECOGNITION', 'ONE_OFF_PRICE_ADJUSTMENT')
    ON CONFLICT ("bookingId", type) DO NOTHING;
END $$;


