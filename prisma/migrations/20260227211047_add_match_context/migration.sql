-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "match_context" JSONB,
ADD COLUMN     "raw_prompt_auth_tag" TEXT,
ADD COLUMN     "raw_prompt_cipher" TEXT,
ADD COLUMN     "raw_prompt_iv" TEXT;
