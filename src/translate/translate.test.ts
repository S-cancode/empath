import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/index.js", () => ({
  config: {
    OPENAI_API_KEY: "sk-stub-placeholder-key",
    OPENAI_BASE_URL: undefined,
    NODE_ENV: "test",
  },
}));

const redisStrings = new Map<string, string>();

vi.mock("../lib/redis.js", () => ({
  redis: {
    get: vi.fn(async (key: string) => redisStrings.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      redisStrings.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (key: string) => {
      redisStrings.delete(key);
      return 1;
    }),
  },
}));

import {
  detectLanguageHeuristic,
  translateText,
  translateBatch,
  isSupportedLanguage,
  SUPPORTED_LANGUAGES,
} from "./translate.service.js";

describe("detectLanguageHeuristic", () => {
  it("detects Japanese via hiragana/katakana", () => {
    expect(detectLanguageHeuristic("こんにちは、元気ですか？")).toBe("ja");
  });

  it("detects Korean via hangul", () => {
    expect(detectLanguageHeuristic("안녕하세요 반갑습니다")).toBe("ko");
  });

  it("detects Chinese via Han without kana", () => {
    expect(detectLanguageHeuristic("你好，我很高兴认识你")).toBe("zh");
  });

  it("detects Arabic", () => {
    expect(detectLanguageHeuristic("مرحبا كيف حالك")).toBe("ar");
  });

  it("detects Hindi (Devanagari)", () => {
    expect(detectLanguageHeuristic("नमस्ते आप कैसे हैं")).toBe("hi");
  });

  it("detects Russian (Cyrillic)", () => {
    expect(detectLanguageHeuristic("Здравствуйте, как дела")).toBe("ru");
  });

  it("falls back to English for Latin script", () => {
    expect(detectLanguageHeuristic("Hola, ¿cómo estás?")).toBe("en");
  });

  it("returns und for empty/symbolic input", () => {
    expect(detectLanguageHeuristic("!!! 123 ???")).toBe("und");
  });
});

describe("isSupportedLanguage", () => {
  it("accepts known codes", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(isSupportedLanguage(lang)).toBe(true);
    }
  });

  it("rejects unknown codes", () => {
    expect(isSupportedLanguage("xx")).toBe(false);
    expect(isSupportedLanguage("")).toBe(false);
  });
});

describe("translateText (stub mode)", () => {
  beforeEach(() => {
    redisStrings.clear();
  });

  it("returns text unchanged with detected source when target matches", async () => {
    const r = await translateText("Hello there", "en");
    expect(r.sourceLang).toBe("en");
    expect(r.translated).toBe("Hello there");
  });

  it("tags translated output in stub mode when target differs", async () => {
    const r = await translateText("こんにちは", "en");
    expect(r.sourceLang).toBe("ja");
    expect(r.translated).toBe("[en] こんにちは");
  });

  it("short-circuits when knownSourceLang equals target", async () => {
    const r = await translateText("any text", "es", { knownSourceLang: "es" });
    expect(r.sourceLang).toBe("es");
    expect(r.translated).toBe("any text");
  });

  it("returns input unchanged for unsupported target languages", async () => {
    const r = await translateText("Hello", "xx");
    expect(r.translated).toBe("Hello");
    expect(r.sourceLang).toBe("und");
  });

  it("returns empty text unchanged", async () => {
    const r = await translateText("", "en");
    expect(r.translated).toBe("");
  });

  it("caches results across calls", async () => {
    const first = await translateText("Ciao", "ja");
    expect(first.fromCache).toBeUndefined();
    const second = await translateText("Ciao", "ja");
    expect(second.fromCache).toBe(true);
    expect(second.translated).toBe(first.translated);
  });
});

describe("translateBatch", () => {
  beforeEach(() => {
    redisStrings.clear();
  });

  it("translates multiple items in parallel and preserves ids", async () => {
    const results = await translateBatch(
      [
        { id: "m1", text: "Hello", sourceLang: "en" },
        { id: "m2", text: "Bonjour", sourceLang: "fr" },
      ],
      "es",
    );
    expect(results.size).toBe(2);
    expect(results.get("m1")?.translated).toBe("[es] Hello");
    expect(results.get("m2")?.translated).toBe("[es] Bonjour");
  });

  it("skips translation when source matches target", async () => {
    const results = await translateBatch(
      [{ id: "m1", text: "Hola", sourceLang: "es" }],
      "es",
    );
    expect(results.get("m1")?.translated).toBe("Hola");
  });
});
