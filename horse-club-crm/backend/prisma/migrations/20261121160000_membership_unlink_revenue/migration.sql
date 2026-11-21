-- Unlink settlement adds compensating entries; cancellation must reverse them too.
-- No existing financial rows or cashbox views are modified.
CREATE OR REPLACE FUNCTION reverse_booking_revenue(booking_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE original "RevenueRecognition";
BEGIN
  SELECT * INTO original FROM "RevenueRecognition" WHERE "bookingId" = booking_id AND type = 'REVENUE_RECOGNITION';
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM assert_financial_period_open(original."recognizedAt");
  INSERT INTO "RevenueRecognition" ("bookingId", "membershipId", type, amount, "recognizedAt", "createdById")
    VALUES (booking_id, original."membershipId", 'REVENUE_REVERSAL', -original.amount, original."recognizedAt", original."createdById")
    ON CONFLICT ("bookingId", type) DO NOTHING;
  INSERT INTO "RevenueRecognition" ("bookingId", "membershipId", type, amount, "recognizedAt", "createdById")
    SELECT "bookingId", "membershipId", CASE type
      WHEN 'ONE_OFF_PRICE_ADJUSTMENT' THEN 'ONE_OFF_PRICE_ADJUSTMENT_REVERSAL'
      WHEN 'ONE_OFF_REVENUE_TRANSFER' THEN 'ONE_OFF_REVENUE_TRANSFER_REVERSAL'
      WHEN 'UNLINK_MEMBERSHIP_REVERSAL' THEN 'UNLINK_MEMBERSHIP_CANCEL_REVERSAL'
      WHEN 'UNLINK_ONE_OFF_RECOGNITION' THEN 'UNLINK_ONE_OFF_CANCEL_REVERSAL'
      ELSE 'MEMBERSHIP_REVENUE_REVERSAL' END, -amount, "recognizedAt", "createdById"
    FROM "RevenueRecognition" WHERE "bookingId" = booking_id
      AND type IN ('ONE_OFF_REVENUE_TRANSFER', 'MEMBERSHIP_REVENUE_RECOGNITION', 'ONE_OFF_PRICE_ADJUSTMENT',
        'UNLINK_MEMBERSHIP_REVERSAL', 'UNLINK_ONE_OFF_RECOGNITION')
    ON CONFLICT ("bookingId", type) DO NOTHING;
END $$;

-- A refunded/unlinked visit no longer counts toward the fixed membership's
-- rounding allocation; a later cancellation reverses that compensation as well.
CREATE OR REPLACE FUNCTION post_booking_revenue(booking_id uuid, at_time timestamptz, membership_id uuid,
  one_off_cost numeric, actor_id uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE earned numeric; m "Membership"; prior numeric; recognized_count integer; nominal_price numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM "RevenueRecognition" WHERE "bookingId" = booking_id AND type = 'REVENUE_RECOGNITION') THEN RETURN; END IF;
  PERFORM assert_financial_period_open(at_time);
  SELECT COALESCE(s.price, 0) INTO nominal_price
    FROM "Booking" b LEFT JOIN "Lesson" l ON l.id = b."lessonId"
    LEFT JOIN "Service" s ON s.id = l."serviceId" WHERE b.id = booking_id;
  IF membership_id IS NOT NULL THEN
    SELECT * INTO m FROM "Membership" WHERE id = membership_id FOR UPDATE;
    IF m.type = 'fixed_lessons' THEN
      IF m."pricePerLesson" IS NULL OR m."totalPrice" IS NULL THEN
        RAISE EXCEPTION 'У абонемента не указана стоимость для признания выручки' USING ERRCODE = '23514';
      END IF;
      SELECT COALESCE(SUM(amount), 0),
        COUNT(*) FILTER (WHERE type IN ('REVENUE_RECOGNITION', 'MEMBERSHIP_REVENUE_RECOGNITION', 'UNLINK_MEMBERSHIP_CANCEL_REVERSAL'))
        - COUNT(*) FILTER (WHERE type IN ('REVENUE_REVERSAL', 'MEMBERSHIP_REVENUE_REVERSAL', 'UNLINK_MEMBERSHIP_REVERSAL'))
        INTO prior, recognized_count FROM "RevenueRecognition" WHERE "membershipId" = membership_id;
      earned := LEAST(GREATEST(0, m."totalPrice" - prior), CASE
        WHEN recognized_count + 1 = m."totalLessons" THEN GREATEST(0, m."totalPrice" - prior)
        WHEN recognized_count = 0 THEN m."totalPrice" - LEAST(m."totalPrice", m."pricePerLesson" * (m."totalLessons" - 1))
        ELSE m."pricePerLesson" END);
    ELSE earned := COALESCE(nominal_price, 0);
    END IF;
  ELSE earned := COALESCE(nominal_price, 0);
  END IF;
  INSERT INTO "RevenueRecognition" ("bookingId", "membershipId", "amount", "recognizedAt", "createdById")
    VALUES (booking_id, membership_id, COALESCE(earned, 0), at_time, actor_id)
    ON CONFLICT ("bookingId", type) DO NOTHING;
END $$;
