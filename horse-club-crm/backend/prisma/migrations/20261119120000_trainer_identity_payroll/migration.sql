-- Additive migration: preserve all statements, lessons, accounts and expenses.
BEGIN;
LOCK TABLE "TrainerPayout", "User", "Trainer", "StaffProfile" IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE "TrainerPayout" ADD COLUMN "trainerId" uuid;
ALTER TABLE "TrainerPayout" ALTER COLUMN "staffId" DROP NOT NULL;
ALTER TABLE "TrainerPayout" ADD CONSTRAINT "TrainerPayout_trainerId_fkey"
 FOREIGN KEY ("trainerId") REFERENCES "Trainer"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Trainer has no email column. Match StaffProfile name / normalized phone only.
-- Consider ALL matches (including claimed trainers); bind only mutually unique pairs.
WITH candidates AS (
 SELECT DISTINCT u.id AS uid, t.id AS tid
 FROM "User" u JOIN "StaffProfile" s ON s."userId" = u.id
 JOIN "Trainer" t ON (
   (length(regexp_replace(coalesce(s.phone,''), '[^0-9]', '', 'g')) >= 10
    AND right(regexp_replace(s.phone, '[^0-9]', '', 'g'),10) = right(regexp_replace(coalesce(t.phone,''), '[^0-9]', '', 'g'),10))
   OR (length(trim(s."fullName")) > 0 AND
     (lower(regexp_replace(trim(s."fullName"), '\s+', ' ', 'g')) = lower(regexp_replace(trim(t.name), '\s+', ' ', 'g'))
      OR lower(regexp_replace(trim(s."fullName"), '\s+', ' ', 'g')) = lower(regexp_replace(trim(t."fullName"), '\s+', ' ', 'g')))))
 WHERE u.role = 'TRAINER' AND u."trainerId" IS NULL
), unique_pairs AS (
 SELECT uid, tid FROM candidates c WHERE
 (SELECT count(*) FROM candidates WHERE uid=c.uid)=1 AND
 (SELECT count(*) FROM candidates WHERE tid=c.tid)=1
)
UPDATE "User" u SET "trainerId"=m.tid, "tokenVersion"=u."tokenVersion"+1
 FROM unique_pairs m WHERE u.id=m.uid
 AND NOT EXISTS (SELECT 1 FROM "User" claimed WHERE claimed."trainerId"=m.tid);

-- Paid rows and closed periods are immutable in normal operation. Disable only this
-- table's business guard for the identity backfill inside the locked transaction.
ALTER TABLE "TrainerPayout" DISABLE TRIGGER "TrainerPayout_guard";
UPDATE "TrainerPayout" p SET "trainerId"=u."trainerId"
 FROM "StaffProfile" s JOIN "User" u ON u.id=s."userId"
 WHERE p."staffId"=s.id AND u."trainerId" IS NOT NULL;
ALTER TABLE "TrainerPayout" ENABLE TRIGGER "TrainerPayout_guard";
CREATE UNIQUE INDEX "TrainerPayout_trainerId_type_periodStart_periodEnd_key"
 ON "TrainerPayout"("trainerId",type,"periodStart","periodEnd");
CREATE INDEX "TrainerPayout_trainerId_month_status_idx" ON "TrainerPayout"("trainerId",month,status);
CREATE OR REPLACE FUNCTION guard_trainer_statement() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF NEW."trainerId" IS NULL THEN
    RAISE EXCEPTION 'Историческая ведомость требует привязки тренера' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW."trainerId" IS DISTINCT FROM OLD."trainerId" OR NEW."staffId" IS DISTINCT FROM OLD."staffId") THEN
    RAISE EXCEPTION 'Нельзя изменить получателя ведомости' USING ERRCODE = '23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."trainerId"::text, 0));
  IF EXISTS (SELECT 1 FROM "PayrollCalculation" pc JOIN "StaffProfile" s ON s.id=pc."staffId"
      JOIN "User" u ON u.id=s."userId" WHERE (u."trainerId"=NEW."trainerId" OR pc."staffId"=NEW."staffId") AND "isPaid"
      AND pc."periodStart" <= NEW."periodEnd" AND pc."periodEnd" >= NEW."periodStart")
    OR EXISTS (SELECT 1 FROM "TrainerPayout" p WHERE p.id <> NEW.id AND (p."trainerId" = NEW."trainerId" OR (p."trainerId" IS NULL AND p."staffId" IN
        (SELECT s.id FROM "StaffProfile" s JOIN "User" u ON u.id=s."userId" WHERE u."trainerId"=NEW."trainerId"))) AND p.month = NEW.month AND p.status = 'PAID'
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
CREATE OR REPLACE FUNCTION guard_legacy_payroll_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND audited_trainer_reset() THEN RETURN OLD; END IF;
  IF TG_OP <> 'INSERT' THEN PERFORM assert_payroll_month_open(OLD."periodStart", OLD."periodEnd"); END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  PERFORM assert_payroll_month_open(NEW."periodStart", NEW."periodEnd");
  PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(
    (SELECT u."trainerId"::text FROM "StaffProfile" s JOIN "User" u ON u.id=s."userId" WHERE s.id=NEW."staffId"), NEW."staffId"::text), 0));
  IF EXISTS (SELECT 1 FROM "TrainerPayout" p WHERE (p."staffId" = NEW."staffId" OR p."trainerId" =
      (SELECT u."trainerId" FROM "StaffProfile" s JOIN "User" u ON u.id=s."userId" WHERE s.id=NEW."staffId")) AND p.status = 'PAID'
      AND p."periodStart" <= NEW."periodEnd" AND p."periodEnd" >= NEW."periodStart") THEN
    RAISE EXCEPTION 'Период уже оплачен' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION guard_workshift_financial_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND audited_trainer_reset() THEN RETURN OLD; END IF;
  IF TG_OP <> 'INSERT' THEN
    PERFORM assert_financial_period_open(OLD.date::timestamp AT TIME ZONE 'Europe/Moscow');
    IF EXISTS (SELECT 1 FROM "TrainerPayout" p WHERE (p."staffId" = OLD."staffId" OR p."trainerId" =
      (SELECT u."trainerId" FROM "StaffProfile" s JOIN "User" u ON u.id=s."userId" WHERE s.id=OLD."staffId")) AND p.status = 'PAID' AND OLD.date BETWEEN p."periodStart" AND p."periodEnd") THEN
      RAISE EXCEPTION 'Период уже оплачен' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  PERFORM assert_financial_period_open(NEW.date::timestamp AT TIME ZONE 'Europe/Moscow');
  IF EXISTS (SELECT 1 FROM "TrainerPayout" p WHERE (p."staffId" = NEW."staffId" OR p."trainerId" =
      (SELECT u."trainerId" FROM "StaffProfile" s JOIN "User" u ON u.id=s."userId" WHERE s.id=NEW."staffId")) AND p.status = 'PAID' AND NEW.date BETWEEN p."periodStart" AND p."periodEnd") THEN
    RAISE EXCEPTION 'Период уже оплачен' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
-- Legacy staff payrolls derive their trainer from User. Keep that historical
-- identity stable until a dedicated audited reconciliation is performed.
CREATE FUNCTION guard_paid_legacy_trainer_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."trainerId" IS NOT NULL AND NEW."trainerId" IS DISTINCT FROM OLD."trainerId"
    AND EXISTS (SELECT 1 FROM "PayrollCalculation" p JOIN "StaffProfile" s ON s.id=p."staffId"
      WHERE s."userId"=OLD.id AND p."isPaid") THEN
    RAISE EXCEPTION 'У сотрудника есть оплаченные ведомости. Требуется сверка привязки тренера' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "User_paid_legacy_trainer_binding" BEFORE UPDATE OF "trainerId" ON "User"
  FOR EACH ROW EXECUTE FUNCTION guard_paid_legacy_trainer_binding();
COMMIT;
