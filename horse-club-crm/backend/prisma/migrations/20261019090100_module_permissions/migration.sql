CREATE TYPE "SystemModule" AS ENUM ('SCHEDULE', 'STABLES', 'VETERINARY', 'CASHBOX', 'STAFF_PAYROLL');
CREATE TYPE "AccessLevel" AS ENUM ('FULL', 'READ_ONLY', 'HIDDEN');
CREATE TABLE "ClubModuleSettings" (
  "id" UUID NOT NULL,
  "module" "SystemModule" NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClubModuleSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClubModuleSettings_module_key" ON "ClubModuleSettings"("module");
CREATE TABLE "RoleModulePermission" (
  "id" UUID NOT NULL,
  "role" "Role" NOT NULL,
  "module" "SystemModule" NOT NULL,
  "accessLevel" "AccessLevel" NOT NULL DEFAULT 'HIDDEN',
  CONSTRAINT "RoleModulePermission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RoleModulePermission_admin_full" CHECK ("role" <> 'ADMIN' OR "accessLevel" = 'FULL')
);
CREATE UNIQUE INDEX "RoleModulePermission_role_module_key" ON "RoleModulePermission"("role", "module");
INSERT INTO "ClubModuleSettings" ("id", "module", "isEnabled", "updatedAt")
SELECT gen_random_uuid(), m, true, CURRENT_TIMESTAMP FROM unnest(enum_range(NULL::"SystemModule")) m;
INSERT INTO "RoleModulePermission" ("id", "role", "module", "accessLevel")
SELECT gen_random_uuid(), r, m,
  (CASE WHEN r IN ('ADMIN', 'MANAGER') THEN 'FULL'
    WHEN r = 'TRAINER' AND m = 'SCHEDULE' THEN 'FULL'
    WHEN m IN ('STABLES', 'VETERINARY') THEN 'READ_ONLY'
    ELSE 'HIDDEN' END)::"AccessLevel"
FROM unnest(enum_range(NULL::"Role")) r CROSS JOIN unnest(enum_range(NULL::"SystemModule")) m;
