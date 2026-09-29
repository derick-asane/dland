-- AlterEnum
ALTER TYPE "BlockType" ADD VALUE 'BOUNDARY_RECORDED';

-- AlterTable
ALTER TABLE "Land" ADD COLUMN     "boundary" JSONB,
ADD COLUMN     "boundaryAreaSqm" DOUBLE PRECISION,
ADD COLUMN     "boundaryHash" TEXT,
ADD COLUMN     "boundaryOnChain" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxLat" DOUBLE PRECISION,
ADD COLUMN     "maxLng" DOUBLE PRECISION,
ADD COLUMN     "minLat" DOUBLE PRECISION,
ADD COLUMN     "minLng" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "Land_minLat_maxLat_minLng_maxLng_idx" ON "Land"("minLat", "maxLat", "minLng", "maxLng");

-- CreateIndex
CREATE INDEX "Land_latitude_longitude_idx" ON "Land"("latitude", "longitude");
