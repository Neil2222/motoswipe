-- Which job put an image here, so a rebuild can replace what a provider claims
-- without discarding the photographs the Commons search job found.
ALTER TABLE "motorcycle_images" ADD COLUMN "source" TEXT;

-- Everything currently present came from a provider import or the photo job;
-- the photo job is the only writer that sets no attribution beginning with a
-- Wikipedia article, so label conservatively and let the next run correct it.
UPDATE "motorcycle_images" SET "source" = 'legacy' WHERE "source" IS NULL;
