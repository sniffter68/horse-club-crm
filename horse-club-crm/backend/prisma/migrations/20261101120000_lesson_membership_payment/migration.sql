-- AlterEnum
ALTER TYPE "LessonPaymentStatus" ADD VALUE 'PAID_BY_MEMBERSHIP';

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_horseId_fkey";

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION post_booking_revenue(booking_id uuid, at_time timestamptz, membership_id uuid,
  one_off_cost numeric, actor_id uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE earned numeric; m "Membership"; prior numeric; recognized_count integer;
BEGIN
  IF EXISTS (SELECT 1 FROM "RevenueRecognition" WHERE "bookingId" = booking_id AND type = 'REVENUE_RECOGNITION') THEN RETURN; END IF;
  PERFORM assert_financial_period_open(at_time);
  IF membership_id IS NOT NULL THEN
    SELECT * INTO m FROM "Membership" WHERE id = membership_id FOR UPDATE;
    IF m.type = 'fixed_lessons' THEN
      IF m."pricePerLesson" IS NULL OR m."totalPrice" IS NULL THEN
        RAISE EXCEPTION 'У абонемента не указана стоимость для признания выручки' USING ERRCODE = '23514';
      END IF;
      SELECT COALESCE(SUM(amount), 0), COUNT(*) FILTER (WHERE type IN ('REVENUE_RECOGNITION', 'MEMBERSHIP_REVENUE_RECOGNITION')) - COUNT(*) FILTER (WHERE type IN ('REVENUE_REVERSAL', 'MEMBERSHIP_REVENUE_REVERSAL'))
        INTO prior, recognized_count FROM "RevenueRecognition" WHERE "membershipId" = membership_id;
      -- Allocate the rounding remainder to the first consumed lesson. Every
      -- later lesson is exactly pricePerLesson and the sale reconciles in cents.
      earned := LEAST(GREATEST(0, m."totalPrice" - prior), CASE
        WHEN recognized_count + 1 = m."totalLessons" THEN GREATEST(0, m."totalPrice" - prior)
        WHEN recognized_count = 0 THEN m."totalPrice" - LEAST(m."totalPrice", m."pricePerLesson" * (m."totalLessons" - 1))
        ELSE m."pricePerLesson" END);
    ELSE earned := one_off_cost;
    END IF;
  ELSE earned := one_off_cost;
  END IF;
  INSERT INTO "RevenueRecognition" ("bookingId", "membershipId", "amount", "recognizedAt", "createdById")
    VALUES (booking_id, membership_id, COALESCE(earned, 0), at_time, actor_id)
    ON CONFLICT ("bookingId", type) DO NOTHING;
END $$;

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
      WHEN 'ONE_OFF_REVENUE_TRANSFER' THEN 'ONE_OFF_REVENUE_TRANSFER_REVERSAL'
      ELSE 'MEMBERSHIP_REVENUE_REVERSAL' END, -amount, "recognizedAt", "createdById"
    FROM "RevenueRecognition" WHERE "bookingId" = booking_id
      AND type IN ('ONE_OFF_REVENUE_TRANSFER', 'MEMBERSHIP_REVENUE_RECOGNITION')
    ON CONFLICT ("bookingId", type) DO NOTHING;
END $$;


-- A completed unpaid lesson has already accrued one-off revenue. Reclassify
-- through append-only entries; never edit history or create another cash receipt.
CREATE FUNCTION post_late_membership_revenue(booking_id uuid, at_time timestamptz,
  membership_id uuid, actor_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE original "RevenueRecognition"; unit_price numeric;
BEGIN
  PERFORM assert_financial_period_open(at_time);
  SELECT * INTO original FROM "RevenueRecognition"
    WHERE "bookingId" = booking_id AND type = 'REVENUE_RECOGNITION';
  IF NOT FOUND THEN
    PERFORM post_booking_revenue(booking_id, at_time, membership_id, 0, actor_id);
    RETURN;
  END IF;
  IF original."membershipId" IS NOT NULL THEN
    RAISE EXCEPTION 'Выручка занятия уже привязана к абонементу' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "RevenueRecognition" WHERE "bookingId" = booking_id AND type = 'REVENUE_REVERSAL') THEN
    RAISE EXCEPTION 'Выручка занятия уже сторнирована' USING ERRCODE = '23514';
  END IF;
  SELECT "pricePerLesson" INTO unit_price FROM "Membership" WHERE id = membership_id FOR UPDATE;
  IF unit_price IS NULL THEN
    RAISE EXCEPTION 'У абонемента не указана стоимость занятия' USING ERRCODE = '23514';
  END IF;
  INSERT INTO "RevenueRecognition" ("bookingId", type, amount, "recognizedAt", "createdById")
    VALUES (booking_id, 'ONE_OFF_REVENUE_TRANSFER', -original.amount, at_time, actor_id)
    ON CONFLICT ("bookingId", type) DO NOTHING;
  INSERT INTO "RevenueRecognition" ("bookingId", "membershipId", type, amount, "recognizedAt", "createdById")
    VALUES (booking_id, membership_id, 'MEMBERSHIP_REVENUE_RECOGNITION', unit_price, at_time, actor_id)
    ON CONFLICT ("bookingId", type) DO NOTHING;
END $$;
