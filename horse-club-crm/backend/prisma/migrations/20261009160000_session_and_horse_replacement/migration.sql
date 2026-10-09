ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Booking" ADD COLUMN "horseChangeReason" TEXT;
CREATE FUNCTION bump_user_token_version() RETURNS trigger AS $$
BEGIN
  IF NEW."passwordHash" IS DISTINCT FROM OLD."passwordHash" OR NEW."role" IS DISTINCT FROM OLD."role" THEN
    NEW."tokenVersion" := OLD."tokenVersion" + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER user_auth_version BEFORE UPDATE ON "User"
FOR EACH ROW EXECUTE FUNCTION bump_user_token_version();
