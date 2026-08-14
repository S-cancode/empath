-- CreateTable
CREATE TABLE "moderation_blocks" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "categories" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moderation_blocks_sender_id_idx" ON "moderation_blocks"("sender_id");

-- CreateIndex
CREATE INDEX "moderation_blocks_created_at_idx" ON "moderation_blocks"("created_at");
