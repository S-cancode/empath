export type VoiceAckState = "sent" | "retry" | "rejected";

export interface VoiceAckOutcome {
  state: VoiceAckState;
  message?: string;
  refetch: boolean;
}

export const VOICE_SEND_TIMEOUT_MS = 20_000;

/**
 * Pure resolver for a voice-note send acknowledgement. Maps the Socket.IO
 * timeout-ack callback (err, res) to a deterministic UI outcome. A timeout or
 * transport error is treated as retryable — the message may not have been
 * delivered, so we never claim success. Unit-testable in isolation.
 */
export function resolveVoiceAck(
  err: unknown,
  res?: { status?: string; message?: string } | null,
): VoiceAckOutcome {
  if (err) {
    return { state: "retry", message: "Sending timed out. Please try again.", refetch: false };
  }
  if (res?.status === "sent") {
    return { state: "sent", refetch: true };
  }
  if (res?.status === "retry") {
    return { state: "retry", message: res.message ?? "Please try sending the voice note again.", refetch: false };
  }
  return { state: "rejected", message: res?.message ?? "This voice note couldn't be sent.", refetch: false };
}
