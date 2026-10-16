CREATE TYPE "HorseSex" AS ENUM ('STALLION', 'MARE', 'GELDING');
CREATE TYPE "StallZone" AS ENUM ('MAIN', 'SUMMER', 'QUARANTINE');
CREATE TYPE "StallSide" AS ENUM ('LEFT', 'RIGHT');
CREATE TYPE "StallStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'QUARANTINE');
ALTER TABLE "Horse" ADD COLUMN "sex" "HorseSex", ADD COLUMN "birthYear" INTEGER;
ALTER TABLE "Stall" ADD COLUMN "number" TEXT, ADD COLUMN "zone" "StallZone" NOT NULL DEFAULT 'MAIN',
 ADD COLUMN "side" "StallSide" NOT NULL DEFAULT 'LEFT', ADD COLUMN "position" INTEGER,
 ADD COLUMN "status" "StallStatus" NOT NULL DEFAULT 'AVAILABLE', ADD COLUMN "horseId" UUID, ADD COLUMN "notes" TEXT;
WITH ordered AS (SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS n FROM "Stall")
UPDATE "Stall" s SET "number" = ordered.n::text, "position" = ((ordered.n + 1)/2)::integer,
 "side" = CASE WHEN ordered.n % 2 = 1 THEN 'LEFT'::"StallSide" ELSE 'RIGHT'::"StallSide" END,
 "status" = CASE WHEN s."isUnavailable" THEN 'MAINTENANCE'::"StallStatus" ELSE 'AVAILABLE'::"StallStatus" END
FROM ordered WHERE ordered."id" = s."id";
-- Import only unambiguous currently active placements; contracts remain financial records.
WITH placements AS (
 SELECT "stallId", "horseId", count(*) OVER (PARTITION BY "stallId") sc, count(*) OVER (PARTITION BY "horseId") hc
 FROM "BoardingContract" WHERE "status" = 'ACTIVE' AND "stallId" IS NOT NULL
 AND "startsAt" <= now() AND ("endsAt" IS NULL OR "endsAt" > now())
)
UPDATE "Stall" s SET "horseId" = p."horseId", "status" = 'OCCUPIED' FROM placements p
WHERE p."stallId" = s."id" AND p.sc = 1 AND p.hc = 1 AND NOT s."isUnavailable";
INSERT INTO "Stall" ("id", "name", "number", "zone", "side", "position", "updatedAt")
SELECT ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
 CASE WHEN n <= 12 THEN 'Денник ' || n ELSE 'Летник ' || (n-12) END,
 CASE WHEN n <= 12 THEN n::text ELSE 'Л-' || (n-12) END,
 CASE WHEN n <= 12 THEN 'MAIN'::"StallZone" ELSE 'SUMMER'::"StallZone" END,
 CASE WHEN n % 2 = 1 THEN 'LEFT'::"StallSide" ELSE 'RIGHT'::"StallSide" END,
 CASE WHEN n <= 12 THEN (n+1)/2 ELSE (n-11)/2 END, now()
FROM generate_series(1,16) n WHERE NOT EXISTS (SELECT 1 FROM "Stall");
CREATE UNIQUE INDEX "Stall_horseId_key" ON "Stall"("horseId");
CREATE UNIQUE INDEX "Stall_zone_side_position_key" ON "Stall"("zone", "side", "position");
CREATE UNIQUE INDEX "Stall_zone_number_key" ON "Stall"("zone", "number");
ALTER TABLE "Stall" ADD CONSTRAINT "Stall_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Stall" ADD CONSTRAINT "Stall_position_positive" CHECK ("position" IS NULL OR "position" > 0);
ALTER TABLE "Stall" ADD CONSTRAINT "Stall_occupancy_consistent" CHECK (("horseId" IS NOT NULL) = ("status" = 'OCCUPIED'));
