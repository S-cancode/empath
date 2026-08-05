import OpenAI from "openai";
import { createHash } from "node:crypto";
import { config } from "../config/index.js";
import { redis } from "../lib/redis.js";
import { encrypt, decrypt } from "../lib/crypto.js";

const STUB_KEY = "sk-stub-placeholder-key";
// v2: cached translations are AES-encrypted (same protection as the Message
// table) and kept for 24h, not 7 days. v1 plaintext entries are purged at
// startup by purgeLegacyTranslationCache().
const CACHE_PREFIX = "translate:v2:";
const LEGACY_CACHE_PREFIX = "translate:v1:";
const CACHE_TTL_SECONDS = 24 * 60 * 60;

function isStubMode(): boolean {
  return !config.OPENAI_API_KEY || config.OPENAI_API_KEY === STUB_KEY;
}

function getClient(): OpenAI {
  return new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    baseURL: config.OPENAI_BASE_URL,
  });
}

export const SUPPORTED_LANGUAGES = [
  "en", "es", "fr", "de", "pt", "it", "zh", "ja", "ko", "ar", "hi", "ru",
] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
  hi: "Hindi",
  ru: "Russian",
};

export interface TranslateResult {
  sourceLang: string;
  translated: string;
  fromCache?: boolean;
}

export function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(lang);
}

// Cheap script-based language hint. Returns a best-guess code or "und" when
// ambiguous. Always runs locally — no API call. Used to tag Message.sourceLanguage
// at send time and to short-circuit translation when source already matches target.
export function detectLanguageHeuristic(text: string): string {
  const sample = text.slice(0, 500);
  let han = 0, hiragana = 0, katakana = 0, hangul = 0, arabic = 0, cyrillic = 0, devanagari = 0, latin = 0;

  for (const ch of sample) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x4e00 && code <= 0x9fff) han++;
    else if (code >= 0x3040 && code <= 0x309f) hiragana++;
    else if (code >= 0x30a0 && code <= 0x30ff) katakana++;
    else if (code >= 0xac00 && code <= 0xd7af) hangul++;
    else if ((code >= 0x0600 && code <= 0x06ff) || (code >= 0x0750 && code <= 0x077f)) arabic++;
    else if (code >= 0x0400 && code <= 0x04ff) cyrillic++;
    else if (code >= 0x0900 && code <= 0x097f) devanagari++;
    else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) latin++;
  }

  if (hiragana + katakana > 0) return "ja";
  if (hangul > 0) return "ko";
  if (han > 0) return "zh";
  if (arabic > 0) return "ar";
  if (devanagari > 0) return "hi";
  if (cyrillic > 0 && cyrillic > latin) return "ru";
  if (latin > 0) return "en"; // assume English as the common Latin-script default
  return "und";
}

function cacheKey(text: string, target: string, dialect?: string): string {
  const hash = createHash("sha1").update(text).digest("hex");
  return `${CACHE_PREFIX}${hash}:${target}:${dialect ?? ""}`;
}

async function readCache(key: string): Promise<TranslateResult | null> {
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as { ciphertext: string; iv: string; authTag: string };
    const parsed = JSON.parse(decrypt(envelope)) as { sourceLang: string; translated: string };
    return { ...parsed, fromCache: true };
  } catch {
    return null;
  }
}

async function writeCache(key: string, value: TranslateResult): Promise<void> {
  try {
    // Translated message content gets the same at-rest protection as the
    // Message table — never plaintext in Redis.
    const envelope = encrypt(
      JSON.stringify({ sourceLang: value.sourceLang, translated: value.translated }),
    );
    await redis.set(key, JSON.stringify(envelope), "EX", CACHE_TTL_SECONDS);
  } catch {
    // cache is best-effort
  }
}

/**
 * One-shot startup sweep: delete all v1 (plaintext, 7-day) translation cache
 * entries. They were an undisclosed second storage location for message
 * content; v2 entries are encrypted with a 24h TTL.
 */
export async function purgeLegacyTranslationCache(): Promise<number> {
  let cursor = "0";
  let deleted = 0;
  try {
    do {
      const [next, keys] = await redis.scan(
        cursor,
        "MATCH",
        `${LEGACY_CACHE_PREFIX}*`,
        "COUNT",
        500,
      );
      cursor = next;
      if (keys.length > 0) {
        deleted += await redis.del(...keys);
      }
    } while (cursor !== "0");
  } catch (err) {
    console.error("[translate] legacy cache purge failed:", err);
  }
  return deleted;
}

interface TranslateOptions {
  dialect?: string;
  knownSourceLang?: string;
}

/**
 * Detect and translate `text` into `targetLang`. Never throws — on any error
 * returns the input unchanged with sourceLang="und" so callers can display the
 * original safely (fail-open).
 */
export async function translateText(
  text: string,
  targetLang: string,
  opts: TranslateOptions = {},
): Promise<TranslateResult> {
  if (!text || text.trim().length === 0) {
    return { sourceLang: "und", translated: text };
  }
  if (!isSupportedLanguage(targetLang)) {
    return { sourceLang: "und", translated: text };
  }

  // Short-circuit if we already know source == target.
  if (opts.knownSourceLang && opts.knownSourceLang === targetLang) {
    return { sourceLang: targetLang, translated: text };
  }

  const key = cacheKey(text, targetLang, opts.dialect);
  const cached = await readCache(key);
  if (cached) return cached;

  // Stub mode (no API key): best-effort heuristic detection, pass text through.
  if (isStubMode()) {
    const detected = opts.knownSourceLang ?? detectLanguageHeuristic(text);
    const result: TranslateResult = {
      sourceLang: detected,
      translated: detected === targetLang ? text : `[${targetLang}] ${text}`,
    };
    await writeCache(key, result);
    return result;
  }

  try {
    const client = getClient();

    const targetName = LANGUAGE_NAMES[targetLang as SupportedLanguage];
    const dialectHint = opts.dialect ? ` (dialect: ${opts.dialect})` : "";
    const sourceHint = opts.knownSourceLang && opts.knownSourceLang !== "und"
      ? ` The message is in ${opts.knownSourceLang}.`
      : "";

    const systemPrompt =
      `You are a translator for an emotional-support peer messaging app. ` +
      `Translate the user's message into ${targetName}${dialectHint}. ` +
      `Preserve tone, warmth, and any emoji. Do not add commentary or disclaimers.${sourceHint} ` +
      `Respond ONLY with valid JSON: {"source_lang":"<ISO 639-1 code>","translated":"<text>"}`;

    const response = await client.chat.completions.create({
      model: config.OPENROUTER_MODEL,
      max_tokens: Math.min(1024, Math.ceil(text.length * 1.5) + 128),
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) throw new Error("empty response");
    const parsed = JSON.parse(raw) as { source_lang?: string; translated?: string };
    if (!parsed.translated) throw new Error("missing translated field");

    const result: TranslateResult = {
      sourceLang: (parsed.source_lang ?? detectLanguageHeuristic(text)).slice(0, 10),
      translated: parsed.translated,
    };
    await writeCache(key, result);
    return result;
  } catch (err) {
    console.error("translate failed, falling back to original:", err);
    return {
      sourceLang: opts.knownSourceLang ?? detectLanguageHeuristic(text),
      translated: text,
    };
  }
}


/**
 * Translate many messages in parallel, reusing the same target/dialect.
 * Best-effort; any single failure falls back to the original text.
 */
export async function translateBatch(
  items: Array<{ id: string; text: string; sourceLang?: string | null }>,
  targetLang: string,
  opts: { dialect?: string } = {},
): Promise<Map<string, TranslateResult>> {
  const results = await Promise.all(
    items.map(async (item) => {
      const r = await translateText(item.text, targetLang, {
        dialect: opts.dialect,
        knownSourceLang: item.sourceLang ?? undefined,
      });
      return [item.id, r] as const;
    }),
  );
  return new Map(results);
}
