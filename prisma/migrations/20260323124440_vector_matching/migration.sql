-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "blocked_users" ADD COLUMN     "blocked_device_id" TEXT,
ADD COLUMN     "blocker_device_id" TEXT;

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "conversation_log" JSONB;

-- CreateTable
CREATE TABLE "match_queue_entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL,
    "match_context" JSONB,
    "embedding" vector(1536) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_queue_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_quality_logs" (
    "id" TEXT NOT NULL,
    "similarity_score" DOUBLE PRECISION NOT NULL,
    "category_a" TEXT NOT NULL,
    "category_b" TEXT NOT NULL,
    "matched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_quality_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms_versions" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terms_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_text_versions" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "consent_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "text_hash" TEXT NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_text_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "response" TEXT,
    "responded_at" TIMESTAMP(3),
    "outcome" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "match_queue_entries_user_id_key" ON "match_queue_entries"("user_id");

-- CreateIndex
CREATE INDEX "match_queue_entries_user_id_idx" ON "match_queue_entries"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "terms_versions_version_key" ON "terms_versions"("version");

-- CreateIndex
CREATE UNIQUE INDEX "consent_text_versions_version_key" ON "consent_text_versions"("version");

-- CreateIndex
CREATE INDEX "complaints_user_id_idx" ON "complaints"("user_id");

-- CreateIndex
CREATE INDEX "complaints_status_idx" ON "complaints"("status");

-- CreateIndex
CREATE INDEX "blocked_users_blocker_device_id_idx" ON "blocked_users"("blocker_device_id");

-- CreateIndex
CREATE INDEX "blocked_users_blocked_device_id_idx" ON "blocked_users"("blocked_device_id");

-- CreateIndex
CREATE INDEX "crisis_events_created_at_idx" ON "crisis_events"("created_at");

-- CreateIndex
CREATE INDEX "messages_sender_id_idx" ON "messages"("sender_id");

-- CreateIndex
CREATE INDEX "messages_delivery_status_idx" ON "messages"("delivery_status");

-- CreateIndex
CREATE INDEX "reports_reported_id_idx" ON "reports"("reported_id");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create HNSW index for fast cosine similarity search
CREATE INDEX match_queue_embedding_idx ON match_queue_entries USING hnsw (embedding vector_cosine_ops);
