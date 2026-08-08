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
 * Transcribe decoded audio bytes to text. In stub mode (no API key) returns an
 * empty transcript — moderation of an empty string is treated as allow, which
 * is acceptable for local/dev where no real audio moves. Throws on any real
 * transcription failure so the caller fails closed.
 */
export async function transcribeForModeration(
  audio: Buffer,
  filename = "voice.m4a",
): Promise<string> {
  if (isStubMode()) return "";

  const file = await toFile(audio, filename);
  const result = (await Promise.race([
    getClient().audio.transcriptions.create({ file, model: TRANSCRIBE_MODEL }),
    new Promise((_res, rej) =>
      setTimeout(() => rej(new Error("transcription timeout")), TRANSCRIBE_TIMEOUT_MS),
    ),
  ])) as { text?: string };

  return typeof result.text === "string" ? result.text : "";
}
