BEGIN;
CREATE TYPE "TrainerPayScheme" AS ENUM ('LEGACY', 'PERCENT', 'FIXED', 'CLUB');
ALTER TABLE "Trainer" ADD COLUMN "payScheme" "TrainerPayScheme" NOT NULL DEFAULT 'LEGACY',
 ADD COLUMN "fixedPay" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Trainer" ADD CONSTRAINT "Trainer_fixedPay_range" CHECK ("fixedPay" >= 0);

ALTER TABLE "TrainerPayout" ADD COLUMN "payScheme" "TrainerPayScheme" NOT NULL DEFAULT 'LEGACY',
 ADD COLUMN "fixedPay" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "TrainerPayout" ADD CONSTRAINT "TrainerPayout_fixedPay_range" CHECK ("fixedPay" >= 0);
CREATE FUNCTION guard_approved_trainer_rate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status='APPROVED' AND (NEW."payScheme" IS DISTINCT FROM OLD."payScheme" OR NEW."fixedPay" IS DISTINCT FROM OLD."fixedPay") THEN
  RAISE EXCEPTION 'Approved trainer rate snapshot is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "TrainerPayout_rate_snapshot_guard" BEFORE UPDATE ON "TrainerPayout"
 FOR EACH ROW EXECUTE FUNCTION guard_approved_trainer_rate();

-- May be called again explicitly. Never merge people or rewrite lesson/payroll IDs.
CREATE PROCEDURE sync_staff_trainers() LANGUAGE plpgsql AS $$
DECLARE t "Trainer"; uid uuid; matches uuid[];
BEGIN
 LOCK TABLE "User", "Trainer", "StaffProfile" IN SHARE ROW EXCLUSIVE MODE;
 FOR t IN SELECT * FROM "Trainer" ORDER BY id LOOP
   SELECT id INTO uid FROM "User" WHERE "trainerId"=t.id;
   IF uid IS NULL THEN
     SELECT array_agg(u.id) INTO matches FROM "User" u LEFT JOIN "StaffProfile" s ON s."userId"=u.id
     WHERE u.role='TRAINER' AND u."trainerId" IS NULL AND (
       u."vkId"=t."vkId"::text
       OR (length(trim(s."fullName"))>0 AND lower(trim(s."fullName")) IN (lower(trim(t.name)),lower(trim(t."fullName"))))
       OR (s.phone IS NOT NULL AND s.phone=t.phone));
     IF cardinality(matches)>1 THEN RAISE EXCEPTION 'Ambiguous staff for trainer %. Resolve identity before sync.', t.id; END IF;
     uid := matches[1];
     IF uid IS NOT NULL THEN
       IF (SELECT count(*) FROM "Trainer" other WHERE other.id<>t.id AND
         (lower(trim(other.name)) IN (lower(trim(t.name)),lower(trim(t."fullName")))
          OR (t.phone IS NOT NULL AND other.phone=t.phone)))>0 THEN
         RAISE EXCEPTION 'Ambiguous trainer %. Resolve identity before sync.',t.id;
       END IF;
       UPDATE "User" SET "trainerId"=t.id,"tokenVersion"="tokenVersion"+1 WHERE id=uid;
     ELSE
       uid := gen_random_uuid();
       INSERT INTO "User" (id,email,"passwordHash",role,"trainerId","crmAccess","updatedAt")
       VALUES (uid,'staff-'||uid||'@staff.invalid',gen_random_uuid()::text,'TRAINER',t.id,false,now());
     END IF;
   END IF;
   INSERT INTO "StaffProfile" (id,"userId","fullName","roleTitle",phone,"scheduleColor","isActive","updatedAt")
   VALUES (gen_random_uuid(),uid,coalesce(nullif(t."fullName",''),t.name),'Тренер',t.phone,t."scheduleColor",t."isActive",now())
   ON CONFLICT ("userId") DO NOTHING;
   -- Conflicting nonempty VK identities require explicit reconciliation.
   IF EXISTS (SELECT 1 FROM "User" WHERE id=uid AND "vkId" IS NOT NULL AND t."vkId" IS NOT NULL AND "vkId"<>t."vkId"::text) THEN
     RAISE EXCEPTION 'Conflicting VK identities for trainer %',t.id;
   END IF;
   IF EXISTS (SELECT 1 FROM "Client" c WHERE c."vkId"=coalesce(t."vkId"::text,(SELECT "vkId" FROM "User" WHERE id=uid))
     OR c."vkUserId"=coalesce(t."vkId",(SELECT "vkUserId" FROM "User" WHERE id=uid))) THEN
     RAISE EXCEPTION 'VK identity is also bound to a client for trainer %',t.id;
   END IF;
   UPDATE "User" SET "vkId"=coalesce("vkId",t."vkId"::text),"vkUserId"=coalesce("vkUserId",t."vkId") WHERE id=uid;
   UPDATE "Trainer" SET "vkId"=coalesce(t."vkId",(SELECT "vkId"::bigint FROM "User" WHERE id=uid)),
     "isActive"=t."isActive" AND (SELECT "isActive" FROM "StaffProfile" WHERE "userId"=uid) AND (SELECT role='TRAINER' FROM "User" WHERE id=uid),
     "isPublic"=t."isPublic" AND t."isActive" AND (SELECT "isActive" FROM "StaffProfile" WHERE "userId"=uid) AND (SELECT role='TRAINER' FROM "User" WHERE id=uid)
   WHERE id=t.id;
 END LOOP;
END $$;
CALL sync_staff_trainers();
COMMIT;
