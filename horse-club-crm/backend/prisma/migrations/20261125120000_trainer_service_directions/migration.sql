-- Safe for repeated direct application through psql.
ALTER TABLE "Trainer"
  ADD COLUMN IF NOT EXISTS "allowIndividual" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "allowGroup" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "allowWalk" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "allowSpecial" BOOLEAN NOT NULL DEFAULT true;
