-- CreateEnum
CREATE TYPE "WorkShiftStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'ABSENT', 'SICK');

-- CreateTable
CREATE TABLE "StaffProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "roleTitle" TEXT NOT NULL,
    "shiftRate" DECIMAL(12,2),
    "lessonRate" DECIMAL(12,2),
    "groupLessonRate" DECIMAL(12,2),
    "lessonPercentage" DECIMAL(5,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkShift" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "status" "WorkShiftStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "WorkShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollCalculation" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "shiftsCount" INTEGER NOT NULL,
    "shiftsTotal" DECIMAL(12,2) NOT NULL,
    "lessonsCount" INTEGER NOT NULL,
    "lessonsTotal" DECIMAL(12,2) NOT NULL,
    "bonuses" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "penalties" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMPTZ(6),
    "expenseId" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PayrollCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_userId_key" ON "StaffProfile"("userId");

-- CreateIndex
CREATE INDEX "WorkShift_date_status_idx" ON "WorkShift"("date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkShift_staffId_date_key" ON "WorkShift"("staffId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollCalculation_expenseId_key" ON "PayrollCalculation"("expenseId");

-- CreateIndex
CREATE INDEX "PayrollCalculation_staffId_isPaid_periodStart_periodEnd_idx" ON "PayrollCalculation"("staffId", "isPaid", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollCalculation_staffId_periodStart_periodEnd_key" ON "PayrollCalculation"("staffId", "periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkShift" ADD CONSTRAINT "WorkShift_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkShift" ADD CONSTRAINT "WorkShift_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollCalculation" ADD CONSTRAINT "PayrollCalculation_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollCalculation" ADD CONSTRAINT "PayrollCalculation_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollCalculation" ADD CONSTRAINT "PayrollCalculation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_rates_check" CHECK (
  ("shiftRate" IS NULL OR "shiftRate" >= 0) AND
  ("lessonRate" IS NULL OR "lessonRate" >= 0) AND
  ("groupLessonRate" IS NULL OR "groupLessonRate" >= 0) AND
  ("lessonPercentage" IS NULL OR "lessonPercentage" BETWEEN 0 AND 100)
);
ALTER TABLE "WorkShift" ADD CONSTRAINT "WorkShift_time_check" CHECK (
  "startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND
  "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "startTime" < "endTime"
);
ALTER TABLE "PayrollCalculation" ADD CONSTRAINT "PayrollCalculation_amount_check" CHECK (
  "shiftsCount" >= 0 AND "lessonsCount" >= 0 AND "shiftsTotal" >= 0 AND "lessonsTotal" >= 0 AND
  "bonuses" >= 0 AND "penalties" >= 0 AND "totalAmount" >= 0 AND
  "totalAmount" = "shiftsTotal" + "lessonsTotal" + "bonuses" - "penalties" AND "periodStart" <= "periodEnd"
);
ALTER TABLE "PayrollCalculation" ADD CONSTRAINT "PayrollCalculation_paid_check" CHECK (
  ("isPaid" AND "paidAt" IS NOT NULL AND "expenseId" IS NOT NULL) OR
  (NOT "isPaid" AND "paidAt" IS NULL AND "expenseId" IS NULL)
);
