-- DropIndex
DROP INDEX "MembershipOp_membershipId_lessonId_type_key";

-- AlterTable
ALTER TABLE "LedgerTransaction" ADD COLUMN     "ownerClientId" UUID;

-- AlterTable
ALTER TABLE "MembershipOp" ADD COLUMN     "attendeeClientId" UUID,
ADD COLUMN     "ownerClientId" UUID;

-- CreateTable
CREATE TABLE "MembershipMember" (
    "id" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID NOT NULL,

    CONSTRAINT "MembershipMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MembershipMember_clientId_idx" ON "MembershipMember"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipMember_membershipId_clientId_key" ON "MembershipMember"("membershipId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipOp_membershipId_lessonId_type_attendeeClientId_key" ON "MembershipOp"("membershipId", "lessonId", "type", "attendeeClientId");

-- AddForeignKey
ALTER TABLE "MembershipMember" ADD CONSTRAINT "MembershipMember_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipMember" ADD CONSTRAINT "MembershipMember_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Retain identity and uniqueness for historical operations without a beneficiary.
UPDATE "MembershipOp" o SET "ownerClientId" = m."clientId" FROM "Membership" m WHERE o."membershipId" = m."id";
UPDATE "LedgerTransaction" t SET "ownerClientId" = m."clientId" FROM "Membership" m WHERE t."membershipId" = m."id";
UPDATE "MembershipOp" SET "attendeeClientId" = "ownerClientId" WHERE "type" IN ('DEBIT', 'REFUND') AND "ownerClientId" IS NOT NULL;
CREATE UNIQUE INDEX "MembershipOp_legacy_lesson_type_key" ON "MembershipOp" ("membershipId", "lessonId", "type") WHERE "attendeeClientId" IS NULL;

CREATE OR REPLACE FUNCTION project_membership_operation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id uuid; attendee_id uuid; booking_id uuid;
BEGIN
  SELECT "clientId" INTO owner_id FROM "Membership" WHERE "id" = NEW."membershipId";
  owner_id := COALESCE(NEW."ownerClientId", owner_id);
  attendee_id := COALESCE(NEW."attendeeClientId", owner_id);
  IF attendee_id IS NULL THEN RETURN NEW; END IF;
  SELECT "id" INTO booking_id FROM "Booking" WHERE "lessonId" = NEW."lessonId" AND "membershipId" = NEW."membershipId" AND "clientId" = attendee_id ORDER BY "createdAt", "id" LIMIT 1;
  INSERT INTO "LedgerTransaction" ("id", "clientId", "ownerClientId", "bookingId", "membershipId", "transactionType", "amount", "description", "createdAt", "sourceMembershipOpId")
  VALUES (NEW."id", attendee_id, owner_id, booking_id, NEW."membershipId",
    CASE WHEN NEW."type" = 'CREDIT' THEN 'purchase'::"TransactionType" WHEN NEW."type" = 'REFUND' THEN 'refund'::"TransactionType" ELSE 'usage'::"TransactionType" END,
    CASE WHEN NEW."type" = 'DEBIT' THEN -NEW."amount" ELSE NEW."amount" END, NEW."reason", NEW."createdAt", NEW."id")
  ON CONFLICT ("sourceMembershipOpId") DO NOTHING;
  RETURN NEW;
END $$;
