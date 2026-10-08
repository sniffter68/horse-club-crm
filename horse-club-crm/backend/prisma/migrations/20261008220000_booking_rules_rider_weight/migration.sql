BEGIN;
ALTER TABLE "Client" ADD COLUMN "weightKg" DECIMAL(5,2);
ALTER TABLE "Client" ADD CONSTRAINT "Client_weight_check"
  CHECK ("weightKg" IS NULL OR ("weightKg" > 0 AND "weightKg" <= 999.99));
COMMIT;
