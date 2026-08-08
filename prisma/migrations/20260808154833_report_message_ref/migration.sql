-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "reported_message_id" TEXT;

-- CreateIndex
CREATE INDEX "reports_reported_message_id_idx" ON "reports"("reported_message_id");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_message_id_fkey" FOREIGN KEY ("reported_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

