-- AlterTable
ALTER TABLE "Advertisement" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Dispute" ADD COLUMN     "feeStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED';
