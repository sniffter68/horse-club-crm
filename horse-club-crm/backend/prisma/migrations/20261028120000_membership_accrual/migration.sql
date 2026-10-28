BEGIN;
ALTER TABLE "Lesson" ADD COLUMN "financialActorId" UUID;
ALTER TABLE "Booking" ADD COLUMN "financialActorId" UUID;

CREATE TABLE "RevenueRecognition" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "bookingId" UUID, "membershipId" UUID, "sourcePaymentId" UUID,
  "type" TEXT NOT NULL DEFAULT 'REVENUE_RECOGNITION', "amount" DECIMAL(14,2) NOT NULL,
  "recognizedAt" TIMESTAMPTZ(6) NOT NULL, "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" UUID, CONSTRAINT "RevenueRecognition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RevenueRecognition_bookingId_type_key" ON "RevenueRecognition"("bookingId", "type");
CREATE UNIQUE INDEX "RevenueRecognition_sourcePaymentId_type_key" ON "RevenueRecognition"("sourcePaymentId", "type");
CREATE INDEX "RevenueRecognition_recognizedAt_idx" ON "RevenueRecognition"("recognizedAt");
CREATE INDEX "RevenueRecognition_membershipId_idx" ON "RevenueRecognition"("membershipId");
ALTER TABLE "RevenueRecognition" ADD CONSTRAINT "RevenueRecognition_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "MonthlyFinancialClosing" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "year" INTEGER NOT NULL, "month" INTEGER NOT NULL,
  "closedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "closedById" UUID,
  "cashFlowIncome" DECIMAL(14,2) NOT NULL, "cashFlowExpense" DECIMAL(14,2) NOT NULL,
  "recognizedRevenue" DECIMAL(14,2) NOT NULL, "deferredRevenueCarriedOver" DECIMAL(14,2) NOT NULL,
  "activeMembershipsCarriedOver" INTEGER NOT NULL, "notes" TEXT,
  CONSTRAINT "MonthlyFinancialClosing_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MonthlyFinancialClosing_month_check" CHECK ("month" BETWEEN 1 AND 12)
);
CREATE UNIQUE INDEX "MonthlyFinancialClosing_year_month_key" ON "MonthlyFinancialClosing"("year", "month");

-- Only actual recorded sales can supply a missing historical valuation. A
-- current tariff may have changed since sale and is not historical evidence.
UPDATE "Membership" m SET "totalPrice" = (
  SELECT SUM(p.amount) FROM "Payment" p WHERE p."membershipId" = m.id AND p.status = 'PAID' AND p."operationType" = 'INCOME'
) WHERE m.type = 'fixed_lessons' AND m."totalPrice" IS NULL AND EXISTS (
  SELECT 1 FROM "Payment" p WHERE p."membershipId" = m.id AND p.status = 'PAID' AND p."operationType" = 'INCOME'
);
UPDATE "Membership" SET "pricePerLesson" = ROUND("totalPrice" / "totalLessons", 2)
WHERE type = 'fixed_lessons' AND "totalPrice" IS NOT NULL AND "totalLessons" > 0;

-- Shared with the exclusive lock taken by MonthlyClosingService. SERIALIZABLE
-- protects the snapshot if a writer started before the closing acquired its lock.
CREATE FUNCTION assert_financial_period_open(at_time timestamptz) RETURNS void LANGUAGE plpgsql AS $$
DECLARE business_date timestamp;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(6842026);
  business_date := at_time AT TIME ZONE 'Europe/Moscow';
  IF EXISTS (SELECT 1 FROM "MonthlyFinancialClosing" WHERE year = EXTRACT(YEAR FROM business_date)
    AND month = EXTRACT(MONTH FROM business_date)) THEN
    RAISE EXCEPTION 'Финансовый месяц закрыт. Изменение проводок запрещено' USING ERRCODE = '23514';
  END IF;
END $$;

-- Immutable monetary postings survive booking removal. Never post to Payment:
-- the complete sale is already in the cash ledger.
CREATE FUNCTION post_booking_revenue(booking_id uuid, at_time timestamptz, membership_id uuid,
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
      SELECT COALESCE(SUM(amount), 0), COUNT(*) FILTER (WHERE type = 'REVENUE_RECOGNITION') - COUNT(*) FILTER (WHERE type = 'REVENUE_REVERSAL')
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

CREATE FUNCTION reverse_booking_revenue(booking_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE original "RevenueRecognition";
BEGIN
  SELECT * INTO original FROM "RevenueRecognition" WHERE "bookingId" = booking_id AND type = 'REVENUE_RECOGNITION';
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM assert_financial_period_open(original."recognizedAt");
  INSERT INTO "RevenueRecognition" ("bookingId", "membershipId", type, amount, "recognizedAt", "createdById")
    VALUES (booking_id, original."membershipId", 'REVENUE_REVERSAL', -original.amount, original."recognizedAt", original."createdById")
    ON CONFLICT ("bookingId", type) DO NOTHING;
END $$;

CREATE FUNCTION lesson_accrual() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b "Booking";
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status AND NEW."startTime" IS NOT DISTINCT FROM OLD."startTime" THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    PERFORM assert_financial_period_open(OLD."startTime");
    IF OLD.status = 'COMPLETED' AND NEW.status <> 'CANCELLED' AND (NEW.status <> OLD.status OR NEW."startTime" <> OLD."startTime") THEN
      RAISE EXCEPTION 'Проведенное занятие можно только отменить' USING ERRCODE = '23514';
    END IF;
  END IF;
  PERFORM assert_financial_period_open(NEW."startTime");
  FOR b IN SELECT * FROM "Booking" WHERE "lessonId" = NEW.id ORDER BY id LOOP
    IF NEW.status = 'COMPLETED' THEN
      PERFORM post_booking_revenue(b.id, NEW."startTime", b."membershipId", b."costAmount", NEW."financialActorId");
    ELSIF NEW.status = 'CANCELLED' THEN PERFORM reverse_booking_revenue(b.id);
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER "Lesson_accrual" AFTER INSERT OR UPDATE OF status, "startTime" ON "Lesson" FOR EACH ROW EXECUTE FUNCTION lesson_accrual();

CREATE FUNCTION booking_accrual() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.status, NEW."membershipId", NEW."startTime", NEW."costAmount", NEW.attended)
    IS NOT DISTINCT FROM (OLD.status, OLD."membershipId", OLD."startTime", OLD."costAmount", OLD.attended) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN PERFORM assert_financial_period_open(OLD."startTime"); END IF;
  PERFORM assert_financial_period_open(NEW."startTime");
  IF NEW."lessonId" IS NULL AND NEW.status = 'completed' THEN
    PERFORM post_booking_revenue(NEW.id, NEW."startTime", NEW."membershipId", NEW."costAmount", NEW."financialActorId");
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Booking_accrual" AFTER INSERT OR UPDATE ON "Booking" FOR EACH ROW EXECUTE FUNCTION booking_accrual();

CREATE FUNCTION guard_membership_operation_period() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE at_time timestamptz;
BEGIN
  SELECT "startTime" INTO at_time FROM "Lesson" WHERE id = NEW."lessonId";
  PERFORM assert_financial_period_open(COALESCE(at_time, NEW."createdAt"));
  RETURN NEW;
END $$;
CREATE TRIGGER "MembershipOp_closed_period" BEFORE INSERT ON "MembershipOp" FOR EACH ROW EXECUTE FUNCTION guard_membership_operation_period();

CREATE FUNCTION guard_unit_ledger_period() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE at_time timestamptz;
BEGIN
  IF NEW."membershipId" IS NOT NULL AND NEW."transactionType" <> 'purchase' AND NEW."cashDeskPaymentId" IS NULL THEN
    SELECT COALESCE(l."startTime", b."startTime") INTO at_time FROM "Booking" b
      LEFT JOIN "Lesson" l ON l.id = b."lessonId" WHERE b.id = NEW."bookingId";
    PERFORM assert_financial_period_open(COALESCE(at_time, NEW."createdAt"));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "LedgerTransaction_closed_period" BEFORE INSERT ON "LedgerTransaction" FOR EACH ROW EXECUTE FUNCTION guard_unit_ledger_period();

CREATE FUNCTION guard_service_delete_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM assert_financial_period_open(OLD."startTime"); RETURN OLD; END $$;
CREATE TRIGGER "Booking_delete_closed_period" BEFORE DELETE ON "Booking" FOR EACH ROW EXECUTE FUNCTION guard_service_delete_period();
CREATE TRIGGER "Lesson_delete_closed_period" BEFORE DELETE ON "Lesson" FOR EACH ROW EXECUTE FUNCTION guard_service_delete_period();

CREATE FUNCTION guard_cash_period() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE before_data jsonb; after_data jsonb; at_time timestamptz;
BEGIN
  before_data := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE NULL END;
  after_data := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE NULL END;
  -- Archiving the cash book does not change historical closing reports.
  IF TG_OP = 'UPDATE' AND (before_data - 'archivedAt' - 'updatedAt') = (after_data - 'archivedAt' - 'updatedAt') THEN RETURN NEW; END IF;
  -- A pending invoice is not a cash flow. Collecting an old debt in a later
  -- month checks its actual paidAt, without reopening the service month.
  IF TG_TABLE_NAME = 'Payment' THEN
    IF before_data->>'status' IS DISTINCT FROM 'PAID' THEN before_data := NULL; END IF;
    IF after_data->>'status' IS DISTINCT FROM 'PAID' THEN after_data := NULL; END IF;
  END IF;
  IF before_data IS NOT NULL THEN
    at_time := COALESCE((before_data->>'date')::timestamptz, (before_data->>'paidAt')::timestamptz, (before_data->>'createdAt')::timestamptz);
    PERFORM assert_financial_period_open(at_time);
  END IF;
  IF after_data IS NOT NULL THEN
    at_time := COALESCE((after_data->>'date')::timestamptz, (after_data->>'paidAt')::timestamptz, (after_data->>'createdAt')::timestamptz);
    PERFORM assert_financial_period_open(at_time);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Payment_closed_period" BEFORE INSERT OR UPDATE OR DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION guard_cash_period();
CREATE TRIGGER "Expense_closed_period" BEFORE INSERT OR UPDATE OR DELETE ON "Expense" FOR EACH ROW EXECUTE FUNCTION guard_cash_period();

-- A direct cash-desk service without a booking is delivered at payment time.
-- Booking prepayments, memberships and boarding advances are excluded.
CREATE FUNCTION immediate_service_revenue() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'PAID' AND NEW."operationType" = 'INCOME' AND NEW."bookingId" IS NULL
    AND NEW."membershipId" IS NULL AND NEW."boardingContractId" IS NULL AND NEW."serviceId" IS NOT NULL THEN
    INSERT INTO "RevenueRecognition" ("sourcePaymentId", amount, "recognizedAt", "createdById")
      VALUES (NEW.id, NEW.amount, COALESCE(NEW."paidAt", NEW."createdAt"), NEW."cashierId")
      ON CONFLICT ("sourcePaymentId", type) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Payment_immediate_revenue" AFTER INSERT OR UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION immediate_service_revenue();

CREATE FUNCTION immediate_service_refund_revenue() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."refundPaymentId" IS NOT NULL AND NEW."cancelledAt" IS NULL AND EXISTS (
    SELECT 1 FROM "RevenueRecognition" WHERE "sourcePaymentId" = NEW."refundPaymentId" AND type = 'REVENUE_RECOGNITION'
  ) THEN
    INSERT INTO "RevenueRecognition" ("sourcePaymentId", type, amount, "recognizedAt", "createdById")
      VALUES (NEW."refundPaymentId", 'REVENUE_REVERSAL', -NEW.amount, NEW.date, NEW."createdById")
      ON CONFLICT ("sourcePaymentId", type) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Expense_immediate_revenue_refund" AFTER INSERT ON "Expense" FOR EACH ROW EXECUTE FUNCTION immediate_service_refund_revenue();

CREATE FUNCTION immutable_financial_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Финансовые проводки и закрытия неизменяемы' USING ERRCODE = '23514'; END $$;
CREATE TRIGGER "RevenueRecognition_immutable" BEFORE UPDATE OR DELETE ON "RevenueRecognition" FOR EACH ROW EXECUTE FUNCTION immutable_financial_snapshot();
CREATE TRIGGER "MonthlyFinancialClosing_immutable" BEFORE UPDATE OR DELETE ON "MonthlyFinancialClosing" FOR EACH ROW EXECUTE FUNCTION immutable_financial_snapshot();

-- Historical completed services: recognize at the service date, not migration date.
INSERT INTO "RevenueRecognition" ("bookingId", "membershipId", amount, "recognizedAt")
SELECT b.id, b."membershipId", CASE WHEN m.type = 'fixed_lessons' THEN
  CASE WHEN ROW_NUMBER() OVER (PARTITION BY m.id ORDER BY COALESCE(l."startTime", b."startTime"), b.id) = 1
    THEN m."totalPrice" - LEAST(m."totalPrice", m."pricePerLesson" * (m."totalLessons" - 1)) ELSE m."pricePerLesson" END
  ELSE b."costAmount" END,
  COALESCE(l."startTime", b."startTime")
FROM "Booking" b LEFT JOIN "Lesson" l ON l.id = b."lessonId" LEFT JOIN "Membership" m ON m.id = b."membershipId"
WHERE (l.status = 'COMPLETED' OR (b."lessonId" IS NULL AND b.status = 'completed'))
  AND (b."membershipId" IS NULL OR m.type <> 'fixed_lessons' OR m."pricePerLesson" IS NOT NULL)
ON CONFLICT ("bookingId", type) DO NOTHING;
INSERT INTO "RevenueRecognition" ("sourcePaymentId", amount, "recognizedAt", "createdById")
SELECT p.id, p.amount, COALESCE(p."paidAt", p."createdAt"), p."cashierId" FROM "Payment" p
WHERE p.status = 'PAID' AND p."operationType" = 'INCOME' AND p."bookingId" IS NULL
  AND p."membershipId" IS NULL AND p."boardingContractId" IS NULL AND p."serviceId" IS NOT NULL
ON CONFLICT ("sourcePaymentId", type) DO NOTHING;
INSERT INTO "RevenueRecognition" ("sourcePaymentId", type, amount, "recognizedAt", "createdById")
SELECT e."refundPaymentId", 'REVENUE_REVERSAL', -e.amount, e.date, e."createdById"
FROM "Expense" e WHERE e."cancelledAt" IS NULL AND EXISTS (
  SELECT 1 FROM "RevenueRecognition" r WHERE r."sourcePaymentId" = e."refundPaymentId" AND r.type = 'REVENUE_RECOGNITION'
) ON CONFLICT ("sourcePaymentId", type) DO NOTHING;
COMMIT;
