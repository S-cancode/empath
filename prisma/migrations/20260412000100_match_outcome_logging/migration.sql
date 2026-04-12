-- Extend match_quality_logs with user/conversation links and outcome fields
ALTER TABLE "match_quality_logs"
  ADD COLUMN "conversation_id" TEXT,
  ADD COLUMN "user_a_id" TEXT,
  ADD COLUMN "user_b_id" TEXT,
  ADD COLUMN "first_reply_within_10min" BOOLEAN,
  ADD COLUMN "msgs_in_24h" INTEGER,
  ADD COLUMN "alive_at_day_7" BOOLEAN,
  ADD COLUMN "outcome_computed_at" TIMESTAMP(3);

CREATE INDEX "match_quality_logs_conversation_id_idx" ON "match_quality_logs"("conversation_id");
CREATE INDEX "match_quality_logs_matched_at_idx" ON "match_quality_logs"("matched_at");
