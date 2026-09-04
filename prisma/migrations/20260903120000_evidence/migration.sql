-- Field-level evidence, image status and discovery eligibility on every
-- generation. Additive: every existing row keeps its id and data; the rebuild
-- fills the new columns.

CREATE TYPE "ImageStatus" AS ENUM ('MODEL_YEAR', 'GENERATION', 'FAMILY_ONLY', 'NONE', 'SUSPICIOUS');
CREATE TYPE "Availability" AS ENUM ('NEW', 'USED', 'UNKNOWN');

ALTER TABLE "motorcycles"
  ADD COLUMN "evidence" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "imageStatus" "ImageStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "discoveryEligible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ineligibleReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "availability" "Availability" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "msrpYear" INTEGER;

CREATE INDEX "motorcycles_discoveryEligible_idx" ON "motorcycles"("discoveryEligible");
CREATE INDEX "motorcycles_availability_idx" ON "motorcycles"("availability");
