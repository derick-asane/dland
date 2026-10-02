-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'DECLINED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'LAND_BLOCKED';
ALTER TYPE "NotificationType" ADD VALUE 'LAND_UNBLOCKED';
ALTER TYPE "NotificationType" ADD VALUE 'VISIT_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'VISIT_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE 'VISIT_DECLINED';
ALTER TYPE "NotificationType" ADD VALUE 'VISIT_CANCELLED';

-- AlterTable
ALTER TABLE "Land" ADD COLUMN     "blockReason" TEXT,
ADD COLUMN     "blockedAt" TIMESTAMP(3),
ADD COLUMN     "statusBeforeBlock" "LandStatus";

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "landId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'REQUESTED',
    "preferredAt" TIMESTAMP(3),
    "message" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "ownerNote" TEXT,
    "closeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Visit_landId_status_idx" ON "Visit"("landId", "status");

-- CreateIndex
CREATE INDEX "Visit_visitorId_idx" ON "Visit"("visitorId");

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_landId_fkey" FOREIGN KEY ("landId") REFERENCES "Land"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
