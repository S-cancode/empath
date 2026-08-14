import { ValidationError } from "../shared/errors.js";

/**
 * Server-side runtime validation for voice-note payloads. Rejects malformed
 * input BEFORE any decode, transcription, encryption, persistence or delivery.
 * Never trusts client-side limits.
 */

// ~2MB of base64 ≈ 1.5MB decoded — comfortably covers 60s of LOW_QUALITY audio.
export const VOICE_MAX_BASE64_CHARS = 2_000_000;
export const VOICE_MAX_DECODED_BYTES = 1_600_000;
export const VOICE_MAX_DURATION_MS = 60_000;
export const VOICE_MAX_WAVEFORM_SAMPLES = 600;

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export interface ValidatedVoicePayload {
  audio: Buffer;
  durationMs: number;
  waveform?: number[];
}

/**
 * Validates and decodes a voice payload. Returns the decoded audio buffer on
 * success; throws ValidationError with a neutral message on any problem.
 */
export function validateVoicePayload(data: {
  conversationId?: unknown;
  audio?: unknown;
  durationMs?: unknown;
  waveform?: unknown;
}): ValidatedVoicePayload {
  if (typeof data.conversationId !== "string" || data.conversationId.length === 0) {
    throw new ValidationError("Missing conversation.");
  }

  if (typeof data.audio !== "string" || data.audio.length === 0) {
    throw new ValidationError("Missing audio.");
  }
  if (data.audio.length > VOICE_MAX_BASE64_CHARS || !BASE64_RE.test(data.audio)) {
    throw new ValidationError("Voice note audio is invalid or too large.");
  }

  const audio = Buffer.from(data.audio, "base64");
  // Re-encoding round-trip guards against invalid base64 that Buffer silently
  // truncates rather than rejecting.
  if (audio.length === 0 || audio.toString("base64") !== data.audio) {
    throw new ValidationError("Voice note audio is invalid.");
  }
  if (audio.length > VOICE_MAX_DECODED_BYTES) {
    throw new ValidationError("Voice note is too large (max 60s).");
  }

  if (
    typeof data.durationMs !== "number" ||
    !Number.isInteger(data.durationMs) ||
    data.durationMs <= 0 ||
    data.durationMs > VOICE_MAX_DURATION_MS
  ) {
    throw new ValidationError("Voice note duration is invalid (max 60s).");
  }

  let waveform: number[] | undefined;
  if (data.waveform !== undefined && data.waveform !== null) {
    if (!Array.isArray(data.waveform)) {
      throw new ValidationError("Voice note waveform is invalid.");
    }
    if (data.waveform.length > VOICE_MAX_WAVEFORM_SAMPLES) {
      throw new ValidationError("Voice note waveform is too large.");
    }
    for (const v of data.waveform) {
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
        throw new ValidationError("Voice note waveform is invalid.");
      }
    }
    waveform = data.waveform as number[];
  }

  return { audio, durationMs: data.durationMs, waveform };
}
