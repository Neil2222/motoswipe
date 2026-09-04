-- Manufacturer → ModelFamily → Generation → ModelYear.
--
-- Strictly additive. `motorcycles` keeps every row, every id and every foreign
-- key, so swipes, comparisons, rankings and saved bikes are untouched; the
-- table simply becomes the *generation* level of the hierarchy. Nothing splits
-- until there is evidence for a boundary.

CREATE TYPE "BoundarySource" AS ENUM ('CURATED', 'DETECTED', 'UNKNOWN');
CREATE TYPE "ImageScope" AS ENUM ('MODEL_YEAR', 'GENERATION', 'FAMILY');

CREATE TABLE "model_families" (
    "id" UUID NOT NULL,
    "manufacturerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "familyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "model_families_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "model_families_slug_key" ON "model_families"("slug");
CREATE UNIQUE INDEX "model_families_familyKey_key" ON "model_families"("familyKey");
CREATE INDEX "model_families_manufacturerId_idx" ON "model_families"("manufacturerId");
ALTER TABLE "model_families" ADD CONSTRAINT "model_families_manufacturerId_fkey"
    FOREIGN KEY ("manufacturerId") REFERENCES "manufacturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "model_years" (
    "id" UUID NOT NULL,
    "motorcycleId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "registrationCount" INTEGER NOT NULL,
    "medianPriceEur" DOUBLE PRECISION,
    "medianMassKg" DOUBLE PRECISION,
    "medianDisplacementCc" INTEGER,
    "maxPowerKw" DOUBLE PRECISION,
    "fieldSources" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "model_years_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "model_years_motorcycleId_year_key" ON "model_years"("motorcycleId", "year");
CREATE INDEX "model_years_motorcycleId_idx" ON "model_years"("motorcycleId");
ALTER TABLE "model_years" ADD CONSTRAINT "model_years_motorcycleId_fkey"
    FOREIGN KEY ("motorcycleId") REFERENCES "motorcycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "motorcycles" ADD COLUMN "familyId" UUID;
ALTER TABLE "motorcycles" ADD COLUMN "generationFrom" INTEGER;
ALTER TABLE "motorcycles" ADD COLUMN "generationTo" INTEGER;
ALTER TABLE "motorcycles" ADD COLUMN "boundarySource" "BoundarySource" NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "motorcycles" ADD COLUMN "generationLabel" TEXT;
ALTER TABLE "motorcycles" ADD COLUMN "boundaryReason" TEXT;
ALTER TABLE "motorcycles" ADD COLUMN "boundaryReference" TEXT;
CREATE INDEX "motorcycles_familyId_idx" ON "motorcycles"("familyId");
ALTER TABLE "motorcycles" ADD CONSTRAINT "motorcycles_familyId_fkey"
    FOREIGN KEY ("familyId") REFERENCES "model_families"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing photographs are of the bike their article or search was about, and
-- nothing more precise is established. GENERATION is the honest default.
ALTER TABLE "motorcycle_images" ADD COLUMN "scope" "ImageScope" NOT NULL DEFAULT 'GENERATION';
ALTER TABLE "motorcycle_images" ADD COLUMN "modelYear" INTEGER;
