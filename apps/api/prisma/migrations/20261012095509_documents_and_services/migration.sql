-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('PRODUCT', 'SERVICE');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CONTRACT', 'INVOICE', 'ACT_OF_COMPLETION', 'WAYBILL', 'PAYMENT_RECEIPT');

-- CreateEnum
CREATE TYPE "DocumentSignStatus" AS ENUM ('DRAFT', 'SIGNED_BY_SUPPLIER', 'SIGNED_BY_BUYER', 'SIGNED_BY_BOTH');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "type" "ItemType" NOT NULL DEFAULT 'PRODUCT';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "type" "ItemType" NOT NULL DEFAULT 'PRODUCT';

-- AlterTable
ALTER TABLE "PurchaseRequest" ADD COLUMN     "type" "ItemType" NOT NULL DEFAULT 'PRODUCT';

-- AlterTable
ALTER TABLE "RequestItem" ADD COLUMN     "type" "ItemType" NOT NULL DEFAULT 'PRODUCT';

-- CreateTable
CREATE TABLE "DealDocument" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "status" "DocumentSignStatus" NOT NULL DEFAULT 'DRAFT',
    "pdfStorageKey" TEXT,
    "supplierSignedAt" TIMESTAMP(3),
    "supplierSignIp" TEXT,
    "supplierSignerName" TEXT,
    "buyerSignedAt" TIMESTAMP(3),
    "buyerSignIp" TEXT,
    "buyerSignerName" TEXT,
    "verificationCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealDocument_dealId_type_idx" ON "DealDocument"("dealId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "DealDocument_dealId_type_key" ON "DealDocument"("dealId", "type");

-- AddForeignKey
ALTER TABLE "DealDocument" ADD CONSTRAINT "DealDocument_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
