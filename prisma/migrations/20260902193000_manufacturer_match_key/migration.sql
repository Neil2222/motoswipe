-- Normalised brand key, so "BMW", "BMW Motorrad" and "BMW Group" cannot exist
-- as three separate manufacturers with the motorcycles split between them.
--
-- Nullable on purpose: existing rows are backfilled by
-- `npm run db:dedupe-manufacturers`, which merges the duplicates first. The
-- unique index tolerates the NULLs in the meantime and makes the split
-- impossible afterwards.
ALTER TABLE "manufacturers" ADD COLUMN "matchKey" TEXT;

CREATE UNIQUE INDEX "manufacturers_matchKey_key" ON "manufacturers"("matchKey");
