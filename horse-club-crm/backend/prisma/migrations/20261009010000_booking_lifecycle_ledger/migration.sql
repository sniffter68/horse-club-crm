BEGIN;

-- Reconcile legacy writes since the foundation migration. Preserve canonical
-- deposits and canonical fixed memberships without legacy counters.
UPDATE "Membership" SET "initialUnits" = "totalLessons", "remainingUnits" = "remainedLessons",
  "validTo" = "validUntil", "validFrom" = LEAST("validFrom", "validUntil")
WHERE "type" = 'fixed_lessons' AND "totalLessons" > 0;

CREATE FUNCTION sync_membership_balances() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."type" = 'fixed_lessons' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW."totalLessons" > 0 AND NEW."initialUnits" = 0 THEN
        NEW."initialUnits" := NEW."totalLessons";
        NEW."remainingUnits" := NEW."remainedLessons";
        NEW."validTo" := NEW."validUntil";
        NEW."validFrom" := LEAST(NEW."validFrom", NEW."validTo");
      ELSE
        IF (NEW."totalLessons" <> 0 AND NEW."totalLessons" <> NEW."initialUnits") OR
           (NEW."remainedLessons" <> 0 AND NEW."remainedLessons" <> NEW."remainingUnits") THEN
          RAISE EXCEPTION 'Conflicting membership counters' USING ERRCODE = '23514';
        END IF;
        NEW."totalLessons" := NEW."initialUnits";
        NEW."remainedLessons" := NEW."remainingUnits";
        NEW."validUntil" := NEW."validTo";
      END IF;
    ELSE
      IF NEW."remainingUnits" IS DISTINCT FROM OLD."remainingUnits" AND NEW."remainedLessons" IS DISTINCT FROM OLD."remainedLessons" AND NEW."remainingUnits" <> NEW."remainedLessons" THEN
        RAISE EXCEPTION 'Conflicting membership counters' USING ERRCODE = '23514';
      ELSIF NEW."remainedLessons" IS DISTINCT FROM OLD."remainedLessons" THEN NEW."remainingUnits" := NEW."remainedLessons";
      ELSE NEW."remainedLessons" := NEW."remainingUnits"; END IF;
      IF NEW."initialUnits" IS DISTINCT FROM OLD."initialUnits" AND NEW."totalLessons" IS DISTINCT FROM OLD."totalLessons" AND NEW."initialUnits" <> NEW."totalLessons" THEN
        RAISE EXCEPTION 'Conflicting membership initial counters' USING ERRCODE = '23514';
      ELSIF NEW."totalLessons" IS DISTINCT FROM OLD."totalLessons" THEN NEW."initialUnits" := NEW."totalLessons";
      ELSE NEW."totalLessons" := NEW."initialUnits"; END IF;
    END IF;
    IF trunc(NEW."remainingUnits") <> NEW."remainingUnits" OR trunc(NEW."initialUnits") <> NEW."initialUnits" THEN
      RAISE EXCEPTION 'Fixed lesson units must be whole numbers' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."validTo" IS DISTINCT FROM OLD."validTo" AND NEW."validUntil" IS DISTINCT FROM OLD."validUntil" AND NEW."validTo" <> NEW."validUntil" THEN
      RAISE EXCEPTION 'Conflicting membership validity' USING ERRCODE = '23514';
    ELSIF NEW."validUntil" IS DISTINCT FROM OLD."validUntil" THEN NEW."validTo" := NEW."validUntil";
    ELSE NEW."validUntil" := NEW."validTo"; END IF;
  ELSIF NEW."type" <> 'fixed_lessons' THEN NEW."validUntil" := NEW."validTo";
  END IF;
  IF NEW."status" <> 'frozen' THEN
    NEW."status" := CASE WHEN NEW."validTo" < CURRENT_TIMESTAMP THEN 'expired'::"MembershipStatus"
      WHEN NEW."remainingUnits" <= 0 THEN 'exhausted'::"MembershipStatus" ELSE 'active'::"MembershipStatus" END;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Membership_sync_balances" BEFORE INSERT OR UPDATE ON "Membership"
  FOR EACH ROW EXECUTE FUNCTION sync_membership_balances();

-- Use the source operation UUID as a stable projection identity. Original
-- MembershipOp rows stay unchanged, including records without a known client.
CREATE FUNCTION project_membership_operation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id uuid; booking_id uuid;
BEGIN
  SELECT "clientId" INTO owner_id FROM "Membership" WHERE "id" = NEW."membershipId";
  IF owner_id IS NULL THEN RETURN NEW; END IF;
  SELECT "id" INTO booking_id FROM "Booking" WHERE "lessonId" = NEW."lessonId" AND "membershipId" = NEW."membershipId" AND "clientId" = owner_id ORDER BY "createdAt", "id" LIMIT 1;
  INSERT INTO "LedgerTransaction" ("id", "clientId", "bookingId", "membershipId", "transactionType", "amount", "description", "createdAt", "sourceMembershipOpId")
  VALUES (NEW."id", owner_id, booking_id, NEW."membershipId",
    CASE WHEN NEW."type" = 'CREDIT' THEN 'purchase'::"TransactionType" WHEN NEW."type" = 'REFUND' THEN 'refund'::"TransactionType" ELSE 'usage'::"TransactionType" END,
    CASE WHEN NEW."type" = 'DEBIT' THEN -NEW."amount" ELSE NEW."amount" END, NEW."reason", NEW."createdAt", NEW."id")
  ON CONFLICT ("sourceMembershipOpId") DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER "MembershipOp_project_ledger" AFTER INSERT ON "MembershipOp"
  FOR EACH ROW EXECUTE FUNCTION project_membership_operation();

INSERT INTO "LedgerTransaction" ("id", "clientId", "bookingId", "membershipId", "transactionType", "amount", "description", "createdAt", "sourceMembershipOpId")
SELECT o."id", m."clientId", (SELECT b."id" FROM "Booking" b WHERE b."lessonId" = o."lessonId" AND b."membershipId" = m."id" AND b."clientId" = m."clientId" ORDER BY b."createdAt", b."id" LIMIT 1),
  m."id", CASE WHEN o."type" = 'CREDIT' THEN 'purchase'::"TransactionType" WHEN o."type" = 'REFUND' THEN 'refund'::"TransactionType" ELSE 'usage'::"TransactionType" END,
  CASE WHEN o."type" = 'DEBIT' THEN -o."amount" ELSE o."amount" END, o."reason", o."createdAt", o."id"
FROM "MembershipOp" o JOIN "Membership" m ON m."id" = o."membershipId" WHERE m."clientId" IS NOT NULL
ON CONFLICT ("sourceMembershipOpId") DO NOTHING;

-- A standalone booking has a single billable outcome, regardless of outcome
-- type. Projected legacy debit/refund history is explicitly outside this guard.
CREATE UNIQUE INDEX "LedgerTransaction_booking_charge_key" ON "LedgerTransaction" ("bookingId")
  WHERE "sourceMembershipOpId" IS NULL AND "bookingId" IS NOT NULL AND "transactionType" IN ('usage', 'penalty_cancellation');
COMMIT;
