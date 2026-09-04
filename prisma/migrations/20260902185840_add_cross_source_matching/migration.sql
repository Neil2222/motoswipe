-- AlterTable
ALTER TABLE "motorcycles" ADD COLUMN     "enrichedBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "matchKey" TEXT;

-- CreateIndex
CREATE INDEX "motorcycles_matchKey_idx" ON "motorcycles"("matchKey");
