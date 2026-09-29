-- CreateEnum
CREATE TYPE "TransferStepType" AS ENUM ('DEPOSIT', 'BALANCE', 'DEED_SIGNED', 'REGISTERED');

-- CreateEnum
CREATE TYPE "TransferStepStatus" AS ENUM ('PENDING', 'SUBMITTED', 'CONFIRMED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BlockType" ADD VALUE 'PAYMENT_CONFIRMED';
ALTER TYPE "BlockType" ADD VALUE 'REGISTRY_RECORDED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TRANSFER_CLAIMED';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_PROOF_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'TITLE_REGISTERED';

-- AlterEnum
ALTER TYPE "TransferStatus" ADD VALUE 'IN_PROGRESS';

-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "deedReference" TEXT,
ADD COLUMN     "registeredAt" TIMESTAMP(3),
ADD COLUMN     "registryReference" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "escrowAccountName" TEXT,
ADD COLUMN     "escrowAccountNumber" TEXT,
ADD COLUMN     "escrowBankName" TEXT,
ADD COLUMN     "escrowMobileMoney" TEXT;

-- CreateTable
CREATE TABLE "TransferStep" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "type" "TransferStepType" NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "TransferStepStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(18,2),
    "proofUrl" TEXT,
    "proofName" TEXT,
    "proofMime" TEXT,
    "proofSha256" TEXT,
    "paymentReference" TEXT,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "note" TEXT,
    "blockId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransferStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransferStep_blockId_key" ON "TransferStep"("blockId");

-- CreateIndex
CREATE INDEX "TransferStep_transferId_idx" ON "TransferStep"("transferId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferStep_transferId_type_key" ON "TransferStep"("transferId", "type");

-- CreateIndex
CREATE INDEX "Transfer_notaryId_idx" ON "Transfer"("notaryId");

-- AddForeignKey
ALTER TABLE "TransferStep" ADD CONSTRAINT "TransferStep_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferStep" ADD CONSTRAINT "TransferStep_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferStep" ADD CONSTRAINT "TransferStep_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferStep" ADD CONSTRAINT "TransferStep_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE SET NULL ON UPDATE CASCADE;
