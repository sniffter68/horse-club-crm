BEGIN;
CREATE TABLE "StableBuilding" (
 "id" UUID NOT NULL, "name" TEXT NOT NULL, "order" INTEGER NOT NULL DEFAULT 0,
 "gridRows" INTEGER NOT NULL DEFAULT 10, "gridCols" INTEGER NOT NULL DEFAULT 4,
 "aisleCols" INTEGER[] NOT NULL DEFAULT ARRAY[2,3]::INTEGER[],
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "StableBuilding_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "StableBuilding_grid_positive" CHECK ("gridRows" > 0 AND "gridCols" > 0)
);
CREATE UNIQUE INDEX "StableBuilding_name_key" ON "StableBuilding"("name");
ALTER TABLE "Stall" ADD COLUMN "buildingId" UUID,
 ADD COLUMN "row" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "col" INTEGER NOT NULL DEFAULT 1,
 ADD COLUMN "rowSpan" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "colSpan" INTEGER NOT NULL DEFAULT 1;
INSERT INTO "StableBuilding" ("id", "name", "order") VALUES
 ('00000000-0000-4000-8000-000000000101','Основная конюшня',0),
 ('00000000-0000-4000-8000-000000000102','Летники',1),
 ('00000000-0000-4000-8000-000000000103','Карантин',2);
UPDATE "Stall" SET "buildingId" = CASE "zone"::text
 WHEN 'SUMMER' THEN '00000000-0000-4000-8000-000000000102'::uuid
 WHEN 'QUARANTINE' THEN '00000000-0000-4000-8000-000000000103'::uuid
 ELSE '00000000-0000-4000-8000-000000000101'::uuid END;
WITH ranked AS (
 SELECT "id", row_number() OVER (PARTITION BY "buildingId", "side" ORDER BY "position" NULLS LAST, "createdAt", "id") AS r
 FROM "Stall"
) UPDATE "Stall" s SET "row" = ranked.r, "col" = CASE WHEN s."side"::text = 'RIGHT' THEN 4 ELSE 1 END
FROM ranked WHERE s."id" = ranked."id";
UPDATE "StableBuilding" b SET "gridRows" = GREATEST(10, (SELECT COALESCE(MAX(s."row"),0) FROM "Stall" s WHERE s."buildingId" = b."id"));
-- Empty service numbers are intentionally repeated, so uniqueness applies only to nonempty numbers.
DROP INDEX IF EXISTS "Stall_zone_number_key";
CREATE UNIQUE INDEX "Stall_buildingId_number_key" ON "Stall"("buildingId", "number") WHERE "number" IS NOT NULL AND "number" <> '';
UPDATE "Stall" SET "type" = 'SERVICE', "name" = CASE
 WHEN LOWER(TRIM("name")) IN ('туалет','админ','амуничник') THEN "name" ELSE "number" END, "number" = ''
WHERE LOWER(TRIM("number")) IN ('туалет','админ','амуничник') OR LOWER(TRIM("name")) IN ('туалет','админ','амуничник');
ALTER TABLE "Stall" ADD CONSTRAINT "Stall_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "StableBuilding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Stall_buildingId_idx" ON "Stall"("buildingId");
ALTER TABLE "Stall" ADD CONSTRAINT "Stall_grid_positive" CHECK ("row" > 0 AND "col" > 0 AND "rowSpan" > 0 AND "colSpan" > 0);
COMMIT;
