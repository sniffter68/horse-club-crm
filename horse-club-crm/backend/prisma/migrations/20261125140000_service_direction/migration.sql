-- Safe to run repeatedly through psql. Keep legacy directions unknown.
DO $$ BEGIN
  CREATE TYPE "ServiceDirection" AS ENUM ('allowIndividual', 'allowGroup', 'allowWalk', 'allowSpecial');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "serviceDirection" "ServiceDirection";
