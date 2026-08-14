-- AlterTable
ALTER TABLE "users" ADD COLUMN     "apple_sub" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_apple_sub_key" ON "users"("apple_sub");
