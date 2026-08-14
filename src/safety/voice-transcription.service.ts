import OpenAI, { toFile } from "openai";
import { config } from "../config/index.js";

/**
 * Transcribe short voice notes for pre-delivery moderation ONLY. The transcript
 * is used to run the existing text moderation and then discarded — it is never
 * persisted, returned to clients, or logged. Fails closed: any error throws so
 * the caller can reject the message rather than deliver unmoderated audio.
 */

const STUB_KEY = "sk-stub-placeholder-key";
const TRANSCRIBE_MODEL = "whisper-1";
const TRANSCRIBE_TIMEOUT_MS = 12_000;

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: config.OPENAI_API_KEY, baseURL: config.OPENAI_BASE_URL });
  }
  return client;
}

function isStubMode(): boolean {
  return !config.OPENAI_API_KEY || config.OPENAI_API_KEY === STUB_KEY;
}

/**
 * Transcribe decoded audio bytes to text for moderation. Fails CLOSED: any
 * failure — including an empty or whitespace-only result, or stub mode where
 * no real transcription is possible — throws so the caller quarantines the
 * message rather than delivering unmoderated audio. An empty transcript must
 * never reach moderation as an allowable empty string.
 */
export async function transcribeForModeration(
  audio: Buffer,
  filename = "voice.m4a",
): Promise<string> {
  // No API key means we cannot verify the audio — fail closed, never allow.
  if (isStubMode()) {
    throw new Error("transcription unavailable (stub mode)");
  }

  const file = await toFile(audio, filename);
  const result = (await Promise.race([
    getClient().audio.transcriptions.create({ file, model: TRANSCRIBE_MODEL }),
    new Promise((_res, rej) =>
      setTimeout(() => rej(new Error("transcription timeout")), TRANSCRIBE_TIMEOUT_MS),
    ),
  ])) as { text?: string };

  const text = typeof result.text === "string" ? result.text.trim() : "";
  if (text.length === 0) {
    // Silence / no discernible speech cannot be safety-checked → treat as a
    // transcription failure so the message is quarantined, not delivered.
    throw new Error("empty transcription");
  }
  return text;
}
