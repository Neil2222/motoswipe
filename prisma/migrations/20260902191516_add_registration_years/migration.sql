-- AlterTable
ALTER TABLE "motorcycles" ADD COLUMN     "firstRegistrationYear" INTEGER,
ADD COLUMN     "lastRegistrationYear" INTEGER,
ADD COLUMN     "registrationCount" INTEGER;

-- CreateIndex
CREATE INDEX "motorcycles_lastRegistrationYear_idx" ON "motorcycles"("lastRegistrationYear");
