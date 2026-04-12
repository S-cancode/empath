/* eslint-disable no-console */
// Real-API smoke test for the translation stack.
// Run via `railway run npx tsx scripts/translate-smoke.ts`.
// Requires OPENAI_API_KEY (OpenRouter key) in the env. No DB writes.

import { config } from "../src/config/index.js";
import { translateText, inferUserLocaleFromText } from "../src/translate/translate.service.js";
import { redis } from "../src/lib/redis.js";
import { prisma } from "../src/lib/prisma.js";

async function main(): Promise<void> {
  console.log("Model:", config.OPENROUTER_MODEL);
  console.log("Base URL:", config.OPENAI_BASE_URL ?? "(openai default)");
  console.log("API key present:", Boolean(config.OPENAI_API_KEY) && config.OPENAI_API_KEY !== "sk-stub-placeholder-key");
  console.log();

  const samples: Array<{ text: string; target: string; label: string }> = [
    { text: "Hola, ¿cómo estás? Hoy me siento un poco triste.", target: "en", label: "es (Mexican/Castilian?) → en" },
    { text: "こんにちは、今日は少し落ち込んでいます。", target: "en", label: "ja → en" },
    { text: "Ik voel me vandaag een beetje moe en verdrietig.", target: "en", label: "nl → en (Latin-script, heuristic misses)" },
    { text: "I feel overwhelmed by work deadlines this week.", target: "es", label: "en → es" },
    { text: "مرحبا، كيف حالك اليوم؟", target: "en", label: "ar → en" },
  ];

  console.log("=== translateText ===");
  for (const s of samples) {
    try {
      const r = await translateText(s.text, s.target);
      console.log(`[${s.label}]`);
      console.log(`  src=${r.sourceLang} cached=${r.fromCache ?? false}`);
      console.log(`  in:  ${s.text}`);
      console.log(`  out: ${r.translated}`);
    } catch (err) {
      console.error(`  FAILED: ${(err as Error).message}`);
    }
  }

  console.log();
  console.log("=== inferUserLocaleFromText (in-memory user stand-in) ===");
  // Monkey-patch prisma.user for the smoke test so we don't touch the real DB.
  const fakeUser = {
    preferredLanguage: null as string | null,
    preferredDialect: null as string | null,
    languageDetectedAt: null as Date | null,
  };
  (prisma as any).user.findUnique = async () => fakeUser;
  (prisma as any).user.update = async ({ data }: any) => {
    Object.assign(fakeUser, data);
    return fakeUser;
  };

  const inferSamples = [
    { text: "Oye wey, ¿qué onda? Todo tranquilo por acá.", expected: "es (es-MX likely)" },
    { text: "Howdy y'all, reckon we oughta head home.", expected: "en (en-US likely)" },
    { text: "Alles klar, ich muss noch einkaufen gehen.", expected: "de" },
  ];

  for (const s of inferSamples) {
    // Clear prior state so each sample triggers a fresh inference.
    fakeUser.preferredLanguage = null;
    fakeUser.preferredDialect = null;
    fakeUser.languageDetectedAt = null;
    try {
      // Use distinct fake userIds so the Redis debounce lock doesn't collide.
      const id = `smoke-${Math.random().toString(36).slice(2, 10)}`;
      const r = await inferUserLocaleFromText(id, s.text);
      console.log(`[expected ~${s.expected}]`);
      console.log(`  in:  ${s.text}`);
      console.log(`  out: ${JSON.stringify(r)}`);
    } catch (err) {
      console.error(`  FAILED: ${(err as Error).message}`);
    }
  }

  await redis.quit().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
