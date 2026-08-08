-- CreateTable
CREATE TABLE "moderators" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "totp_secret" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'moderator',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderator_audit_logs" (
    "id" TEXT NOT NULL,
    "moderator_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "detail" TEXT,
    "ip_cipher" TEXT,
    "ip_iv" TEXT,
    "ip_auth_tag" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderator_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "moderators_email_key" ON "moderators"("email");

-- CreateIndex
CREATE INDEX "moderator_audit_logs_moderator_id_idx" ON "moderator_audit_logs"("moderator_id");

-- CreateIndex
CREATE INDEX "moderator_audit_logs_created_at_idx" ON "moderator_audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "moderator_audit_logs" ADD CONSTRAINT "moderator_audit_logs_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "moderators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

