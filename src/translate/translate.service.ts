import OpenAI from "openai";
import { createHash } from "node:crypto";
import { config } from "../config/index.js";
import { redis } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";

const STUB_KEY = "sk-stub-placeholder-key";
const CACHE_PREFIX = "translate:v1:";
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const INFER_LOCK_PREFIX = "translate:infer:";
const INFER_LOCK_TTL_SECONDS = 60;
const LANGUAGE_INFER_TTL_DAYS = 30;
const INFER_MIN_SAMPLE_CHARS = 30;

// Languages whose script is unambiguous. If detectLanguageHeuristic returns
// one of these, we trust it over the LLM — it's cheap, deterministic, and
// impossible to game with a pasted one-off message.
const UNAMBIGUOUS_SCRIPT_LANGS = new Set(["ja", "ko", "zh", "ar", "hi", "ru"]);

function heuristicScriptFamily(lang: string): "cjk" | "kana" | "hangul" | "arabic" | "devanagari" | "cyrillic" | "latin" | "und" {
  switch (lang) {
    case "ja": return "kana";
    case "ko": return "hangul";
    case "zh": return "cjk";
    case "ar": return "arabic";
    case "hi": return "devanagari";
    case "ru": return "cyrillic";
    case "en": case "es": case "fr": case "de": case "pt": case "it": return "latin";
    default: return "und";
  }
}

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
    const parsed = JSON.parse(raw) as { sourceLang: string; translated: string };
    return { ...parsed, fromCache: true };
  } catch {
    return null;
  }
}

async function writeCache(key: string, value: TranslateResult): Promise<void> {
  try {
    await redis.set(
      key,
      JSON.stringify({ sourceLang: value.sourceLang, translated: value.translated }),
      "EX",
      CACHE_TTL_SECONDS,
    );
  } catch {
    // cache is best-effort
  }
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

export interface InferredLocale {
  language: string | null;
  dialect: string | null;
}

function normalizeDialect(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, 20);
  if (!trimmed || trimmed === "und") return null;
  // Prefer BCP-47 shape like "es-MX": lowercase language, uppercase region.
  const match = trimmed.match(/^([a-zA-Z]{2,3})(?:[-_]([a-zA-Z]{2,4}))?$/);
  if (!match) return trimmed;
  const lang = match[1].toLowerCase();
  const region = match[2]?.toUpperCase();
  return region ? `${lang}-${region}` : lang;
}

async function callLocaleDetector(text: string): Promise<InferredLocale> {
  if (isStubMode()) {
    const lang = detectLanguageHeuristic(text);
    return { language: lang === "und" ? null : lang, dialect: null };
  }

  const systemPrompt =
    `You identify the language and regional dialect of short user-written messages. ` +
    `Respond ONLY with valid JSON: {"language":"<ISO 639-1 code>","dialect":"<BCP-47 tag like en-GB, es-MX, pt-BR, or null if not discernible>"}. ` +
    `If the text is too short or ambiguous to judge confidently, set language to null.`;

  const client = getClient();
  const response = await client.chat.completions.create({
    model: config.OPENROUTER_MODEL,
    max_tokens: 64,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text.slice(0, 500) },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("empty response");
  const parsed = JSON.parse(raw) as { language?: string | null; dialect?: string | null };
  return {
    language: parsed.language ? parsed.language.toLowerCase().slice(0, 10) : null,
    dialect: normalizeDialect(parsed.dialect),
  };
}

/**
 * Infer the user's preferred language + dialect from a sample they wrote, and
 * persist it to their User row. Intended to be called fire-and-forget from
 * sendAsyncMessage so the first few messages bootstrap the user's locale
 * without any UI.
 *
 * - Short-circuits if the user already has a preferredLanguage that was
 *   detected within the last LANGUAGE_INFER_TTL_DAYS days.
 * - Uses a Redis debounce lock so concurrent sends don't stampede the LLM.
 * - Fail-open: any error swallows silently — the message was already delivered.
 */
export async function inferUserLocaleFromText(
  userId: string,
  sampleText: string,
): Promise<InferredLocale | null> {
  const trimmed = sampleText?.trim() ?? "";
  if (trimmed.length === 0) return null;

  // Cheap up-front heuristic: if the message is in an unambiguous non-Latin
  // script we trust that over the LLM regardless of sample length.
  const heuristicLang = detectLanguageHeuristic(trimmed);
  const heuristicIsUnambiguous = UNAMBIGUOUS_SCRIPT_LANGS.has(heuristicLang);

  // Otherwise require a longer sample — short Latin-script messages mis-infer.
  if (!heuristicIsUnambiguous && trimmed.length < INFER_MIN_SAMPLE_CHARS) return null;

  // Acquire debounce lock — NX ensures only one caller per minute actually runs.
  const lockKey = `${INFER_LOCK_PREFIX}${userId}`;
  let gotLock = false;
  try {
    const res = await redis.set(lockKey, "1", "EX", INFER_LOCK_TTL_SECONDS, "NX");
    gotLock = res === "OK";
  } catch {
    // If Redis is unavailable, fall through — we'd rather duplicate than drop.
    gotLock = true;
  }
  if (!gotLock) return null;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        preferredLanguage: true,
        preferredDialect: true,
        languageDetectedAt: true,
      },
    });
    if (!user) return null;

    // Script-mismatch self-correction: if the user has a stored preferred
    // language but THIS message is in an unambiguous script that doesn't
    // match it, invalidate the stored value and re-detect. Protects against
    // a user being locked into a language they don't speak because they
    // pasted one test message in it earlier.
    if (
      heuristicIsUnambiguous &&
      user.preferredLanguage &&
      heuristicScriptFamily(user.preferredLanguage) !== heuristicScriptFamily(heuristicLang)
    ) {
      user.preferredLanguage = null;
      user.preferredDialect = null;
      user.languageDetectedAt = null;
    }

    // If we already have a recently-detected language, skip.
    const ttlMs = LANGUAGE_INFER_TTL_DAYS * 24 * 60 * 60 * 1000;
    if (
      user.preferredLanguage &&
      user.languageDetectedAt &&
      Date.now() - user.languageDetectedAt.getTime() < ttlMs
    ) {
      return {
        language: user.preferredLanguage,
        dialect: user.preferredDialect ?? null,
      };
    }

    // Unambiguous-script path: trust the heuristic, skip the LLM entirely.
    let detected: InferredLocale;
    if (heuristicIsUnambiguous) {
      detected = { language: heuristicLang, dialect: null };
    } else {
      detected = await callLocaleDetector(trimmed);
    }
    if (!detected.language) return null;

    await prisma.user.update({
      where: { id: userId },
      data: {
        preferredLanguage: detected.language,
        preferredDialect: detected.dialect,
        languageDetectedAt: new Date(),
      },
    });

    return detected;
  } catch (err) {
    console.error("inferUserLocaleFromText failed:", err);
    return null;
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
