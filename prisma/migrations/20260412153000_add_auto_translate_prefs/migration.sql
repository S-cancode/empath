-- AlterTable: users gains per-user translation preferences.
-- Opt-in-by-default until a client UI lands that lets users toggle it.
-- Translation is still a no-op until preferred_language is set, so there is no
-- surprise behavior for users who have not picked a language.
ALTER TABLE "users"
  ADD COLUMN "preferred_language" TEXT,
  ADD COLUMN "preferred_dialect" TEXT,
  ADD COLUMN "auto_translate_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "language_detected_at" TIMESTAMP(3);

-- Existing rows were inserted before the column existed, so make sure they
-- pick up the new default explicitly (some Postgres versions honor the default
-- for new rows only during ADD COLUMN).
UPDATE "users" SET "auto_translate_enabled" = true WHERE "auto_translate_enabled" IS NULL OR "auto_translate_enabled" = false;

-- AlterTable: messages gains detected source language (cached once per message)
ALTER TABLE "messages"
  ADD COLUMN "source_language" TEXT;
