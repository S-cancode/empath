-- AlterTable: Apple refresh token material, encrypted at rest (AES-256-GCM).
-- Used to revoke Apple access on account deletion (Apple TN3194). Null for
-- legacy accounts that predate the authorization-code exchange.
ALTER TABLE "users" ADD COLUMN     "apple_refresh_token_auth_tag" TEXT,
ADD COLUMN     "apple_refresh_token_cipher" TEXT,
ADD COLUMN     "apple_refresh_token_iv" TEXT;

-- AlterTable: review_key is the concurrency anchor for the App Review demo
-- conversation (atomic create-or-catch on a UNIQUE key). Null for real convos.
ALTER TABLE "conversations" ADD COLUMN     "review_key" TEXT;

-- CreateTable: durable App Review access grant (see prisma/schema.prisma).
CREATE TABLE "review_grants" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_grants_user_id_key" ON "review_grants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_review_key_key" ON "conversations"("review_key");

-- AddForeignKey
ALTER TABLE "review_grants" ADD CONSTRAINT "review_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
