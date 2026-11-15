-- Safe on installations where the emergency name patch is already applied.
ALTER TABLE "Stall" ALTER COLUMN "name" DROP NOT NULL;
DROP INDEX IF EXISTS "Stall_name_key";
DO $$ BEGIN
  CREATE TYPE "StallType" AS ENUM ('STALL', 'PONY_PEN', 'SERVICE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "Stall" ADD COLUMN IF NOT EXISTS "type" "StallType" NOT NULL DEFAULT 'STALL';
