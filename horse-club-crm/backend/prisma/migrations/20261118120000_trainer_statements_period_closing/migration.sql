
BEGIN;
CREATE FUNCTION audited_trainer_reset() RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS (SELECT 1 FROM "CashAuditLog" a JOIN "User" u ON u.id=a."actorId"
    WHERE a."requestId"::text=current_setting('horsecrm.operational_reset_id',true)
      AND a.action='RESET_ALL_OPERATIONAL_DATA' AND u.role='ADMIN'
      AND a.xmin::text=pg_current_xact_id()::text AND a.details->'snapshot' ? 'trainerPayouts'
      AND a.details->'snapshot' ? 'periodClosings');
$$;
-- CreateEnum
CREATE TYPE "TrainerPayoutType" AS ENUM ('ADVANCE', 'FINAL_SALARY');

-- CreateEnum
CREATE TYPE "TrainerPayoutStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID');

-- CreateTable
CREATE TABLE "TrainerPayout" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "type" "TrainerPayoutType" NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "TrainerPayoutStatus" NOT NULL DEFAULT 'DRAFT',
    "lessonsCount" INTEGER NOT NULL,
    "nominalBase" DECIMAL(14,2) NOT NULL,
    "accrued" DECIMAL(14,2) NOT NULL,
    "advanceDeducted" DECIMAL(14,2) NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "lessonBreakdown" JSONB NOT NULL,
    "expenseId" UUID,
    "paidAt" TIMESTAMPTZ(6),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "TrainerPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialPeriodClosing" (
    "id" UUID NOT NULL,
    "type" VARCHAR(5) NOT NULL,
    "periodStart" TIMESTAMPTZ(6) NOT NULL,
    "periodEnd" TIMESTAMPTZ(6) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "closedById" UUID NOT NULL,
    "closedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialPeriodClosing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainerPayout_expenseId_key" ON "TrainerPayout"("expenseId");

-- CreateIndex
CREATE INDEX "TrainerPayout_staffId_month_status_idx" ON "TrainerPayout"("staffId", "month", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerPayout_staffId_type_periodStart_periodEnd_key" ON "TrainerPayout"("staffId", "type", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialPeriodClosing_type_periodStart_key" ON "FinancialPeriodClosing"("type", "periodStart");

-- AddForeignKey
ALTER TABLE "TrainerPayout" ADD CONSTRAINT "TrainerPayout_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerPayout" ADD CONSTRAINT "TrainerPayout_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Additive migration: no existing rows, cash tables or v_cashbox_balances are rewritten.
ALTER TABLE "TrainerPayout" ADD CONSTRAINT "TrainerPayout_amounts_check" CHECK (
  "periodStart" <= "periodEnd" AND month = to_char("periodStart", 'YYYY-MM') AND month = to_char("periodEnd", 'YYYY-MM')
  AND "lessonsCount" >= 0 AND "nominalBase" >= 0 AND accrued >= 0 AND "advanceDeducted" >= 0
  AND "totalAmount" = accrued - "advanceDeducted" AND "totalAmount" >= 0
  AND (type <> 'ADVANCE' OR "advanceDeducted" = 0)
  AND (type <> 'FINAL_SALARY' OR ("periodStart" = date_trunc('month', "periodStart")::date AND "periodEnd" = (date_trunc('month', "periodStart") + interval '1 month - 1 day')::date))
);
ALTER TABLE "TrainerPayout" ADD CONSTRAINT "TrainerPayout_paid_check" CHECK (
  (status = 'PAID' AND "paidAt" IS NOT NULL AND (("totalAmount" > 0 AND "expenseId" IS NOT NULL) OR ("totalAmount" = 0 AND "expenseId" IS NULL)))
  OR (status <> 'PAID' AND "paidAt" IS NULL AND "expenseId" IS NULL)
);
ALTER TABLE "FinancialPeriodClosing" ADD CONSTRAINT "FinancialPeriodClosing_range_check" CHECK (
  type IN ('SHIFT', 'MONTH') AND "periodStart" < "periodEnd"
);
CREATE TRIGGER "FinancialPeriodClosing_immutable" BEFORE UPDATE OR DELETE ON "FinancialPeriodClosing"
FOR EACH ROW EXECUTE FUNCTION immutable_financial_snapshot();

CREATE OR REPLACE FUNCTION assert_financial_period_open(at_time timestamptz) RETURNS void LANGUAGE plpgsql AS $$
DECLARE business_date timestamp;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(6842026);
  business_date := at_time AT TIME ZONE 'Europe/Moscow';
  IF EXISTS (SELECT 1 FROM "MonthlyFinancialClosing" WHERE year = EXTRACT(YEAR FROM business_date) AND month = EXTRACT(MONTH FROM business_date))
    OR EXISTS (SELECT 1 FROM "FinancialPeriodClosing" WHERE "periodStart" <= at_time AND "periodEnd" > at_time) THEN
    RAISE EXCEPTION 'Финансовый период закрыт. Изменение проводок запрещено' USING ERRCODE = '23514';
  END IF;
END $$;

-- Catch financial changes beyond status/startTime (trainer, service, participant and price).
CREATE FUNCTION guard_lesson_period_all() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND audited_trainer_reset() THEN RETURN OLD; END IF;
  IF TG_OP <> 'INSERT' THEN PERFORM assert_financial_period_open(OLD."startTime"); END IF;
  IF TG_OP <> 'DELETE' THEN PERFORM assert_financial_period_open(NEW."startTime"); RETURN NEW; END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER "Lesson_period_all" BEFORE INSERT OR UPDATE OR DELETE ON "Lesson" FOR EACH ROW EXECUTE FUNCTION guard_lesson_period_all();
CREATE TRIGGER "Booking_period_all" BEFORE INSERT OR UPDATE OR DELETE ON "Booking" FOR EACH ROW EXECUTE FUNCTION guard_lesson_period_all();

CREATE FUNCTION assert_payroll_month_open(start_date date, end_date date) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock_shared(6842026);
  IF EXISTS (SELECT 1 FROM "MonthlyFinancialClosing" WHERE make_date(year, month, 1) <= end_date
      AND (make_date(year, month, 1) + interval '1 month')::date > start_date) THEN
    RAISE EXCEPTION 'Финансовый период закрыт. Изменение проводок запрещено' USING ERRCODE = '23514';
  END IF;
END $$;

CREATE FUNCTION guard_trainer_statement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expense_row "Expense";
BEGIN
  IF TG_OP = 'DELETE' AND audited_trainer_reset() THEN RETURN OLD; END IF;
  PERFORM pg_advisory_xact_lock_shared(6842026);
  IF TG_OP <> 'INSERT' THEN
    IF OLD.status = 'PAID' THEN RAISE EXCEPTION 'Выплаченная ведомость неизменяема' USING ERRCODE = '23514'; END IF;
    PERFORM assert_payroll_month_open(OLD."periodStart", OLD."periodEnd");
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  PERFORM assert_payroll_month_open(NEW."periodStart", NEW."periodEnd");
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."staffId"::text, 0));
  IF EXISTS (SELECT 1 FROM "PayrollCalculation" WHERE "staffId" = NEW."staffId" AND "isPaid"
      AND "periodStart" <= NEW."periodEnd" AND "periodEnd" >= NEW."periodStart")
    OR EXISTS (SELECT 1 FROM "TrainerPayout" p WHERE p.id <> NEW.id AND p."staffId" = NEW."staffId" AND p.month = NEW.month AND p.status = 'PAID'
      AND (p.type = 'FINAL_SALARY' OR (NEW.type = 'ADVANCE' AND p."periodStart" <= NEW."periodEnd" AND p."periodEnd" >= NEW."periodStart"))) THEN
    RAISE EXCEPTION 'Период уже оплачен' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'PAID' THEN
    IF TG_OP = 'INSERT' OR OLD.status <> 'APPROVED' THEN RAISE EXCEPTION 'Сначала утвердите ведомость' USING ERRCODE = '23514'; END IF;
    IF NEW."totalAmount" > 0 THEN
      SELECT * INTO expense_row FROM "Expense" WHERE id = NEW."expenseId";
      IF NOT FOUND OR expense_row.category <> 'SALARY' OR expense_row.amount <> NEW."totalAmount"
        OR expense_row."refundPaymentId" IS NOT NULL OR expense_row."cancelledAt" IS NOT NULL OR expense_row."archivedAt" IS NOT NULL
        OR expense_row.date <> NEW."paidAt" THEN
        RAISE EXCEPTION 'Неверный расход выплаты из основной кассы' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "TrainerPayout_guard" BEFORE INSERT OR UPDATE OR DELETE ON "TrainerPayout" FOR EACH ROW EXECUTE FUNCTION guard_trainer_statement();

CREATE FUNCTION guard_legacy_payroll_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND audited_trainer_reset() THEN RETURN OLD; END IF;
  IF TG_OP <> 'INSERT' THEN PERFORM assert_payroll_month_open(OLD."periodStart", OLD."periodEnd"); END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  PERFORM assert_payroll_month_open(NEW."periodStart", NEW."periodEnd");
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."staffId"::text, 0));
  IF EXISTS (SELECT 1 FROM "TrainerPayout" p WHERE p."staffId" = NEW."staffId" AND p.status = 'PAID'
      AND p."periodStart" <= NEW."periodEnd" AND p."periodEnd" >= NEW."periodStart") THEN
    RAISE EXCEPTION 'Период уже оплачен' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PayrollCalculation_period_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PayrollCalculation" FOR EACH ROW EXECUTE FUNCTION guard_legacy_payroll_period();

CREATE FUNCTION guard_workshift_financial_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND audited_trainer_reset() THEN RETURN OLD; END IF;
  IF TG_OP <> 'INSERT' THEN
    PERFORM assert_financial_period_open(OLD.date::timestamp AT TIME ZONE 'Europe/Moscow');
    IF EXISTS (SELECT 1 FROM "TrainerPayout" p WHERE p."staffId" = OLD."staffId" AND p.status = 'PAID' AND OLD.date BETWEEN p."periodStart" AND p."periodEnd") THEN
      RAISE EXCEPTION 'Период уже оплачен' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  PERFORM assert_financial_period_open(NEW.date::timestamp AT TIME ZONE 'Europe/Moscow');
  IF EXISTS (SELECT 1 FROM "TrainerPayout" p WHERE p."staffId" = NEW."staffId" AND p.status = 'PAID' AND NEW.date BETWEEN p."periodStart" AND p."periodEnd") THEN
    RAISE EXCEPTION 'Период уже оплачен' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "WorkShift_financial_period" BEFORE INSERT OR UPDATE OR DELETE ON "WorkShift" FOR EACH ROW EXECUTE FUNCTION guard_workshift_financial_period();

CREATE FUNCTION guard_trainer_expense() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND audited_trainer_reset() THEN RETURN OLD; END IF;
  IF EXISTS (SELECT 1 FROM "TrainerPayout" WHERE "expenseId" = OLD.id AND status = 'PAID') THEN
    IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'archivedAt') = (to_jsonb(OLD) - 'archivedAt') THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Выплаченная ведомость неизменяема' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Expense_trainer_guard" BEFORE UPDATE OR DELETE ON "Expense" FOR EACH ROW EXECUTE FUNCTION guard_trainer_expense();

CREATE OR REPLACE FUNCTION immutable_financial_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' AND TG_TABLE_NAME IN ('MonthlyFinancialClosing','RevenueRecognition','FinancialPeriodClosing') AND audited_trainer_reset() THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Финансовые проводки и закрытия неизменяемы' USING ERRCODE = '23514';
END $$;
-- Audit legacy closing endpoints too, with a snapshot in the closing transaction.
CREATE FUNCTION audit_monthly_financial_close() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "CashAuditLog" (id,"requestId",action,"actorId","actorName",details)
    SELECT gen_random_uuid(),gen_random_uuid(),'MONTH_CLOSED',u.id,u.email,to_jsonb(NEW) FROM "User" u WHERE u.id=NEW."closedById";
  RETURN NEW;
END $$;
CREATE TRIGGER "MonthlyFinancialClosing_audit" AFTER INSERT ON "MonthlyFinancialClosing" FOR EACH ROW EXECUTE FUNCTION audit_monthly_financial_close();
COMMIT;
