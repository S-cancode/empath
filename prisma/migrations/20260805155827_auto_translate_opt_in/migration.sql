-- NOTE: Prisma auto-generated DROP INDEX "match_queue_embedding_idx" here
-- (hnsw index it cannot model) — removed by hand. Do not let generated
-- migrations drop that index.

-- AlterTable: auto-translate becomes opt-in
ALTER TABLE "users" ALTER COLUMN "auto_translate_enabled" SET DEFAULT false;

-- Existing users were defaulted to enabled without explicit consent for the
-- translation data flow. Reset everyone to off; re-enabling now goes through
-- the in-app consent flow which records a ConsentRecord.
UPDATE "users" SET "auto_translate_enabled" = false;
