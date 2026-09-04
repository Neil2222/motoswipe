-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RoundVisibility" AS ENUM ('PRIVATE', 'UNLISTED', 'PUBLIC');

-- CreateEnum
CREATE TYPE "SwipeDecision" AS ENUM ('LIKE', 'DISLIKE', 'SUPERLIKE', 'SKIP');

-- CreateEnum
CREATE TYPE "MotorcycleCategory" AS ENUM ('NAKED', 'HYPER_NAKED', 'SPORT', 'SUPERSPORT', 'CRUISER', 'BOBBER', 'TOURING', 'SPORT_TOURING', 'ADVENTURE', 'DUAL_SPORT', 'SUPERMOTO', 'CLASSIC', 'CAFE_RACER', 'SCRAMBLER', 'SCOOTER', 'OTHER');

-- CreateEnum
CREATE TYPE "RidingPosition" AS ENUM ('UPRIGHT', 'SPORT_UPRIGHT', 'AGGRESSIVE', 'FEET_FORWARD', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "LicenseCategory" AS ENUM ('AM', 'A1', 'A2', 'A', 'UNKNOWN');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "heightCm" INTEGER,
    "inseamCm" INTEGER,
    "countryCode" VARCHAR(2),
    "preferredCurrency" VARCHAR(3),
    "profileVisibility" "ProfileVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manufacturers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "countryCode" VARCHAR(2),
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manufacturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motorcycles" (
    "id" UUID NOT NULL,
    "manufacturerId" UUID NOT NULL,
    "model" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "variant" TEXT,
    "modelYear" INTEGER,
    "category" "MotorcycleCategory" NOT NULL,
    "categoryRaw" TEXT,
    "subCategory" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "displacementCc" INTEGER,
    "cylinders" INTEGER,
    "engineConfiguration" TEXT,
    "cooling" TEXT,
    "powerHp" DOUBLE PRECISION,
    "powerKw" DOUBLE PRECISION,
    "torqueNm" DOUBLE PRECISION,
    "transmission" TEXT,
    "gears" INTEGER,
    "wetWeightKg" DOUBLE PRECISION,
    "dryWeightKg" DOUBLE PRECISION,
    "seatHeightMm" INTEGER,
    "seatWidthMm" INTEGER,
    "wheelbaseMm" INTEGER,
    "fuelCapacityLiters" DOUBLE PRECISION,
    "passengerAllowed" BOOLEAN,
    "seatCount" INTEGER,
    "passengerPegs" BOOLEAN,
    "ridingPosition" "RidingPosition",
    "licenseCategory" "LicenseCategory",
    "msrpAmount" DOUBLE PRECISION,
    "msrpCurrency" VARCHAR(3),
    "marketCountryCode" VARCHAR(2),
    "availableNew" BOOLEAN,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "externalId" TEXT,
    "importedAt" TIMESTAMP(3),
    "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "protectedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "motorcycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motorcycle_images" (
    "id" UUID NOT NULL,
    "motorcycleId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "localPath" TEXT,
    "sourceUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "width" INTEGER,
    "height" INTEGER,
    "imageType" TEXT,
    "attribution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "motorcycle_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovery_rounds" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "goal" TEXT,
    "status" "RoundStatus" NOT NULL DEFAULT 'ACTIVE',
    "visibility" "RoundVisibility" NOT NULL DEFAULT 'PRIVATE',
    "filters" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "discovery_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swipes" (
    "id" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "motorcycleId" UUID NOT NULL,
    "decision" "SwipeDecision" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "swipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comparison_votes" (
    "id" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "motorcycleAId" UUID NOT NULL,
    "motorcycleBId" UUID NOT NULL,
    "winnerMotorcycleId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comparison_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round_motorcycle_rankings" (
    "id" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "motorcycleId" UUID NOT NULL,
    "eloScore" DOUBLE PRECISION NOT NULL DEFAULT 1500,
    "comparisons" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "round_motorcycle_rankings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_tokenHash_key" ON "auth_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions"("userId");

-- CreateIndex
CREATE INDEX "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_userId_key" ON "user_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "manufacturers_name_key" ON "manufacturers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "manufacturers_slug_key" ON "manufacturers"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "motorcycles_slug_key" ON "motorcycles"("slug");

-- CreateIndex
CREATE INDEX "motorcycles_manufacturerId_idx" ON "motorcycles"("manufacturerId");

-- CreateIndex
CREATE INDEX "motorcycles_category_idx" ON "motorcycles"("category");

-- CreateIndex
CREATE INDEX "motorcycles_modelYear_idx" ON "motorcycles"("modelYear");

-- CreateIndex
CREATE INDEX "motorcycles_availableNew_idx" ON "motorcycles"("availableNew");

-- CreateIndex
CREATE INDEX "motorcycles_seatHeightMm_idx" ON "motorcycles"("seatHeightMm");

-- CreateIndex
CREATE INDEX "motorcycles_displacementCc_idx" ON "motorcycles"("displacementCc");

-- CreateIndex
CREATE INDEX "motorcycles_powerHp_idx" ON "motorcycles"("powerHp");

-- CreateIndex
CREATE INDEX "motorcycles_isActive_idx" ON "motorcycles"("isActive");

-- CreateIndex
CREATE INDEX "motorcycles_category_isActive_idx" ON "motorcycles"("category", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "motorcycles_source_externalId_key" ON "motorcycles"("source", "externalId");

-- CreateIndex
CREATE INDEX "motorcycle_images_motorcycleId_idx" ON "motorcycle_images"("motorcycleId");

-- CreateIndex
CREATE INDEX "motorcycle_images_motorcycleId_isPrimary_idx" ON "motorcycle_images"("motorcycleId", "isPrimary");

-- CreateIndex
CREATE INDEX "motorcycle_images_motorcycleId_sortOrder_idx" ON "motorcycle_images"("motorcycleId", "sortOrder");

-- CreateIndex
CREATE INDEX "discovery_rounds_userId_idx" ON "discovery_rounds"("userId");

-- CreateIndex
CREATE INDEX "discovery_rounds_status_idx" ON "discovery_rounds"("status");

-- CreateIndex
CREATE INDEX "discovery_rounds_visibility_idx" ON "discovery_rounds"("visibility");

-- CreateIndex
CREATE INDEX "discovery_rounds_userId_status_idx" ON "discovery_rounds"("userId", "status");

-- CreateIndex
CREATE INDEX "discovery_rounds_userId_createdAt_idx" ON "discovery_rounds"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "swipes_roundId_idx" ON "swipes"("roundId");

-- CreateIndex
CREATE INDEX "swipes_motorcycleId_idx" ON "swipes"("motorcycleId");

-- CreateIndex
CREATE INDEX "swipes_roundId_decision_idx" ON "swipes"("roundId", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "swipes_roundId_motorcycleId_key" ON "swipes"("roundId", "motorcycleId");

-- CreateIndex
CREATE INDEX "comparison_votes_roundId_idx" ON "comparison_votes"("roundId");

-- CreateIndex
CREATE INDEX "comparison_votes_roundId_createdAt_idx" ON "comparison_votes"("roundId", "createdAt");

-- CreateIndex
CREATE INDEX "comparison_votes_winnerMotorcycleId_idx" ON "comparison_votes"("winnerMotorcycleId");

-- CreateIndex
CREATE INDEX "round_motorcycle_rankings_roundId_idx" ON "round_motorcycle_rankings"("roundId");

-- CreateIndex
CREATE INDEX "round_motorcycle_rankings_roundId_eloScore_idx" ON "round_motorcycle_rankings"("roundId", "eloScore");

-- CreateIndex
CREATE UNIQUE INDEX "round_motorcycle_rankings_roundId_motorcycleId_key" ON "round_motorcycle_rankings"("roundId", "motorcycleId");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motorcycles" ADD CONSTRAINT "motorcycles_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motorcycle_images" ADD CONSTRAINT "motorcycle_images_motorcycleId_fkey" FOREIGN KEY ("motorcycleId") REFERENCES "motorcycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovery_rounds" ADD CONSTRAINT "discovery_rounds_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "discovery_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_motorcycleId_fkey" FOREIGN KEY ("motorcycleId") REFERENCES "motorcycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparison_votes" ADD CONSTRAINT "comparison_votes_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "discovery_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparison_votes" ADD CONSTRAINT "comparison_votes_motorcycleAId_fkey" FOREIGN KEY ("motorcycleAId") REFERENCES "motorcycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparison_votes" ADD CONSTRAINT "comparison_votes_motorcycleBId_fkey" FOREIGN KEY ("motorcycleBId") REFERENCES "motorcycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparison_votes" ADD CONSTRAINT "comparison_votes_winnerMotorcycleId_fkey" FOREIGN KEY ("winnerMotorcycleId") REFERENCES "motorcycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_motorcycle_rankings" ADD CONSTRAINT "round_motorcycle_rankings_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "discovery_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_motorcycle_rankings" ADD CONSTRAINT "round_motorcycle_rankings_motorcycleId_fkey" FOREIGN KEY ("motorcycleId") REFERENCES "motorcycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
