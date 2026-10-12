-- CreateEnum
CREATE TYPE "SubcontractStatus" AS ENUM ('SEARCHING', 'AGREED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Subcontract" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "dealId" TEXT NOT NULL,
    "generalSupplierOrgId" TEXT NOT NULL,
    "subcontractorOrgId" TEXT,
    "title" TEXT NOT NULL,
    "targetRegion" TEXT NOT NULL,
    "description" TEXT,
    "agreedAmount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KZT',
    "deadline" TIMESTAMP(3),
    "status" "SubcontractStatus" NOT NULL DEFAULT 'SEARCHING',
    "contractTerms" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Subcontract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractBid" (
    "id" TEXT NOT NULL,
    "subcontractId" TEXT NOT NULL,
    "contractorOrgId" TEXT NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "proposedDate" TIMESTAMP(3),
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubcontractBid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subcontract_number_key" ON "Subcontract"("number");

-- CreateIndex
CREATE INDEX "Subcontract_dealId_status_idx" ON "Subcontract"("dealId", "status");

-- CreateIndex
CREATE INDEX "Subcontract_targetRegion_status_idx" ON "Subcontract"("targetRegion", "status");

-- CreateIndex
CREATE INDEX "Subcontract_generalSupplierOrgId_idx" ON "Subcontract"("generalSupplierOrgId");

-- CreateIndex
CREATE INDEX "Subcontract_subcontractorOrgId_idx" ON "Subcontract"("subcontractorOrgId");

-- CreateIndex
CREATE INDEX "SubcontractBid_subcontractId_status_idx" ON "SubcontractBid"("subcontractId", "status");

-- CreateIndex
CREATE INDEX "SubcontractBid_contractorOrgId_idx" ON "SubcontractBid"("contractorOrgId");

-- AddForeignKey
ALTER TABLE "Subcontract" ADD CONSTRAINT "Subcontract_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcontract" ADD CONSTRAINT "Subcontract_generalSupplierOrgId_fkey" FOREIGN KEY ("generalSupplierOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcontract" ADD CONSTRAINT "Subcontract_subcontractorOrgId_fkey" FOREIGN KEY ("subcontractorOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractBid" ADD CONSTRAINT "SubcontractBid_subcontractId_fkey" FOREIGN KEY ("subcontractId") REFERENCES "Subcontract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractBid" ADD CONSTRAINT "SubcontractBid_contractorOrgId_fkey" FOREIGN KEY ("contractorOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
