/* eslint-disable no-console */
// Minimal live validator. Hits OpenRouter with the production OPENAI_API_KEY
// via the OpenAI SDK, exercising the exact prompts used by translate.service.
// Avoids importing the full service so we don't need Redis/Postgres reachable.
// Run: railway run npx tsx scripts/translate-validate.ts
import OpenAI from "openai";

const MODEL = process.env.OPENROUTER_MODEL ?? "google/gemini-2.0-flash-001";
const BASE_URL = process.env.OPENAI_BASE_URL
  ?? (MODEL.includes("/") ? "https://openrouter.ai/api/v1" : undefined);
const API_KEY = process.env.OPENAI_API_KEY;

if (!API_KEY) {
  console.error("OPENAI_API_KEY not set — run via `railway run`.");
  process.exit(1);
}

const client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });

async function translate(text: string, targetLang: string): Promise<{ source_lang?: string; translated?: string }> {
  const LANG_NAMES: Record<string, string> = {
    en: "English", es: "Spanish", fr: "French", de: "German",
    pt: "Portuguese", it: "Italian", zh: "Chinese", ja: "Japanese",
    ko: "Korean", ar: "Arabic", hi: "Hindi", ru: "Russian",
  };
  const systemPrompt =
    `You are a translator for an emotional-support peer messaging app. ` +
    `Translate the user's message into ${LANG_NAMES[targetLang] ?? targetLang}. ` +
    `Preserve tone, warmth, and any emoji. Do not add commentary or disclaimers. ` +
    `Respond ONLY with valid JSON: {"source_lang":"<ISO 639-1 code>","translated":"<text>"}`;
  const res = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 512,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
  });
  const raw = res.choices[0]?.message?.content ?? "";
  try {
    return JSON.parse(raw);
  } catch {
    return { translated: `[parse-fail] ${raw.slice(0, 80)}` };
  }
}

async function detectLocale(text: string): Promise<{ language?: string | null; dialect?: string | null }> {
  const systemPrompt =
    `You identify the language and regional dialect of short user-written messages. ` +
    `Respond ONLY with valid JSON: {"language":"<ISO 639-1 code>","dialect":"<BCP-47 tag like en-GB, es-MX, pt-BR, or null if not discernible>"}. ` +
    `If the text is too short or ambiguous to judge confidently, set language to null.`;
  const res = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 64,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text.slice(0, 500) },
    ],
  });
  const raw = res.choices[0]?.message?.content ?? "";
  try {
    return JSON.parse(raw);
  } catch {
    return { language: null, dialect: null };
  }
}

async function main(): Promise<void> {
  console.log("Model:", MODEL);
  console.log("Base URL:", BASE_URL ?? "(openai default)");
  console.log("Key prefix:", API_KEY!.slice(0, 8) + "...");
  console.log();

  const translateCases = [
    { text: "Hola, ¿cómo estás? Hoy me siento un poco triste.", target: "en" },
    { text: "こんにちは、今日は少し落ち込んでいます。", target: "en" },
    { text: "Ik voel me vandaag een beetje moe en verdrietig.", target: "en" },
    { text: "I feel overwhelmed by work deadlines this week.", target: "es" },
    { text: "مرحبا، كيف حالك اليوم؟", target: "en" },
  ];

  console.log("=== translate ===");
  for (const c of translateCases) {
    const t0 = Date.now();
    try {
      const out = await translate(c.text, c.target);
      console.log(`[${out.source_lang} → ${c.target}] (${Date.now() - t0}ms)`);
      console.log("  in: ", c.text);
      console.log("  out:", out.translated);
    } catch (err) {
      console.error("  FAILED:", (err as Error).message);
    }
  }

  console.log();
  console.log("=== detectLocale ===");
  const detectCases = [
    { text: "Oye wey, ¿qué onda? Todo tranquilo por acá.", note: "expect ~es-MX" },
    { text: "Howdy y'all, reckon we oughta head home.", note: "expect ~en-US" },
    { text: "Alles klar, ich muss noch einkaufen gehen.", note: "expect ~de" },
    { text: "Vou dar um rolê na praia mais tarde, parça.", note: "expect ~pt-BR" },
    { text: "Crikey, the footy's on in half an hour, mate.", note: "expect ~en-AU" },
  ];
  for (const c of detectCases) {
    const t0 = Date.now();
    try {
      const out = await detectLocale(c.text);
      console.log(`[${c.note}] (${Date.now() - t0}ms)`);
      console.log("  in: ", c.text);
      console.log("  out:", JSON.stringify(out));
    } catch (err) {
      console.error("  FAILED:", (err as Error).message);
    }
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
