BEGIN;

-- CreateEnum
CREATE TYPE "VetEventType" AS ENUM ('vaccination', 'deworming', 'shoeing', 'vet_check', 'dentist');

-- CreateEnum
CREATE TYPE "VetEventStatus" AS ENUM ('scheduled', 'completed', 'overdue');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "boardingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LedgerTransaction" ADD COLUMN     "billingMonth" TEXT,
ADD COLUMN     "boardingContractId" UUID,
ADD COLUMN     "boardingDailyLogId" UUID,
ADD COLUMN     "sourcePaymentId" UUID;

-- CreateTable
CREATE TABLE "BoardingDailyLog" (
    "id" UUID NOT NULL,
    "horseId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "serviceType" TEXT NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL,
    "performedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT,
    "notes" TEXT,
    "requestId" UUID NOT NULL,

    CONSTRAINT "BoardingDailyLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VetEvent" (
    "id" UUID NOT NULL,
    "horseId" UUID NOT NULL,
    "type" "VetEventType" NOT NULL,
    "eventDate" TIMESTAMPTZ(6) NOT NULL,
    "nextDueDate" TIMESTAMPTZ(6),
    "performedBy" TEXT,
    "notes" TEXT,
    "status" "VetEventStatus" NOT NULL DEFAULT 'scheduled',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceHealthLogId" UUID,
    "predecessorId" UUID,

    CONSTRAINT "VetEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoardingDailyLog_requestId_key" ON "BoardingDailyLog"("requestId");

-- CreateIndex
CREATE INDEX "BoardingDailyLog_horseId_performedAt_idx" ON "BoardingDailyLog"("horseId", "performedAt");

-- CreateIndex
CREATE INDEX "BoardingDailyLog_clientId_performedAt_idx" ON "BoardingDailyLog"("clientId", "performedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VetEvent_sourceHealthLogId_key" ON "VetEvent"("sourceHealthLogId");

-- CreateIndex
CREATE UNIQUE INDEX "VetEvent_predecessorId_key" ON "VetEvent"("predecessorId");

-- CreateIndex
CREATE INDEX "VetEvent_status_eventDate_idx" ON "VetEvent"("status", "eventDate");

-- CreateIndex
CREATE INDEX "VetEvent_horseId_eventDate_idx" ON "VetEvent"("horseId", "eventDate");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_boardingDailyLogId_key" ON "LedgerTransaction"("boardingDailyLogId");

-- CreateIndex
CREATE INDEX "LedgerTransaction_boardingContractId_createdAt_idx" ON "LedgerTransaction"("boardingContractId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_boardingContractId_billingMonth_key" ON "LedgerTransaction"("boardingContractId", "billingMonth");

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_boardingContractId_fkey" FOREIGN KEY ("boardingContractId") REFERENCES "BoardingContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_boardingDailyLogId_fkey" FOREIGN KEY ("boardingDailyLogId") REFERENCES "BoardingDailyLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_sourcePaymentId_fkey" FOREIGN KEY ("sourcePaymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardingDailyLog" ADD CONSTRAINT "BoardingDailyLog_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardingDailyLog" ADD CONSTRAINT "BoardingDailyLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VetEvent" ADD CONSTRAINT "VetEvent_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "VetEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VetEvent" ADD CONSTRAINT "VetEvent_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BoardingDailyLog" ADD CONSTRAINT "BoardingDailyLog_cost_check" CHECK (cost >= 0);
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_billing_month_check"
  CHECK ("billingMonth" IS NULL OR ("boardingContractId" IS NOT NULL AND "billingMonth" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND "transactionType" = 'boarding_charge'));

-- The boarding account is monetary and independent of lesson/deposit memberships.
CREATE FUNCTION sync_boarding_balance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND (OLD."boardingContractId" IS NOT NULL OR OLD."boardingDailyLogId" IS NOT NULL) THEN
    UPDATE "Client" SET "boardingBalance" = "boardingBalance" - OLD.amount WHERE id = OLD."clientId";
  END IF;
  IF TG_OP <> 'DELETE' AND (NEW."boardingContractId" IS NOT NULL OR NEW."boardingDailyLogId" IS NOT NULL) THEN
    UPDATE "Client" SET "boardingBalance" = "boardingBalance" + NEW.amount WHERE id = NEW."clientId";
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER "LedgerTransaction_boarding_balance" AFTER INSERT OR UPDATE OR DELETE ON "LedgerTransaction"
FOR EACH ROW EXECUTE FUNCTION sync_boarding_balance();

-- Receipts credit the account; edits/refunds append compensating entries.
CREATE FUNCTION project_boarding_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD."boardingContractId", OLD."clientId", OLD.amount, OLD.status)
    IS NOT DISTINCT FROM (NEW."boardingContractId", NEW."clientId", NEW.amount, NEW.status) THEN RETURN NULL; END IF;
  PERFORM id FROM "Client" WHERE id IN
    (CASE WHEN TG_OP <> 'INSERT' THEN OLD."clientId" END, CASE WHEN TG_OP <> 'DELETE' THEN NEW."clientId" END)
    ORDER BY id FOR UPDATE;
  IF TG_OP <> 'INSERT' AND OLD."boardingContractId" IS NOT NULL AND OLD.status = 'PAID' THEN
    INSERT INTO "LedgerTransaction" (id,"clientId","boardingContractId","transactionType",amount,description,"sourcePaymentId")
    VALUES (gen_random_uuid(),OLD."clientId",OLD."boardingContractId",'refund',-OLD.amount,'Возврат / корректировка оплаты постоя',CASE WHEN TG_OP <> 'DELETE' THEN OLD.id END);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW."boardingContractId" IS NOT NULL AND NEW.status = 'PAID' THEN
    INSERT INTO "LedgerTransaction" (id,"clientId","boardingContractId","transactionType",amount,description,"sourcePaymentId")
    VALUES (gen_random_uuid(),NEW."clientId",NEW."boardingContractId",'purchase',NEW.amount,'Оплата постоя',NEW.id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER "Payment_boarding_ledger" AFTER INSERT OR UPDATE OR DELETE ON "Payment"
FOR EACH ROW EXECUTE FUNCTION project_boarding_payment();

-- Existing private placements used a client on the contract before ownerType existed.
UPDATE "Horse" h SET "ownerType"='private', "ownerId"=b."clientId"
FROM "BoardingContract" b WHERE h.id=b."horseId" AND h."ownerId" IS NULL
  AND b."clientId" IS NOT NULL AND b.status IN ('ACTIVE','SUSPENDED')
  AND b."startsAt" <= now() AND (b."endsAt" IS NULL OR b."endsAt">now());

-- Preserve the first-month receivable already issued by the old contract API.
INSERT INTO "LedgerTransaction" (id,"clientId","boardingContractId","billingMonth","transactionType",amount,description)
SELECT gen_random_uuid(), b."clientId", b.id, to_char(b."startsAt" AT TIME ZONE 'Europe/Moscow','YYYY-MM'),
  'boarding_charge', -invoice.amount, 'Постой: ранее выставленный первый месяц'
FROM "BoardingContract" b JOIN LATERAL (SELECT p.amount FROM "Payment" p
  WHERE p."boardingContractId"=b.id AND p.description='Начисление за первый месяц постоя' AND p.status<>'CANCELLED'
  ORDER BY p."createdAt",p.id LIMIT 1) invoice ON true WHERE b."clientId" IS NOT NULL AND invoice.amount>0
ON CONFLICT ("boardingContractId","billingMonth") DO NOTHING;
INSERT INTO "LedgerTransaction" (id,"clientId","boardingContractId","transactionType",amount,description,"sourcePaymentId","createdAt")
SELECT gen_random_uuid(), p."clientId",p."boardingContractId",'purchase',p.amount,'Оплата постоя до перехода на общий журнал',p.id,coalesce(p."paidAt",p."createdAt")
FROM "Payment" p WHERE p."boardingContractId" IS NOT NULL AND p.status='PAID';

CREATE FUNCTION refresh_horse_vet_dates() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE horse_id uuid;
BEGIN
  horse_id := CASE WHEN TG_OP='DELETE' THEN OLD."horseId" ELSE NEW."horseId" END;
  UPDATE "Horse" SET
    "nextShoeingDate"=(SELECT min("eventDate") FROM "VetEvent" WHERE "horseId"=horse_id AND type='shoeing' AND status<>'completed'),
    "lastVetCheckAt"=(SELECT max("eventDate") FROM "VetEvent" WHERE "horseId"=horse_id AND type='vet_check' AND status='completed')
  WHERE id=horse_id;
  IF TG_OP='UPDATE' AND OLD."horseId"<>NEW."horseId" THEN
    UPDATE "Horse" SET
      "nextShoeingDate"=(SELECT min("eventDate") FROM "VetEvent" WHERE "horseId"=OLD."horseId" AND type='shoeing' AND status<>'completed'),
      "lastVetCheckAt"=(SELECT max("eventDate") FROM "VetEvent" WHERE "horseId"=OLD."horseId" AND type='vet_check' AND status='completed')
    WHERE id=OLD."horseId";
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER "VetEvent_horse_dates" AFTER INSERT OR UPDATE OR DELETE ON "VetEvent"
FOR EACH ROW EXECUTE FUNCTION refresh_horse_vet_dates();

-- Legacy health entries remain editable through their original API and are projected.
CREATE FUNCTION project_horse_health_log() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind "VetEventType"; event_id uuid;
BEGIN
  kind := CASE NEW.type WHEN 'VACCINATION' THEN 'vaccination' WHEN 'FARRIER' THEN 'shoeing'
    WHEN 'DEWORMING' THEN 'deworming' ELSE 'vet_check' END;
  INSERT INTO "VetEvent" (id,"horseId",type,"eventDate","nextDueDate",notes,status,"sourceHealthLogId")
  VALUES (NEW.id,NEW."horseId",kind,NEW."occurredAt",NEW."nextDueAt",NEW.notes,'completed',NEW.id)
  ON CONFLICT ("sourceHealthLogId") DO UPDATE SET "horseId"=EXCLUDED."horseId", type=EXCLUDED.type,
    "eventDate"=EXCLUDED."eventDate", "nextDueDate"=EXCLUDED."nextDueDate", notes=EXCLUDED.notes
  RETURNING id INTO event_id;
  IF NEW."nextDueAt" IS NOT NULL THEN
    INSERT INTO "VetEvent" (id,"horseId",type,"eventDate",status,"predecessorId")
    VALUES (gen_random_uuid(),NEW."horseId",kind,NEW."nextDueAt",'scheduled',event_id)
    ON CONFLICT ("predecessorId") DO UPDATE SET "horseId"=EXCLUDED."horseId",type=EXCLUDED.type,
      "eventDate"=EXCLUDED."eventDate" WHERE "VetEvent".status<>'completed';
  ELSE
    DELETE FROM "VetEvent" WHERE "predecessorId"=event_id AND status<>'completed';
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER "HorseHealthLog_vet_projection" AFTER INSERT OR UPDATE ON "HorseHealthLog"
FOR EACH ROW EXECUTE FUNCTION project_horse_health_log();
-- Preserve standalone horse dates before recomputing caches from the calendar.
CREATE TEMP TABLE horse_vet_dates_snapshot ON COMMIT DROP AS SELECT id,"nextShoeingDate","lastVetCheckAt" FROM "Horse";
INSERT INTO "VetEvent" (id,"horseId",type,"eventDate",status,notes)
SELECT gen_random_uuid(),h.id,'shoeing',h."nextShoeingDate",'scheduled','Дата из карточки лошади до перехода на календарь'
FROM horse_vet_dates_snapshot h WHERE h."nextShoeingDate" IS NOT NULL AND NOT EXISTS
  (SELECT 1 FROM "HorseHealthLog" l WHERE l."horseId"=h.id AND l.type='FARRIER' AND l."nextDueAt" IS NOT NULL);
INSERT INTO "VetEvent" (id,"horseId",type,"eventDate",status,notes)
SELECT gen_random_uuid(),h.id,'vet_check',h."lastVetCheckAt",'completed','Осмотр из карточки лошади до перехода на календарь'
FROM horse_vet_dates_snapshot h WHERE h."lastVetCheckAt" IS NOT NULL AND NOT EXISTS
  (SELECT 1 FROM "HorseHealthLog" l WHERE l."horseId"=h.id AND l.type='INSPECTION');
-- Invoke projection without altering historical values.
UPDATE "HorseHealthLog" SET notes=notes;

CREATE FUNCTION sync_boarding_horse_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('ACTIVE','SUSPENDED') THEN
    UPDATE "Horse" SET "ownerType"=CASE WHEN NEW."clientId" IS NULL THEN 'club'::"HorseOwnerType" ELSE 'private'::"HorseOwnerType" END,
      "ownerId"=NEW."clientId" WHERE id=NEW."horseId";
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER "BoardingContract_horse_owner" AFTER INSERT OR UPDATE OF "clientId", status, "horseId" ON "BoardingContract"
FOR EACH ROW EXECUTE FUNCTION sync_boarding_horse_owner();

COMMIT;
