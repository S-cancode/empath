-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "message_type" TEXT NOT NULL DEFAULT 'text',
ADD COLUMN     "voice_duration_ms" INTEGER;
