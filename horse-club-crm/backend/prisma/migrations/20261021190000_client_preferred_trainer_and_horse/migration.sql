-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "preferredHorseId" UUID,
ADD COLUMN     "preferredTrainerId" UUID;

-- CreateIndex
CREATE INDEX "Client_preferredTrainerId_idx" ON "Client"("preferredTrainerId");

-- CreateIndex
CREATE INDEX "Client_preferredHorseId_idx" ON "Client"("preferredHorseId");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_preferredTrainerId_fkey" FOREIGN KEY ("preferredTrainerId") REFERENCES "Trainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_preferredHorseId_fkey" FOREIGN KEY ("preferredHorseId") REFERENCES "Horse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
