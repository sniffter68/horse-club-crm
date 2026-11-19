-- Additive migration: historical amounts and JSON snapshots remain untouched.
ALTER TABLE "Trainer" ADD COLUMN "commissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 30;
ALTER TABLE "Trainer" ADD CONSTRAINT "Trainer_commissionPercent_range" CHECK ("commissionPercent" BETWEEN 0 AND 100);
ALTER TABLE "TrainerPayout" ADD COLUMN "commissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 30;
ALTER TABLE "TrainerPayout" ADD CONSTRAINT "TrainerPayout_commissionPercent_range" CHECK ("commissionPercent" BETWEEN 0 AND 100);
ALTER TABLE "PayrollCalculation" ADD COLUMN "lessonBreakdown" JSONB NOT NULL DEFAULT '[]';

-- Approval freezes the financial snapshot; paying may only change payment metadata.
CREATE FUNCTION guard_approved_trainer_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'APPROVED' AND (
    NEW."commissionPercent" IS DISTINCT FROM OLD."commissionPercent"
    OR NEW."lessonBreakdown" IS DISTINCT FROM OLD."lessonBreakdown"
    OR NEW."nominalBase" IS DISTINCT FROM OLD."nominalBase"
    OR NEW.accrued IS DISTINCT FROM OLD.accrued
    OR NEW."advanceDeducted" IS DISTINCT FROM OLD."advanceDeducted"
    OR NEW."totalAmount" IS DISTINCT FROM OLD."totalAmount"
    OR NEW."lessonsCount" IS DISTINCT FROM OLD."lessonsCount"
    OR NEW.status NOT IN ('APPROVED', 'PAID')
  ) THEN
    RAISE EXCEPTION 'Approved trainer statement snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "TrainerPayout_snapshot_guard" BEFORE UPDATE ON "TrainerPayout"
FOR EACH ROW EXECUTE FUNCTION guard_approved_trainer_snapshot();
