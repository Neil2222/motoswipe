-- Canonical identity on the motorcycle the deck shows, plus per-field provenance.
ALTER TABLE "motorcycles" ADD COLUMN "identityKey" TEXT;
ALTER TABLE "motorcycles" ADD COLUMN "fieldSources" JSONB NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX "motorcycles_identityKey_key" ON "motorcycles"("identityKey");
CREATE INDEX "motorcycles_identityKey_idx" ON "motorcycles"("identityKey");

-- What each source said, kept verbatim. The canonical row above is a
-- projection of these, so a merge never destroys the only copy of anything.
CREATE TABLE "source_records" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "motorcycleId" UUID,
    "identityKey" TEXT,
    "manufacturerName" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "variant" TEXT,
    "eraFrom" INTEGER,
    "eraTo" INTEGER,
    "payload" JSONB NOT NULL,
    "confidence" JSONB NOT NULL DEFAULT '{}',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "source_records_source_externalId_key" ON "source_records"("source", "externalId");
CREATE INDEX "source_records_motorcycleId_idx" ON "source_records"("motorcycleId");
CREATE INDEX "source_records_identityKey_idx" ON "source_records"("identityKey");
CREATE INDEX "source_records_source_idx" ON "source_records"("source");

ALTER TABLE "source_records" ADD CONSTRAINT "source_records_motorcycleId_fkey"
    FOREIGN KEY ("motorcycleId") REFERENCES "motorcycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
