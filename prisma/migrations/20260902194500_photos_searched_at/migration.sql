-- Records that Commons has been searched for this motorcycle's photographs,
-- so a re-run skips the thousands of machines nobody has ever photographed
-- rather than asking Wikimedia about them again.
ALTER TABLE "motorcycles" ADD COLUMN "photosSearchedAt" TIMESTAMP(3);
