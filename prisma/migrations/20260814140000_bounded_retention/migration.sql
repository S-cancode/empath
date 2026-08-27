-- Time-bounded safeguarding hold (replaces the permanent one-way retention_hold
-- semantics). Message content is protected from the 7-day cleanup only while
-- retention_hold_until > now(); it is set by a moderator escalation, never by
-- automated crisis-keyword detection.
ALTER TABLE "conversations" ADD COLUMN     "retention_hold_until" TIMESTAMP(3);

-- Efficient bounded cleanup: matchContext 180-day nulling scans by created_at,
-- message 7-day deletion scans by sent_at.
CREATE INDEX "conversations_created_at_idx" ON "conversations"("created_at");
CREATE INDEX "messages_sent_at_idx" ON "messages"("sent_at");
