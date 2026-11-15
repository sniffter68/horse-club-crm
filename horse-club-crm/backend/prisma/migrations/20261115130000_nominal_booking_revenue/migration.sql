-- Preserve historical postings and membership sale allocation; use service nominal for one-off recognition.
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
      SELECT COALESCE(SUM(amount), 0), COUNT(*) FILTER (WHERE type = 'REVENUE_RECOGNITION') - COUNT(*) FILTER (WHERE type = 'REVENUE_REVERSAL')
        INTO prior, recognized_count FROM "RevenueRecognition" WHERE "membershipId" = membership_id;
      -- Allocate the rounding remainder to the first consumed lesson. Every
      -- later lesson is exactly pricePerLesson and the sale reconciles in cents.
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

