-- DropIndex: remove unique constraint to allow multiple docs of same type per shipment
DROP INDEX IF EXISTS "Document_shipmentId_docType_key";

-- AlterTable: add groupKey to Document
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "groupKey" TEXT;

-- AlterTable: add groupKey to Discrepancy
ALTER TABLE "Discrepancy" ADD COLUMN IF NOT EXISTS "groupKey" TEXT;

-- CreateIndex: replace unique index with a regular index
CREATE INDEX IF NOT EXISTS "Document_shipmentId_idx" ON "Document"("shipmentId");
