-- Provenance for photographs: what proves the scope, and how the file may be used.
ALTER TABLE "motorcycle_images"
  ADD COLUMN "evidence" TEXT,
  ADD COLUMN "license" TEXT;
