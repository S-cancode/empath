-- AlterTable
ALTER TABLE "moderation_actions" ADD COLUMN     "severity" TEXT;

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'standard';
