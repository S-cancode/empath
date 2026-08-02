-- NOTE: prisma migrate dev auto-generates DROP INDEX "match_queue_embedding_idx"
-- here because the hnsw vector index (raw SQL, 20260412000000_restore_vector_index)
-- cannot be modelled in schema.prisma. It has been removed by hand — do NOT let
-- future generated migrations drop that index either.

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "retention_hold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "retention_hold_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "escalation_outcome" TEXT,
ADD COLUMN     "escalation_resolved_at" TIMESTAMP(3);
